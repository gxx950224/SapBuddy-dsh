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
/** 测试连接：用连接明文凭据做一次 ADT 请求（结果只回状态码，不回敏感信息）。
 * 用 node:https 直连以支持 ssl.allowSelfSigned（Node fetch 不支持该选项）。 */
async function testConnection(id) {
    const c = getConnectionSecret(id);
    if (!c)
        return { ok: false, status: 0, message: `连接 ${id} 不存在` };
    const url = new URL(`${String(c.url).replace(/\/+$/, "")}/sap/bc/adt/compatibility/graph`);
    const auth = "Basic " + Buffer.from(`${c.username}:${c.password ?? ""}`).toString("base64");
    const headers = { Authorization: auth, Accept: "*/*" };
    if (c.client)
        headers["X-sap-login-client"] = c.client;
    try {
        const status = await new Promise((resolve, reject) => {
            const req = https.request(url, {
                method: "GET",
                headers,
                rejectUnauthorized: !(c.ssl?.allowSelfSigned ?? false),
                timeout: 15_000,
            }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
            req.on("timeout", () => req.destroy(new Error("超时（15s）")));
            req.on("error", reject);
            req.end();
        });
        const ok = status >= 200 && status < 300;
        return { ok, status, message: ok ? "连接成功" : `认证失败（HTTP ${status}）：请检查账号/密码/客户端号，或 ADT 服务是否激活` };
    }
    catch (e) {
        return { ok: false, status: 0, message: `连接失败: ${e instanceof Error ? e.message : String(e)}` };
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
