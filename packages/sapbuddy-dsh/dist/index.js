import http from "node:http";
import https from "node:https";
import { listConnections, saveConnection, deleteConnection, activateConnection, getConnectionSecret, } from "./sap-tools/connections-store.js";
const ROUTES = [
    "/api/sapbuddy/connections",
    "/api/sapbuddy/connections/activate",
    "/api/sapbuddy/connections/delete",
    "/api/sapbuddy/connections/test",
];
function isLoopback(req) {
    const a = req.socket?.remoteAddress ?? "";
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}
function json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
    res.end(body);
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw.trim())
                return resolve({});
            try {
                resolve(JSON.parse(raw));
            }
            catch (e) {
                reject(new Error(`请求体不是合法 JSON: ${e instanceof Error ? e.message : String(e)}`));
            }
        });
        req.on("error", reject);
    });
}
/**
 * 把连接配置规范成一次 ADT 探活请求。
 *
 * 注意两件事（曾经踩过的坑）：
 * 1. 协议必须跟随配置里的 URL：SAP 的 ICM HTTP 端口（常见 8000）是 **http**，
 *    HTTPS 端口（常见 44300）才是 https。写死 https 会让 http 连接永远探测失败。
 * 2. 客户端号/语言要与真实工具调用一致——通过查询参数 `sap-client` / `sap-language` 传
 *    （abap-adt-api 登录就是这么做的），同时保留 `X-sap-login-client` 头兼容只认该头的系统。
 *    只发头不发参数时，部分系统会忽略头、用默认客户端登录，于是返回 401。
 *
 * @returns {{ error: string } | { scheme: "http" | "https", url: URL, headers: Record<string, string> }}
 */
export function buildProbeRequest(conf) {
    const raw = String(conf?.url ?? "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(raw))
        return { error: `连接地址要以 http:// 或 https:// 开头（当前是 "${raw || "(空)"}"）。` +
                `例如 http://<host>:8000（ICM HTTP 端口）或 https://<host>:44300（HTTPS 端口）` };
    let url;
    try {
        url = new URL(`${raw}/sap/bc/adt/compatibility/graph`);
    }
    catch {
        return { error: `连接地址不合法: ${raw}` };
    }
    const scheme = url.protocol === "https:" ? "https" : "http";
    const qs = new URLSearchParams();
    if (conf.client)
        qs.set("sap-client", String(conf.client));
    if (conf.language)
        qs.set("sap-language", String(conf.language));
    if ([...qs.keys()].length > 0)
        url.search = qs.toString();
    const headers = {
        Authorization: "Basic " + Buffer.from(`${conf.username}:${conf.password ?? ""}`).toString("base64"),
        Accept: "*/*",
    };
    if (conf.client)
        headers["X-sap-login-client"] = String(conf.client);
    return { scheme, url, headers };
}
/** 把探活拿到的 HTTP 状态码翻译成能直接照做的排查建议；null 表示成功 */
export function describeProbeStatus(status, conf) {
    if (status >= 200 && status < 300)
        return null;
    if (status === 401)
        return "认证失败（HTTP 401）：服务器拒绝了账号/密码。按顺序排查：\n" +
            `① 客户端号是否与系统一致（当前填的是 ${conf.client || "空"}，登录时作为 sap-client 发送）；\n` +
            `② 用户名/密码是否正确、账号是否被锁或过期（当前用户 ${conf.username || "空"}）；\n` +
            `③ 语言 ${conf.language || "空"} 是否为该账号可用语言（不确定先填 EN）；\n` +
            "④ 该客户端是否允许 ADT 登录（SICF 里 /sap/bc/adt 的登录过程）。";
    if (status === 403)
        return "HTTP 403：账号认证通过但无权访问 ADT，或 /sap/bc/adt 服务未激活/被限制。请让 BASIS 检查 SICF 与用户 ADT 权限。";
    if (status === 404)
        return "HTTP 404：这个地址上没有 ADT 服务。确认端口是 SAP 的 HTTP/HTTPS 端口（8000/44300），且 /sap/bc/adt 已在 SICF 激活。";
    if (status >= 500)
        return `HTTP ${status}：SAP 服务端错误（ICM/ADT 异常），请稍后重试或联系 BASIS。`;
    return `HTTP ${status}：未预期的响应，请检查地址与端口。`;
}
/** 网络层失败时给出"协议/端口写反"这类最常见的提示 */
function describeProbeFailure(message, scheme) {
    if (/wrong version number|SSL routines|EPROTO|packet length too long|socket hang up/i.test(message))
        return `连接失败: ${message}\n` +
            `协议和端口对不上：这个端口很可能是 ${scheme === "https" ? "纯 HTTP（用 http://）" : "HTTPS（用 https://）"}。` +
            "SAP 的 ICM HTTP 端口（常见 8000）要用 http://，HTTPS 端口（常见 44300）要用 https://。";
    if (/certificate|self-signed|SELF_SIGNED|CERT_|unable to verify/i.test(message))
        return `连接失败: ${message}\n证书不被信任：内部/自签名证书请在连接里开启「允许自签名证书」。`;
    if (/ENOTFOUND|EAI_AGAIN/i.test(message))
        return `连接失败: 主机名解析不了（${message}）。检查地址拼写，或改用 IP。`;
    if (/ECONNREFUSED/i.test(message))
        return `连接失败: 端口没有监听（${message}）。检查端口号与 SAP 实例状态。`;
    if (/timeout|ETIMEDOUT|超时/i.test(message))
        return `连接失败: 连接超时（${message}）。检查网络/防火墙是否放通该端口。`;
    return `连接失败: ${message}`;
}
/** 测试连接：用连接明文凭据做一次 ADT 请求（结果只回状态码，不回敏感信息）。
 * 用 node:http/https 直连以支持 ssl.allowSelfSigned（Node fetch 不支持该选项）。 */
async function testConnection(id) {
    const c = getConnectionSecret(id);
    if (!c)
        return { ok: false, status: 0, message: `连接 ${id} 不存在` };
    const probe = buildProbeRequest(c);
    if (probe.error)
        return { ok: false, status: 0, message: probe.error };
    const transport = probe.scheme === "https" ? https : http;
    try {
        const status = await new Promise((resolve, reject) => {
            const req = transport.request(probe.url, {
                method: "GET",
                headers: probe.headers,
                rejectUnauthorized: !(c.ssl?.allowSelfSigned ?? false),
                timeout: 15_000,
            }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
            req.on("timeout", () => req.destroy(new Error("超时（15s）")));
            req.on("error", reject);
            req.end();
        });
        const detail = describeProbeStatus(status, c);
        return detail ? { ok: false, status, message: detail } : { ok: true, status, message: "连接成功" };
    }
    catch (e) {
        return { ok: false, status: 0, message: describeProbeFailure(e instanceof Error ? e.message : String(e), probe.scheme) };
    }
}
/**
 * 注册设置页所需的 webServer 路由。
 *
 * @param ctx 插件上下文；`webServer` 缺失（headless 等）时返回空数组，不报错
 * @returns 卸载函数列表，由调用方并入自己的 disposers
 */
export function installSettingsRoutes(ctx) {
    const webServer = ctx.get("webServer");
    if (webServer === undefined)
        return []; // 非 Web profile（如 headless）无 webServer，跳过
    const disposers = [];
    disposers.push(webServer.register({
        kind: "exact",
        path: "/api/sapbuddy/connections",
        async handler(req, res) {
            if (req.method === "GET") {
                return json(res, 200, { ok: true, connections: listConnections() });
            }
            if (req.method === "POST") {
                if (!isLoopback(req))
                    return json(res, 403, { ok: false, error: "仅允许本机访问" });
                try {
                    const body = (await readBody(req));
                    const r = saveConnection((body.connection ?? {}));
                    return json(res, r.ok ? 200 : 400, r);
                }
                catch (e) {
                    return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
                }
            }
            return json(res, 405, { ok: false, error: "仅支持 GET / POST" });
        },
    }));
    const postRoute = (path, fn) => webServer.register({
        kind: "exact",
        path,
        async handler(req, res) {
            if (req.method !== "POST")
                return json(res, 405, { ok: false, error: "仅支持 POST" });
            if (!isLoopback(req))
                return json(res, 403, { ok: false, error: "仅允许本机访问" });
            try {
                const body = (await readBody(req));
                const r = await fn(body);
                return json(res, r.ok ? 200 : 400, r);
            }
            catch (e) {
                return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
            }
        },
    });
    disposers.push(postRoute("/api/sapbuddy/connections/activate", (b) => activateConnection(String(b.id ?? ""))), postRoute("/api/sapbuddy/connections/delete", (b) => deleteConnection(String(b.id ?? ""))), postRoute("/api/sapbuddy/connections/test", async (b) => {
        const r = await testConnection(String(b.id ?? ""));
        return r.ok ? { ok: true, status: r.status, message: r.message } : { ok: false, error: r.message ?? `连接 ${String(b.id)} 测试失败` };
    }));
    return disposers;
}
/** 顶层行 `sapbuddy-dsh` 的插件入口（行名必须是裸包名——见文件头说明）。 */
export function apply(ctx) {
    ctx.inject(["webServer"], (webCtx) => {
        const routes = installSettingsRoutes(webCtx);
        if (routes.length === 0)
            return;
        webCtx.effect(() => () => {
            for (const d of routes) {
                try {
                    d();
                }
                catch { /* 卸载失败不影响其余 */ }
            }
        });
        // eslint-disable-next-line no-console
        console.log(`[sapbuddy-dsh] 已注册 ${routes.length} 条连接管理路由（设置页）`);
    });
}
export default { name: "sapbuddy-dsh", apply };
