/**
 * sapbuddy-settings 浏览器端：在 DSH 设置界面注册 "SAP 连接" 页。
 * 通过同源 HTTP API（/api/sapbuddy/connections*，宿主插件注册）读写连接配置。
 *
 * 注意：本文件由 esbuild 打包（scripts/build-client.mjs），不参与 tsc 编译。
 * 依赖（react / @deepseek-ai/*）为 external，经客户端模块加载器的 require 解析。
 */

const React = require("react")

const { useState, useEffect, useCallback } = React

const API = "/api/sapbuddy/connections"

async function listConnections() {
  const r = await fetch(API)
  const j = await r.json()
  return j.connections ?? []
}

async function post(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return r.json()
}

const S = {
  wrap: { maxWidth: 720, display: "flex", flexDirection: "column", gap: 12, color: "var(--dsw-alias-label-primary)" },
  title: { margin: 0, fontSize: 16, fontWeight: 500, lineHeight: "24px" },
  intro: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
  msg: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-success-primary)" },
  err: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-error-primary)" },
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 },
  card: { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 12, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  name: { fontSize: 14, fontWeight: 500, lineHeight: "22px", margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { border: "1px solid var(--dsw-alias-border-l3)", color: "var(--dsw-alias-label-secondary)", borderRadius: 4, padding: "1px 6px", fontSize: 11, lineHeight: "16px", flex: "none" },
  badgeActive: { background: "var(--dsw-alias-state-success-primary)", borderColor: "var(--dsw-alias-state-success-primary)", color: "var(--dsw-alias-label-primary-foreground)" },
  meta: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  actions: { display: "flex", gap: 6, marginLeft: "auto", flex: "none" },
  btn: { height: 28, padding: "0 10px", borderRadius: 14, fontSize: 12, lineHeight: "18px", cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-primary)", font: "inherit" },
  btnPrimary: { background: "var(--dsw-alias-button-primary-fill)", color: "var(--dsw-alias-label-primary-foreground)", border: "none" },
  btnDanger: { color: "var(--dsw-alias-state-error-primary)" },
  editor: { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, background: "var(--dsw-alias-bg-module-platform)" },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 500, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)" },
  input: { height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", fontSize: 14, font: "inherit" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 },
  hint: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
}

const EMPTY = { language: "ZH", authMethod: "basic", ssl: { allowSelfSigned: true } }

function Section() {
  const [conns, setConns] = useState([])
  const [mode, setMode] = useState(null) // null | "new" | <id 编辑>
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [testResult, setTestResult] = useState({})

  const refresh = useCallback(async () => {
    try { setConns(await listConnections()); setErr(null) } catch (e) { setErr("加载连接配置失败: " + (e.message ?? e)) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const set = (key) => (evt) => {
    const v = evt.target.type === "checkbox" ? evt.target.checked : evt.target.value
    setDraft((d) => ({ ...d, [key]: v }))
  }

  const save = async () => {
    setBusy(true)
    try {
      const r = await post(API, { connection: draft })
      if (!r.ok) { setErr("保存失败: " + (r.error ?? "未知错误")); setMsg(null); return }
      setMsg("已保存连接 " + r.id); setErr(null)
      setMode(null); setDraft({})
      refresh()
    } catch (e) { setErr("保存失败: " + (e.message ?? e)) } finally { setBusy(false) }
  }

  const doActivate = async (id) => {
    const r = await post(API + "/activate", { id })
    if (!r.ok) setErr(r.error ?? "切换失败"); else { setMsg("已启用 " + id); setErr(null) }
    refresh()
  }
  const doDelete = async (id) => {
    if (!window.confirm("删除连接 " + id + "？")) return
    const r = await post(API + "/delete", { id })
    if (!r.ok) setErr(r.error ?? "删除失败"); else { setMsg("已删除 " + id); setErr(null) }
    refresh()
  }
  const doTest = async (id) => {
    const r = await post(API + "/test", { id })
    setTestResult((m) => ({ ...m, [id]: r.ok ? "✅ 连接成功（HTTP " + r.status + "）" : "❌ " + (r.error ?? "测试失败") }))
  }

  const startNew = () => { setMode("new"); setDraft({ ...EMPTY }) }
  const startEdit = (c) => { setMode(c.id); setDraft({ ...c, password: "" }) }

  const input = (key, label, ph) =>
    React.createElement("label", { className: undefined, style: S.field }, [
      React.createElement("span", { key: "l", style: S.label }, label),
      React.createElement("input", {
        key: "i", style: S.input, value: draft[key] ?? "", placeholder: ph ?? "", onChange: set(key),
      }),
    ])

  const connRow = (c) =>
    React.createElement("li", { key: c.id, style: S.card }, [
      React.createElement("div", { key: "r", style: S.row }, [
        React.createElement("p", { key: "n", style: S.name }, c.name || c.id),
        c.active === true
          ? React.createElement("span", { key: "a", style: { ...S.badge, ...S.badgeActive } }, "已启用")
          : React.createElement("span", { key: "a", style: S.badge }, "未启用"),
        React.createElement("div", { key: "x", style: S.actions }, [
          React.createElement("button", { key: "t", style: S.btn, onClick: () => doTest(c.id) }, "测试"),
          c.active === true
            ? null
            : React.createElement("button", { key: "on", style: { ...S.btn, ...S.btnPrimary }, onClick: () => doActivate(c.id) }, "设为启用"),
          React.createElement("button", { key: "e", style: S.btn, onClick: () => startEdit(c) }, "编辑"),
          React.createElement("button", { key: "d", style: { ...S.btn, ...S.btnDanger }, onClick: () => doDelete(c.id) }, "删除"),
        ]),
      ]),
      React.createElement("p", { key: "m", style: S.meta },
        c.url + (c.client ? " · Client " + c.client : "") + " · " + c.username + (c.hasPassword ? " · 密码已设置" : " · 未设置密码")),
      testResult[c.id]
        ? React.createElement("p", { key: "tr", style: S.meta }, testResult[c.id])
        : null,
    ])

  const editor = React.createElement("div", { key: "editor", style: S.editor }, [
    React.createElement("div", { key: "g1", style: S.grid }, [
      input("id", "连接 ID（唯一，如 dev/prod）", "dev"),
      input("name", "名称", "开发系统"),
      input("url", "地址（https://host:port）", "https://10.8.202.35:44300"),
      input("client", "客户端号", "100"),
    ]),
    React.createElement("div", { key: "g2", style: S.grid }, [
      input("username", "用户名", "BC01"),
      input("password", "密码（编辑时留空保持原密码）", "••••••"),
      input("language", "语言", "ZH"),
      input("authMethod", "认证方式", "basic"),
    ]),
    React.createElement("div", { key: "g3", style: S.grid }, [
      input("description", "描述", "开发系统"),
    ]),
    React.createElement("div", { key: "acts", style: { display: "flex", gap: 8, justifyContent: "flex-end" } }, [
      React.createElement("button", { key: "c", style: S.btn, onClick: () => { setMode(null); setDraft({}) } }, "取消"),
      React.createElement("button", { key: "s", style: { ...S.btn, ...S.btnPrimary }, disabled: busy, onClick: save }, busy ? "保存中…" : "保存"),
    ]),
  ])

  return React.createElement("div", { style: S.wrap }, [
    React.createElement("h3", { key: "t", style: S.title }, "🔗 SAP 连接"),
    React.createElement("p", { key: "i", style: S.intro },
      "配置一个或多个 SAP 系统连接（ADT）。切换为启用后，SapBuddy 会话的 SAP 工具默认使用该连接；" +
      "切换后需在会话中先调用 get_connected_systems 确认。密码仅保存在本机配置文件。"),
    msg ? React.createElement("p", { key: "m", style: S.msg }, msg) : null,
    err ? React.createElement("p", { key: "e", style: S.err }, err) : null,
    React.createElement("ul", { key: "l", style: S.list }, conns.map(connRow)),
    mode === null
      ? React.createElement("button", { key: "add", style: { ...S.btn, ...S.btnPrimary, height: 36, borderRadius: 18, padding: "0 14px" }, onClick: startNew }, "＋ 添加连接")
      : editor,
  ])
}

// ── MCP 服务器设置页 ──────────────────────────────────────────────────────────
const MCP_API = "/api/sapbuddy/mcp"

async function listMcp() {
  const r = await fetch(MCP_API)
  const j = await r.json()
  return j.servers ?? []
}

function McpSection() {
  const [servers, setServers] = useState([])
  const [jsonText, setJsonText] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [tests, setTests] = useState({})

  // 列表 → {"mcpServers": {...}} JSON 文本
  const toJson = (list) => {
    const obj = {}
    for (const s of list) {
      obj[s.name] = { url: s.url, ...(s.headers ? { headers: s.headers } : {}), ...(s.disabled ? { disabled: true } : {}) }
    }
    return JSON.stringify({ mcpServers: obj }, null, 2)
  }

  const refresh = useCallback(async () => {
    try {
      const list = await listMcp()
      setServers(list)
      setJsonText(toJson(list))
      setErr(null)
    } catch (e) { setErr("加载失败: " + (e.message ?? e)) }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const save = async () => {
    setBusy(true)
    try {
      let config
      try { config = JSON.parse(jsonText) } catch (e) { setErr("JSON 解析失败: " + (e.message ?? e)); setBusy(false); return }
      const r = await post(MCP_API + "/replace", { config })
      if (!r.ok) { setErr("保存失败: " + (r.error ?? "未知错误")); setMsg(null); return }
      setMsg("已保存 mcp.json（共 " + servers.length + " 台服务器）"); setErr(null)
      refresh()
    } catch (e) { setErr("保存失败: " + (e.message ?? e)) } finally { setBusy(false) }
  }

  const doDelete = async (name) => {
    if (!window.confirm("删除 MCP 服务器 " + name + "？")) return
    const r = await post(MCP_API + "/delete", { name })
    if (!r.ok) setErr(r.error ?? "删除失败"); else { setMsg("已删除 " + name); setErr(null) }
    refresh()
  }
  const doTest = async (name) => {
    setTests((m) => ({ ...m, [name]: "测试中…" }))
    const r = await post(MCP_API + "/test", { name })
    setTests((m) => ({ ...m, [name]: r.ok ? "✅ " + (r.message ?? "连接成功") : "❌ " + (r.error ?? "测试失败") }))
  }
  const doGenerate = async () => {
    setBusy(true)
    try {
      const r = await post(MCP_API + "/generate", {})
      if (!r.ok) { setErr(r.error ?? "生成失败"); return }
      setMsg(r.message ?? "已生成配置"); setErr(null)
    } catch (e) { setErr("生成失败: " + (e.message ?? e)) } finally { setBusy(false) }
  }

  const row = (s) =>
    React.createElement("li", { key: s.name, style: S.card }, [
      React.createElement("div", { key: "r", style: S.row }, [
        React.createElement("p", { key: "n", style: S.name }, s.name),
        s.disabled
          ? React.createElement("span", { key: "b", style: S.badge }, "已停用")
          : React.createElement("span", { key: "b", style: { ...S.badge, ...S.badgeActive } }, "启用中"),
        React.createElement("div", { key: "x", style: S.actions }, [
          React.createElement("button", { key: "t", style: S.btn, onClick: () => doTest(s.name) }, "测试"),
          React.createElement("button", { key: "d", style: { ...S.btn, ...S.btnDanger }, onClick: () => doDelete(s.name) }, "删除"),
        ]),
      ]),
      React.createElement("p", { key: "m", style: S.meta }, s.url + (s.hasHeaders ? " · 含请求头" : "")),
      tests[s.name] ? React.createElement("p", { key: "tr", style: S.meta }, tests[s.name]) : null,
    ])

  return React.createElement("div", { style: S.wrap }, [
    React.createElement("h3", { key: "t", style: S.title }, "🔌 MCP 服务器"),
    React.createElement("p", { key: "i", style: S.intro },
      "直接编辑下方 JSON（格式与 mcp.json 一致：{\"mcpServers\": {\"<名称>\": {\"url\": ..., \"headers\": {...}, \"disabled\": false}}}）。" +
      "保存后点「生成 dsh-mcp-client 配置」写入 DSH home 层（所有 profile 生效），数秒内热生效（无需重启），MCP 工具以 mcp__<服务器>__<工具> 在任意会话可用。"),
    msg ? React.createElement("p", { key: "m", style: S.msg }, msg) : null,
    err ? React.createElement("p", { key: "e", style: S.err }, err) : null,
    React.createElement("label", { key: "j", style: S.field }, [
      React.createElement("span", { key: "l", style: S.label }, "mcp.json 内容（JSON）"),
      React.createElement("textarea", {
        key: "t", style: { ...S.input, height: 240, padding: "10px 12px", fontFamily: "monospace", fontSize: 12, lineHeight: "18px", whiteSpace: "pre", overflow: "auto" },
        value: jsonText, spellCheck: false, onChange: (evt) => setJsonText(evt.target.value),
      }),
    ]),
    React.createElement("div", { key: "acts", style: { display: "flex", gap: 8, justifyContent: "flex-end" } }, [
      React.createElement("button", { key: "gen", style: { ...S.btn, height: 36, borderRadius: 18, padding: "0 14px" }, disabled: busy, onClick: doGenerate }, "生成 dsh-mcp-client 配置（热生效）"),
      React.createElement("button", { key: "s", style: { ...S.btn, ...S.btnPrimary, height: 36, borderRadius: 18, padding: "0 14px" }, disabled: busy, onClick: save }, busy ? "保存中…" : "保存 mcp.json"),
    ]),
    servers.length > 0
      ? React.createElement("div", { key: "list", style: { marginTop: 8 } }, [
          React.createElement("p", { key: "h", style: S.label }, "已保存的服务器（测试/删除）"),
          React.createElement("ul", { key: "l", style: S.list }, servers.map(row)),
        ])
      : null,
  ])
}

// 客户端挂载用 bundle 的 exports.inject —— 必须是浏览器里的【服务键】（如 slots），
// 不是 package.json 的 dsh.client.inject 包名。与官方 models 设置包同模式。
export const inject = ["slots"]

export function apply(ctx) {
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "sapbuddy-connections",
    order: 90,
    label: () => "🔗 SAP 连接",
    inject: () => ({})
  }, Section))
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "sapbuddy-mcp",
    order: 91,
    label: () => "🔌 MCP 服务器",
    inject: () => ({})
  }, McpSection))
}
