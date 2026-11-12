import axios from "axios";
import { ADTClient, session_types } from "abap-adt-api";
import { HttpClientException } from "abap-adt-api/build/AdtHTTP.js";
import { executionSignal } from "./execution.js";
/** SAP 明确表示"会话已失效"的文本特征。
 *  ADT 失效会话在 ICM 侧是 400（不是 401），abap-adt-api 也为此打过 hack：
 *  AdtException.js 里 `400 && statusText === "Session timed out"`。 */
const SESSION_TEXT = /session\s*(?:not found|timed out|invalid|expired|timeout)|invalid\s*session|sap-contextid|会话(?:已)?(?:超时|失效|过期|不存在)/i;
/** 从 SDK 各类错误形态里取出 HTTP 状态：
 *  AdtHttpException 用 status；空 body 的 400 Session timed out 会被 fromResponse/simpleError
 *  收成 AdtErrorException（字段是 err，不是 status；message 为 "Error 400:Session timed out"）。 */
function pickHttpStatus(error) {
    const res = error?.response ?? error?.parent?.response;
    for (const s of [error?.status, error?.parent?.status, res?.status, error?.err, error?.parent?.err]) {
        if (typeof s === "number" && s > 0)
            return s;
    }
    const m = String(error?.message ?? "").match(/\b(401|407|400|408)\b/);
    return m ? Number(m[1]) : undefined;
}
/** 是否属于"会话坏了"（而不是业务参数错误）。只读/写都可用于判定，但重试策略不同。 */
export function isSessionBroken(error) {
    const res = error?.response ?? error?.parent?.response;
    const status = pickHttpStatus(error);
    if (status === 401 || status === 407)
        return true; // 认证失效
    if (status !== 400 && status !== 408)
        return false;
    const text = `${error?.message ?? ""} ${error?.statusText ?? ""} ${res?.statusText ?? ""} ${typeof res?.body === "string" ? res.body : ""}`;
    return SESSION_TEXT.test(text.slice(0, 2000));
}
/** 会话自愈：SDK 只对 401/CSRF 重登，对 400 会话超时无能为力。
 *  清 cookie + 重新登录（login() 内部会 cookie.clear() 并重取 CSRF），再重试一次。
 *  仅非 stateful 重试——stateful 下请求可能已在 SAP 侧执行，重放不安全。 */
async function recoverSessionRequest(client, run) {
    try {
        return await run();
    }
    catch (err) {
        if (!isSessionBroken(err) || client.isStateful)
            throw err;
        try {
            await client.login(); // 清 cookie + 换新 CSRF token
        }
        catch {
            throw err; // 重登也失败：抛原始错误，交给上层
        }
        return await run(); // 只重试一次
    }
}
/** 真实工具调用走的是 AdtHTTP.request（ADTClient.httpClient），不是 ADTClient.request（SDK 没有这个方法）。 */
function wrapAdtHttpRequest(client) {
    const http = client.httpClient;
    if (!http || typeof http.request !== "function" || http.__sapbuddySessionWrapped)
        return;
    const orig = http.request.bind(http);
    http.request = (path, config) => recoverSessionRequest(client, () => orig(path, config));
    http.__sapbuddySessionWrapped = true;
}
/** Preserve the SDK's URL and stateless-clone contract when supplying our transport. */
export function createManagedAdtClient(url, username, password, client, language, options, clone = false) {
    class Managed extends ADTClient {
        child;
        constructor(http, username, password, client, language, options) {
            super(http, username, password, client, language, options);
            wrapAdtHttpRequest(this);
        }
        get baseUrl() { return url; }
        get statelessClone() {
            if (clone)
                return this;
            return this.child ??= createManagedAdtClient(url, username, password, client, language, options, true);
        }
        get stateful() { return super.stateful; }
        set stateful(value) {
            if (clone && value === session_types.stateful)
                throw new Error("Stateful sessions not allowed in stateless clones");
            super.stateful = value;
        }
        /** 对外暴露 request：探针脚本和直接调用走这里。
         *  生产路径已在构造时包住 httpClient.request；若基类没有 httpClient（单测 stub），则包一层 super.request。 */
        async request(path, config) {
            const http = this.httpClient;
            if (http && typeof http.request === "function")
                return http.request(path, config);
            return recoverSessionRequest(this, () => super.request(path, config));
        }
    }
    return new Managed(createHttpClient(url, options), username, password, client, language, options);
}
/** ADT retains cookies/CSRF handling; this transport adds per-execution cancellation. */
export function createHttpClient(baseURL, defaults) {
    const client = axios.create({ baseURL, timeout: defaults.timeout, httpsAgent: defaults.httpsAgent, responseType: "text" });
    return {
        async request(options) {
            const signal = executionSignal();
            signal?.throwIfAborted();
            const convert = (r) => ({
                body: typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? ""),
                status: r.status, statusText: r.statusText,
                headers: r.headers,
            });
            try {
                return convert(await client.request({
                    url: options.url, method: options.method || "GET", params: options.qs,
                    headers: options.headers, data: options.body, auth: options.auth,
                    httpsAgent: options.httpsAgent ?? defaults.httpsAgent,
                    timeout: options.timeout ?? defaults.timeout, signal,
                }));
            }
            catch (error) {
                signal?.throwIfAborted();
                if (axios.isAxiosError(error)) {
                    throw new HttpClientException(error.message, error.code, error.response?.status, defaults, options, error.response ? convert(error.response) : undefined, error);
                }
                throw error;
            }
        },
    };
}
