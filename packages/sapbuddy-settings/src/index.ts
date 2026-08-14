/**
 * sapbuddy-settings 宿主插件：注册 webServer 路由，为 DSH Web 设置界面提供
 * SAP 连接管理 + MCP 服务器管理 API。
 *
 * 路由同源（本机 web 服务），写操作限制 loopback——与 DSH 配置平面的策略一致。
 * 密码/密钥永不出现在响应中（store 层脱敏）。
 */
import type { IncomingMessage, ServerResponse } from "node:http"
import https from "node:https"
import {
  listConnections,
  saveConnection,
  deleteConnection,
  activateConnection,
  getConnectionSecret,
} from "sapbuddy-tools/store"
import {
  listMcpServers,
  saveMcpServer,
  deleteMcpServer,
  getMcpServer,
  appendMcpToHomePatch,
} from "sapbuddy-tools/mcp-store"

const ROUTES = [
  "/api/sapbuddy/connections",
  "/api/sapbuddy/connections/activate",
  "/api/sapbuddy/connections/delete",
  "/api/sapbuddy/connections/test",
  "/api/sapbuddy/mcp",
  "/api/sapbuddy/mcp/delete",
  "/api/sapbuddy/mcp/test",
  "/api/sapbuddy/mcp/generate",
]

function isLoopback(req: IncomingMessage): boolean {
  const a = req.socket?.remoteAddress ?? ""
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1"
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) })
  res.end(body)
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (c: Buffer) => chunks.push(c))
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8")
      if (!raw.trim()) return resolve({})
      try { resolve(JSON.parse(raw)) } catch (e) { reject(new Error(`请求体不是合法 JSON: ${e instanceof Error ? e.message : String(e)}`)) }
    })
    req.on("error", reject)
  })
}

/** 测试连接：用连接明文凭据做一次 ADT 请求（结果只回状态码，不回敏感信息）。
 * 用 node:https 直连以支持 ssl.allowSelfSigned（Node fetch 不支持该选项）。 */
async function testConnection(id: string): Promise<{ ok: boolean; status: number; message?: string }> {
  const c = getConnectionSecret(id)
  if (!c) return { ok: false, status: 0, message: `连接 ${id} 不存在` }
  const url = new URL(`${String(c.url).replace(/\/+$/, "")}/sap/bc/adt/compatibility/graph`)
  const auth = "Basic " + Buffer.from(`${c.username}:${c.password ?? ""}`).toString("base64")
  const headers: Record<string, string> = { Authorization: auth, Accept: "*/*" }
  if (c.client) headers["X-sap-login-client"] = c.client
  try {
    const status = await new Promise<number>((resolve, reject) => {
      const req = https.request(
        url,
        {
          method: "GET",
          headers,
          rejectUnauthorized: !(c.ssl?.allowSelfSigned ?? false),
          timeout: 15_000,
        },
        (res) => { res.resume(); resolve(res.statusCode ?? 0) },
      )
      req.on("timeout", () => req.destroy(new Error("超时（15s）")))
      req.on("error", reject)
      req.end()
    })
    const ok = status >= 200 && status < 300
    return { ok, status, message: ok ? "连接成功" : `认证失败（HTTP ${status}）：请检查账号/密码/客户端号，或 ADT 服务是否激活` }
  } catch (e) {
    return { ok: false, status: 0, message: `连接失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** MCP 服务器连通性探测：initialize + tools/list（JSON-RPC over HTTP，兼容 text/event-stream 响应） */
async function testMcpServer(name: string): Promise<{ ok: boolean; status?: number; tools?: number; message: string }> {
  const s = getMcpServer(name)
  if (!s) return { ok: false, message: `服务器 ${name} 不存在` }
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(s.headers ?? {}),
  }
  const rpc = (method: string, params: unknown, id?: number) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = https.request(
        new URL(s.url),
        { method: "POST", headers: baseHeaders, rejectUnauthorized: false, timeout: 15_000 },
        (res) => {
          const chunks: Buffer[] = []
          res.on("data", (c: Buffer) => chunks.push(c))
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
        },
      )
      req.on("timeout", () => req.destroy(new Error("超时（15s）")))
      req.on("error", reject)
      req.end(JSON.stringify({ jsonrpc: "2.0", id: id ?? 1, method, params }))
    })
  try {
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "sapbuddy-settings", version: "0.1" } }, 1)
    if (init.status >= 400) return { ok: false, status: init.status, message: `initialize 失败（HTTP ${init.status}）：请检查 URL/服务是否可访问` }
    await rpc("notifications/initialized", {}, undefined).catch(() => undefined)
    const tl = await rpc("tools/list", {}, 2)
    if (tl.status >= 400) return { ok: true, status: tl.status, message: "连接成功（initialize 通过），但 tools/list 失败" }
    // 兼容 SSE：去掉 "data: " 前缀行
    const raw = tl.body.replace(/^data:\s*/gm, "").trim()
    let json: { result?: { tools?: unknown[] } }
    try { json = JSON.parse(raw) } catch { json = {} }
    const tools = Array.isArray(json.result?.tools) ? json.result.tools.length : 0
    return { ok: true, status: tl.status, tools, message: `连接成功，发现 ${tools} 个工具` }
  } catch (e) {
    return { ok: false, message: `连接失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export function apply(ctx: {
  get: (name: string) => unknown
  effect: (fn: () => () => void) => void
}): void {
  const webServer = ctx.get("webServer") as
    | { register: (route: { kind: "exact"; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) => () => void }
    | undefined
  if (webServer === undefined) return // 非 Web profile（如 headless）无 webServer，跳过

  const disposers: Array<() => void> = []

  disposers.push(
    webServer.register({
      kind: "exact",
      path: "/api/sapbuddy/connections",
      async handler(req, res) {
        if (req.method === "GET") {
          return json(res, 200, { ok: true, connections: listConnections() })
        }
        if (req.method === "POST") {
          if (!isLoopback(req)) return json(res, 403, { ok: false, error: "仅允许本机访问" })
          try {
            const body = (await readBody(req)) as Record<string, unknown>
            const r = saveConnection((body.connection ?? {}) as Parameters<typeof saveConnection>[0])
            return json(res, r.ok ? 200 : 400, r)
          } catch (e) {
            return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) })
          }
        }
        return json(res, 405, { ok: false, error: "仅支持 GET / POST" })
      },
    }),
  )

  const postRoute = (path: string, fn: (body: Record<string, unknown>) => { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>) =>
    webServer.register({
      kind: "exact",
      path,
      async handler(req, res) {
        if (req.method !== "POST") return json(res, 405, { ok: false, error: "仅支持 POST" })
        if (!isLoopback(req)) return json(res, 403, { ok: false, error: "仅允许本机访问" })
        try {
          const body = (await readBody(req)) as Record<string, unknown>
          const r = await fn(body)
          return json(res, r.ok ? 200 : 400, r)
        } catch (e) {
          return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) })
        }
      },
    })

  disposers.push(
    postRoute("/api/sapbuddy/connections/activate", (b) => activateConnection(String(b.id ?? ""))),
    postRoute("/api/sapbuddy/connections/delete", (b) => deleteConnection(String(b.id ?? ""))),
    postRoute("/api/sapbuddy/connections/test", async (b) => {
      const r = await testConnection(String(b.id ?? ""))
      return r.ok ? { ok: true, status: r.status, message: r.message } : { ok: false, error: r.message ?? `连接 ${String(b.id)} 测试失败` }
    }),
  )

  // ── MCP 服务器管理 ──
  disposers.push(
    webServer.register({
      kind: "exact",
      path: "/api/sapbuddy/mcp",
      async handler(req, res) {
        if (req.method === "GET") {
          return json(res, 200, { ok: true, servers: listMcpServers() })
        }
        if (req.method === "POST") {
          if (!isLoopback(req)) return json(res, 403, { ok: false, error: "仅允许本机访问" })
          try {
            const body = (await readBody(req)) as Record<string, unknown>
            const name = String(body.name ?? "")
            const server = (body.server ?? {}) as { url?: string; headers?: Record<string, string>; disabled?: boolean }
            const r = saveMcpServer(name, { url: server.url ?? "", headers: server.headers, disabled: server.disabled })
            return json(res, r.ok ? 200 : 400, r)
          } catch (e) {
            return json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) })
          }
        }
        return json(res, 405, { ok: false, error: "仅支持 GET / POST" })
      },
    }),
  )
  disposers.push(
    postRoute("/api/sapbuddy/mcp/delete", (b) => deleteMcpServer(String(b.name ?? ""))),
    postRoute("/api/sapbuddy/mcp/test", async (b) => {
      const r = await testMcpServer(String(b.name ?? ""))
      return r.ok ? { ok: true, status: r.status, tools: r.tools, message: r.message } : { ok: false, error: r.message ?? `服务器 ${String(b.name)} 测试失败` }
    }),
    postRoute("/api/sapbuddy/mcp/generate", async () => {
      const r = appendMcpToHomePatch()
      if (!r.ok) return { ok: false, error: r.error }
      return { ok: true, target: r.target, count: r.count, message: `已生成 ${r.count} 行 dsh-mcp-client 配置 → ${r.target}；重启 dsh 后生效，所有会话/preset 可用` }
    }),
  )

  ctx.effect(() => () => {
    for (const d of disposers) { try { d() } catch { /* 忽略 */ } }
  })
}

export default { name: "sapbuddy-settings", inject: ["webServer"], apply }
