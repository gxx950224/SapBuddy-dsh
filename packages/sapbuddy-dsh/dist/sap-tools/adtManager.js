import { executionSignal, checkCancelled, runCleanup, waitForReady } from "./execution.js";
import { createManagedAdtClient } from "./http-client.js";
import { createSSLConfig, session_types } from "abap-adt-api";
import { AsyncLocalStorage } from "node:async_hooks";
import { getConfig } from "./config.js";
const pool = new Map();
/** 会话"新鲜度"：该连接最近一次确认可用（login 成功）的时间戳。
 *  写操作前据此决定是否重新登录——见 ensureFreshSession。 */
const sessionOkAt = new Map();
/** 写操作复用同一会话的时间窗。超过它就重登录，换一份新的 cookie + CSRF 令牌。
 *  SAP 侧会话空闲超时（ICM/ADT 会话）后 cookie 与令牌都会失效，而 stateful 写请求
 *  不会被 SDK 自动重建，于是出现"读正常、写一律 CSRF 令牌验证失败"的僵局。
 *  5 分钟足以覆盖一轮连续写（create→replace→activate），又不至于拿着可能过期的会话去写。 */
const SESSION_REUSE_MS = 5 * 60_000;
/** 刷新会话（重新登录）的单独时限：写序列在独占锁内，登录不能吃掉整段写的时间预算 */
const SESSION_LOGIN_TIMEOUT_MS = 30_000;
/** 连接配置版本号：resetClients() 递增，写序列据此判断"重试期间用户是否切了系统" */
let configEpoch = 0;
/**
 * 每连接读写门（reader-writer gate）：
 * - 读（stateless 查询，如 searchObject/getObjectSource/runQuery）可并发，但每个连接最多
 *   READ_CONCURRENCY 个同时进行——防止一次分析几十个对象时对 SAP 系统打出请求洪峰。
 * - 写（编辑/激活：lock→setObjectSource→activate→unLock，需 stateful 会话）必须独占：
 *   同一连接上任何读、任何其它写都要等它完成，避免 cookie jar / stateful 会话被踩踏
 *   （解锁命中错误会话 → 残留编辑锁）。
 * - 写内的读（如写入后回读校验、搜索、语法检查）走 AsyncLocalStorage 记录"当前在写锁内"，
 *   直接放行（可重入），不会自锁。
 */
const READ_CONCURRENCY = 4;
const gates = new Map();
function gateFor(id) {
    let g = gates.get(id);
    if (!g) {
        g = { readers: 0, writer: false, waitingReads: [], waitingWrites: [] };
        gates.set(id, g);
    }
    return g;
}
/** 写优先放行：等待中的写比读先走，避免并发读把写饿死 */
function pump(g) {
    if (!g.writer && g.readers === 0 && g.waitingWrites.length > 0) {
        g.writer = true;
        g.waitingWrites.shift()();
        return;
    }
    while (!g.writer && g.waitingWrites.length === 0 && g.readers < READ_CONCURRENCY && g.waitingReads.length > 0) {
        g.readers++;
        g.waitingReads.shift()();
    }
}
/** 闸门默认超时（与 ClientOptions.timeout 对齐），超时未获锁直接报错，避免永久挂死 */
const GATE_TIMEOUT_MS = 120_000;
function acquire(id, write, timeoutMs) {
    const signal = executionSignal();
    signal?.throwIfAborted();
    const g = gateFor(id);
    if (!g.writer && (write ? g.readers === 0 : g.readers < READ_CONCURRENCY && g.waitingWrites.length === 0)) {
        if (write)
            g.writer = true;
        else
            g.readers++;
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const queue = write ? g.waitingWrites : g.waitingReads;
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
        const ready = () => { cleanup(); resolve(); };
        const cancel = (error) => {
            const index = queue.indexOf(ready);
            if (index < 0)
                return;
            queue.splice(index, 1);
            cleanup();
            reject(error);
            pump(g);
        };
        const abort = () => cancel(signal?.reason ?? new Error("操作已取消"));
        const timer = setTimeout(() => cancel(new Error(`连接 ${id} 锁等待超时`)), timeoutMs);
        queue.push(ready);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted)
            abort();
    });
}
function acquireRead(id, timeoutMs = GATE_TIMEOUT_MS) { return acquire(id, false, timeoutMs); }
function releaseRead(id) {
    const g = gateFor(id);
    g.readers--;
    pump(g);
}
function acquireWrite(id, timeoutMs = GATE_TIMEOUT_MS) { return acquire(id, true, timeoutMs); }
function releaseWrite(id) {
    const g = gateFor(id);
    g.writer = false;
    pump(g);
}
/** 记录"当前异步执行流正持有哪些连接的写锁"，用于写锁内读放行（可重入） */
const writeLockContext = new AsyncLocalStorage();
/** 独占执行（写）：同一连接 id 上的操作排他，同时阻止该连接的并发读。 */
export function withConnMutex(connId, fn) {
    const id = connId.toLowerCase();
    const store = writeLockContext.getStore();
    if (store?.has(id))
        return Promise.resolve().then(fn); // 已在该连接写锁内（可重入），直接执行
    return new Promise((resolve, reject) => {
        acquireWrite(id).then(() => {
            const next = new Set(store ?? []);
            next.add(id);
            writeLockContext.run(next, () => {
                Promise.resolve()
                    .then(fn)
                    .then(resolve, reject)
                    .finally(() => releaseWrite(id));
            });
        }, reject);
    });
}
/** 并发执行（读）：同连接最多 READ_CONCURRENCY 个同时进行；写锁内调用直接放行。 */
export function withReadLock(connId, fn) {
    const id = connId.toLowerCase();
    const store = writeLockContext.getStore();
    if (store?.has(id))
        return Promise.resolve().then(fn); // 写锁内的读（回读校验等），不排队
    return new Promise((resolve, reject) => {
        acquireRead(id).then(() => {
            Promise.resolve()
                .then(fn)
                .then(resolve, reject)
                .finally(() => releaseRead(id));
        }, reject);
    });
}
/** 全连接独占执行：同时持有所有已配置连接的写锁，运行期间任何连接的读/写都被阻塞。
 *  用于 get_connected_systems —— 连接切换后必须单独执行，其他请求不能与它并行。
 *  注意：按 id 字典序加锁避免 ABBA 死锁；顺序逐个获取，中途失败释放已持有的锁。 */
export function withAllConnMutex(fn) {
    const store = writeLockContext.getStore();
    // 按 id 字典序加锁，保证所有调用路径顺序一致，避免 ABBA 死锁
    const ids = getConfig()
        .connections.map((c) => c.id.toLowerCase())
        .sort();
    const need = ids.filter((id) => !store?.has(id));
    if (need.length === 0)
        return Promise.resolve().then(fn); // 已全部持锁（可重入）
    const acquired = [];
    const releaseAll = () => {
        // 倒序释放（非必须，与加锁对称，习惯做法）
        for (let i = acquired.length - 1; i >= 0; i--) {
            releaseWrite(acquired[i]);
        }
    };
    return new Promise((resolve, reject) => {
        // 顺序逐个加锁：保证失败时已获得的锁能被释放，避免部分持锁泄漏
        const acquireNext = (idx) => {
            if (idx >= need.length) {
                // 全部获得，执行业务
                const next = new Set(store ?? []);
                need.forEach((id) => next.add(id));
                writeLockContext.run(next, () => {
                    Promise.resolve()
                        .then(fn)
                        .then(resolve, reject)
                        .finally(releaseAll);
                });
                return;
            }
            acquireWrite(need[idx])
                .then(() => {
                acquired.push(need[idx]);
                acquireNext(idx + 1);
            })
                .catch((err) => {
                releaseAll();
                reject(err);
            });
        };
        acquireNext(0);
    });
}
/**
 * 标记连接为不健康：从池中移除缓存（客户端 + 类别），下次调用自动重新 login。
 * 会话自愈的核心——连接级故障（401/5xx/网络错误/CSRF 令牌失效）不保留坏会话，宁可重连。
 */
export function markConnectionUnhealthy(connId) {
    const id = connId.toLowerCase();
    pool.delete(id);
    clientCategoryCache.delete(id);
    sessionOkAt.delete(id);
}
/** abap-adt-api 的 AdtCsrfException 只带一个 Symbol typeID，没有 status/code */
const CSRF_TYPE_ID = Symbol.for("BAD CSRF");
/**
 * 是否 CSRF 令牌校验失败。
 * 注意：SDK 的 AdtCsrfException 是裸 Error（没有 status），所以 isConnectionError
 * 靠 status/网络关键字判断时会漏掉它——这正是"会话坏了却永远不重连"的根源。
 */
export function isCsrfError(err) {
    if (!err || typeof err !== "object")
        return false;
    try {
        if (err.typeID === CSRF_TYPE_ID)
            return true;
    }
    catch { /* getter 抛错按非 CSRF 处理 */ }
    const msg = `${err.message ?? ""} ${err.parent?.message ?? ""}`;
    return /CSRF/i.test(msg);
}
/** 写工具把 SAP 错误文本当返回值（不抛异常）时，从文本里识别 CSRF 令牌校验失败。
 *  只认令牌校验：这类请求在 SAP 侧一定没有执行，重放才是安全的；
 *  "会话已失效/会话已过期"这类说法不保证请求未执行，不能据此重放写操作。 */
function isCsrfFailureText(text) {
    return /CSRF|令牌验证/i.test(String(text).slice(0, 800));
}
/** 判断是否连接级故障（会话失效/网络断了/CSRF 令牌失效），而非业务错误 */
export function isConnectionError(err) {
    if (!(err instanceof Error))
        return false;
    if (isCsrfError(err))
        return true;
    const status = err.status;
    if (typeof status === "number")
        return status === 401 || status === 403 || status >= 500;
    return /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EPIPE|socket hang up|fetch failed|Failed to fetch|network error|read ECONNRESET|write EPIPE|CERT_|self-signed/.test(err.message);
}
/** 包装客户端：方法抛连接级错误时自动标记不健康，实现自愈 */
/**
 * 只读方法白名单：这些调用是 stateless 查询，可安全并发（受 READ_CONCURRENCY 限制）。
 * 不在白名单的方法一律按写处理（独占）。宁可把读误当写串行化，也不可把写放行并发。
 */
const READ_METHODS = new Set([
    "searchObject",
    "getObjectSource",
    "runQuery",
    "objectStructure",
    "objectStructureElements",
    "revisions",
    "usageReferences",
    "usageReferenceSnippets",
    "transportInfo",
    "getTextElements",
    "mainPrograms",
    "syntaxCheck",
    "syntaxCheckTypes",
    "getDomainProperties",
    "getDataElementProperties",
    "findObjectPath",
    "unitTestRun",
    "unitTestEvaluation",
    "unitTestOccurrenceMarkers",
    "atcCustomizing",
    "atcCheckVariant",
    "createAtcRun",
    "atcWorklists",
    "atcUsers",
    "atcDocumentation",
    "atcExemptProposal",
    "dumps",
    "feeds",
    "tracesList",
    "tracesListRequests",
    "tracesHitList",
    "tracesDbAccess",
    "tracesStatements",
    "userTransports",
    "transportDetails",
    "transportsByConfig",
    "systemUsers",
    "adtDiscovery",
    "adtCoreDiscovery",
    "adtCompatibiliyGraph",
    "tableContents",
    "loadTypes",
    "nodeContents",
    "reentranceTicket",
    "objectRegistrationInfo",
    "inactiveObjects",
    "classComponents",
    "fragmentMappings",
    "objectTypes",
    "prettyPrinter",
    "prettyPrinterSetting",
    "codeCompletion",
    "codeCompletionElement",
    "codeCompletionFull",
    "findDefinition",
    "fixProposals",
    "fixEdits",
    "typeHierarchy",
    "transportConfigurations",
    "getTransportConfiguration",
    "ddicElement",
    "ddicRepositoryAccess",
    "annotationDefinitions",
    "bindingDetails",
    "packageSearchHelp",
    "gitRepos",
    "gitExternalRepoInfo",
    "checkRepo",
    "remoteRepoInfo",
    "stageRepo",
    "transportReference",
    "hasTransportConfig",
    "featureDetails",
    "collectionFeatureDetails",
    "findCollectionByUrl",
    "abapDocumentation",
    "objectEnhancements",
]);
/** 记录"当前写序列里已经成功执行过会改数据的方法"，用于判断 CSRF 重试是否安全。
 *  CSRF 校验失败的请求在 SAP 侧没有执行，但只要本序列已经成功跑过 lock/setObjectSource
 *  这类会落库的调用，重试就可能重复写入或留下编辑锁，此时绝不重试。 */
const writeProgress = new AsyncLocalStorage();
/** 不属于"会改数据"的会话维护方法：它们成功不代表 SAP 侧已有改动 */
const SESSION_ONLY_METHODS = new Set(["login", "logout", "dropSession", "keepAlive"]);
function noteCallSuccess(methodName) {
    if (READ_METHODS.has(methodName) || SESSION_ONLY_METHODS.has(methodName))
        return;
    const store = writeProgress.getStore();
    if (store)
        store.modifying++;
}
/** 返回值里出现这些标记，说明本次写已经落库，绝不能再重放 */
function looksApplied(text) {
    return /✅|已保存|已写入|已创建|已激活/.test(String(text).slice(0, 800));
}
function wrapSelfHeal(client, connId) {
    return new Proxy(client, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== "function")
                return value;
            const m = String(prop);
            return (...args) => {
                const run = () => {
                    checkCancelled();
                    try {
                        const result = value.apply(target, args);
                        if (result && typeof result.then === "function") {
                            return result.then((ok) => { noteCallSuccess(m); return ok; }, (err) => {
                                if (isConnectionError(err))
                                    markConnectionUnhealthy(connId);
                                throw err;
                            });
                        }
                        noteCallSuccess(m);
                        return result;
                    }
                    catch (err) {
                        if (isConnectionError(err))
                            markConnectionUnhealthy(connId);
                        throw err;
                    }
                };
                // 读走并发闸门，写走独占闸门（写锁内再调读/写均可重入，不死锁）
                if (["unLock", "dropSession", "logout"].includes(m))
                    return runCleanup(() => withConnMutex(connId, run));
                if (READ_METHODS.has(m))
                    return withReadLock(connId, run);
                return withConnMutex(connId, run);
            };
        },
    });
}
/** 客户端类别缓存：connId → T000.CCCATEGORY（P=生产 T=测试 C=定制 D=演示 E=培训/教育 S=SAP参考） */
const clientCategoryCache = new Map();
/**
 * 获取客户端类别（T000.CCCATEGORY），按连接缓存
 * 查询失败时抛出（fail-closed）
 */
export function getClientCategory(connId) {
    const id = connId.toLowerCase();
    let p = clientCategoryCache.get(id);
    if (!p) {
        p = (async () => {
            const conf = getConnection(id);
            const client = await getClient(id);
            const result = await client.runQuery(`SELECT MANDT, CCCATEGORY FROM T000 WHERE MANDT = '${conf.client}'`, 1, true);
            const row = (result?.values?.[0] ?? {});
            return String(row.CCCATEGORY ?? "").toUpperCase();
        })().catch((err) => {
            clientCategoryCache.delete(id);
            throw err;
        });
        clientCategoryCache.set(id, p);
    }
    return p;
}
/** T000.CCCATEGORY 官方角色标签 */
export const CLIENT_CATEGORY_LABELS = {
    P: "生产",
    T: "测试",
    C: "定制(客户开发)",
    D: "演示",
    E: "培训/教育",
    S: "SAP 参考",
};
/**
 * 写操作安全守卫：只允许在开发类客户端上修改代码。
 * SAP 官方角色中仅 C（定制/客户开发）允许开发；
 * 测试（T）/生产（P）/演示（D）/培训（E）/SAP参考（S）一律拦截。
 * 默认 developmentCategories=["C"]，可用连接配置调整。
 * 无法确认类别时 fail-closed（拒绝）。
 * 连接配置 security.requireDevClient=false 可显式放行（不推荐）。
 */
export async function assertDevClient(connId) {
    const conf = getConnection(connId);
    if (conf.security?.requireDevClient === false)
        return;
    const allow = (conf.security?.developmentCategories ?? ["C"]).map((c) => c.toUpperCase());
    let category;
    try {
        category = await getClientCategory(connId);
    }
    catch (err) {
        throw new Error(`无法确认客户端 ${conf.client}（连接 ${conf.id}）的类别，已按安全策略拒绝写操作。` +
            `原因: ${err instanceof Error ? err.message : String(err)}。` +
            `如确认该连接为开发机，请检查账号的 T000 查询权限；` +
            `或在连接配置中显式设置 security.requireDevClient=false 放行（不推荐）。`);
    }
    if (allow.includes(category))
        return; // 开发类客户端放行
    const label = CLIENT_CATEGORY_LABELS[category] ?? `未知(${category || "未维护"})`;
    throw new Error(`安全拦截：客户端 ${conf.client}（连接 ${conf.id}）属于 ${label} 环境（T000.CCCATEGORY=${category || "未维护"}）。` +
        `只允许在开发类客户端（${allow.join("/")}，SAP 角色 C=定制）上修改代码，` +
        `测试/生产/演示/培训/SAP参考 客户端禁止任何写操作（创建/修改/激活/删除/DDIC 变更/传输等）。`);
}
function buildClientOptions(conf) {
    const options = { timeout: 120_000 }; // SAP 系统响应慢，放宽超时
    if (conf.url.match(/https:/i)) {
        const ssl = createSSLConfig(conf.ssl?.allowSelfSigned ?? false, conf.ssl?.customCA);
        return { ...options, ...ssl };
    }
    return options;
}
let clientFactoryOverride = null;
/** 测试专用：注入假客户端工厂（仅单测验证错误路径用，生产勿调） */
export function __setClientFactoryForTest(fn) {
    clientFactoryOverride = fn;
}
/** 测试专用：伪造连接会话"最近确认可用"的时间戳（验证会话保鲜窗口，生产勿调） */
export function __setSessionFreshAtForTest(connId, timestamp) {
    sessionOkAt.set(connId.toLowerCase(), timestamp);
}
function createAdtClient(conf) {
    if (clientFactoryOverride)
        return clientFactoryOverride(conf);
    const options = buildClientOptions(conf);
    if (conf.authMethod === "oauth" && conf.oauth) {
        const oauth = conf.oauth;
        // BearerFetcher：每次需要 token 时自动获取（含缓存由 abap-adt-api 管理）
        const fetchBearer = async () => {
            const params = new URLSearchParams({
                grant_type: "client_credentials",
                client_id: oauth.clientId,
                client_secret: oauth.clientSecret,
            });
            if (oauth.scope)
                params.set("scope", oauth.scope);
            const res = await fetch(oauth.tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params,
                signal: executionSignal() ?? AbortSignal.timeout(30_000),
            });
            if (!res.ok) {
                throw new Error(`OAuth token 获取失败: HTTP ${res.status} ${await res.text().catch(() => "")}`);
            }
            const json = (await res.json());
            return json.access_token;
        };
        return createManagedAdtClient(conf.url, conf.username, fetchBearer, conf.client, conf.language, options);
    }
    return createManagedAdtClient(conf.url, conf.username, conf.password, conf.client, conf.language, options);
}
export function getConnection(id) {
    const conf = getConfig().connections.find((c) => c.id === id.toLowerCase());
    if (!conf) {
        const available = getConfig().connections.map((c) => c.id).join(", ");
        throw new Error(`未知的连接 ID: "${id}"。可用连接: ${available || "(无)"}。请先用 get_connected_systems 工具查看可用连接。`);
    }
    return conf;
}
/** 获取（并懒初始化）ADTClient，自动 login */
export function getClient(connId) {
    checkCancelled();
    const conf = getConnection(connId);
    let managed = pool.get(conf.id);
    if (!managed) {
        const client = createAdtClient(conf);
        const entry = { client, ready: undefined };
        // 登录失败时移除缓存，允许下次重试；只清理"自己这一条"，避免并发登录失败把新建的健康条目挤掉
        entry.ready = client.login().then(() => { sessionOkAt.set(conf.id, Date.now()); }).catch((err) => {
            if (pool.get(conf.id) === entry) {
                pool.delete(conf.id);
                sessionOkAt.delete(conf.id);
            }
            throw err;
        });
        pool.set(conf.id, entry);
        managed = entry;
    }
    // 包自愈代理：连接级故障自动标记不健康 → 下次调用重新 login
    return waitForReady(managed.ready).then(() => { checkCancelled(); return wrapSelfHeal(managed.client, conf.id); });
}
/**
 * 写序列前把会话切换到"确定新鲜"的状态，返回可直接使用的客户端。
 *
 * 为什么必须显式做：
 * - 池里的客户端跨系统切换/长时间空闲后仍在复用，其 SAP 会话（cookie + CSRF 令牌）
 *   已经失效；读请求之所以看起来正常，是 abap-adt-api 在 stateless 模式下捕获
 *   401/CSRF 后自动 login 再重试了一次。
 * - 写请求（lock→setObjectSource→unLock）必须 stateful，而 SDK 的自动重建条件里
 *   有 `!this.isStateful`——stateful 下它不会重登录，于是同一个坏令牌让每次写都报
 *   "CSRF 令牌验证失败"，读却一直正常。
 *
 * 做法：先把残留的 stateful 会话压回 stateless（否则 SDK 连自动重试都不会做），
 * 会话超过 maxAgeMs 没被确认可用就重新 login（清空 cookie + 换新 CSRF 令牌）。
 */
export async function ensureFreshSession(connId, maxAgeMs = SESSION_REUSE_MS) {
    const id = connId.toLowerCase();
    const client = await getClient(id);
    checkCancelled();
    try {
        if (client.stateful === session_types.stateful)
            client.stateful = session_types.stateless;
    }
    catch { /* 克隆客户端禁止切换 stateful，忽略即可 */ }
    const last = sessionOkAt.get(id) ?? 0;
    if (Date.now() - last <= maxAgeMs)
        return client;
    let login;
    let timer;
    try {
        login = client.login();
        await Promise.race([
            login,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`刷新 SAP 会话超时（${Math.round(SESSION_LOGIN_TIMEOUT_MS / 1000)}s 未完成登录）`)), SESSION_LOGIN_TIMEOUT_MS);
            }),
        ]);
        sessionOkAt.set(id, Date.now());
    }
    catch (err) {
        login?.catch(() => undefined); // 超时后原登录可能继续，别留下未处理的 rejection
        // 登录失败不保留坏会话，下次调用重新走一遍
        markConnectionUnhealthy(id);
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
    return client;
}
/**
 * 连接配置变更（切换系统/改地址/改账号）后立刻失效所有池化会话，不发起网络请求。
 * 不清池的后果：新连接复用旧系统的 cookie/CSRF 令牌，读写都会打到旧系统或直接被 SAP 拒绝。
 */
export function resetClients() {
    pool.clear();
    clientCategoryCache.clear();
    sessionOkAt.clear();
    configEpoch++;
}
/**
 * 写操作统一入口：独占锁 + 会话保鲜 + CSRF/会话失效时自动重建一次。
 * CSRF 校验失败的请求在 SAP 侧根本没有执行，所以重建连接后整体重试一次是安全的；
 * 这样"切换系统后第一次写"不会再把错误直接抛给用户。
 */
export async function runWriteWithRecovery(connId, run) {
    const id = connId.toLowerCase();
    // 配置在本序列期间被改动（用户切了系统）时不能重试：重试会拿旧 payload 打到新系统上
    const epoch = configEpoch;
    let progress;
    const attempt = () => {
        progress = { modifying: 0 };
        return withConnMutex(id, () => writeProgress.run(progress, async () => {
            // 持锁后再确认一次连接配置没被换掉：重试绝不能把旧 payload 打到新系统上
            if (configEpoch !== epoch)
                throw new Error("SAP 连接配置已变更，已放弃本次写操作；请先调用 get_connected_systems 确认当前连接后再重试。");
            await ensureFreshSession(id);
            return run();
        }));
    };
    /** 只有"SAP 侧还没落过任何改动"且连接配置没变，才允许重建连接重试一次 */
    const canRetry = () => (progress?.modifying ?? 0) === 0 && configEpoch === epoch;
    let text;
    try {
        text = await attempt();
    }
    catch (err) {
        if (!isCsrfError(err) || !canRetry())
            throw err;
        markConnectionUnhealthy(id);
        return attempt();
    }
    if (typeof text === "string" && isCsrfFailureText(text) && !looksApplied(text)) {
        // 写工具多数把 SAP 错误转成返回值（不抛异常），这里同样识别一次
        if (!canRetry())
            return text;
        markConnectionUnhealthy(id);
        return attempt();
    }
    return text;
}
/** 释放指定连接（用于测试/连接重置） */
export async function dropClient(connId) {
    const managed = pool.get(connId.toLowerCase());
    if (!managed)
        return;
    await managed.client.dropSession().catch(() => undefined);
    pool.delete(connId.toLowerCase());
    clientCategoryCache.delete(connId.toLowerCase());
    sessionOkAt.delete(connId.toLowerCase());
}
/** 释放所有连接 */
export async function dropAllClients() {
    await Promise.all([...pool.keys()].map(dropClient));
    clientCategoryCache.clear();
    sessionOkAt.clear();
}
// ── 连接变更后的强制重确认 ──
// 连接配置被保存（/api/sap-config）后置脏。除 get_connected_systems 外所有 SAP 工具
// 都拒绝执行，直到 get_connected_systems 成功清标记——防止 AI 拿着旧连接假设并行发请求，
// 正赶上连接切换被全部掐断。
let connectionDirty = false;
/** 连接配置已变更：强制下一次先 get_connected_systems 再允许其他 SAP 工具 */
export function markConnectionDirty() {
    connectionDirty = true;
}
/** get_connected_systems 成功执行后清除 */
export function clearConnectionDirty() {
    connectionDirty = false;
}
export function isConnectionDirty() {
    return connectionDirty;
}
export function connectedIds() {
    return [...pool.keys()];
}
