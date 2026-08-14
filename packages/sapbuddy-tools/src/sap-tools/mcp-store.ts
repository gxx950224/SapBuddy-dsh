/**
 * MCP 服务器配置存储 —— 供设置 UI（sapbuddy-settings 的 HTTP API）与 mcp2dsh 共用
 *
 * - 数据源：<preset>/mcp.json（{ mcpServers: { <name>: { url, headers?, disabled? } } }）
 * - 生成：把服务器转成 DSH 原生 @deepseek-ai/dsh-mcp-client 插件行（streamable-http），
 *   追加到 home 级 patch（~/.dsh/cordis.patch.yml —— 对所有 profile 生效，
 *   即"配置一次，所有会话/preset 都能用 MCP 工具"）
 *
 * 与连接配置同模式：写操作触发配置变更标记（工具层/客户端刷新）；密码类值不出现在响应。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { sapbuddyPath } from "./sapbuddy-home.js"

export interface McpServer {
  url: string
  headers?: Record<string, string>
  disabled?: boolean
}

export interface McpServerView {
  name: string
  url: string
  headers?: Record<string, string>
  disabled: boolean
  hasHeaders: boolean
}

const MCP_FILE = sapbuddyPath("mcp.json")
export const HOME_PATCH = path.join(os.homedir(), ".dsh", "cordis.patch.yml")

function readRaw(): Record<string, McpServer> {
  if (!existsSync(MCP_FILE)) return {}
  try {
    const j = JSON.parse(readFileSync(MCP_FILE, "utf8"))
    return j?.mcpServers && typeof j.mcpServers === "object" ? j.mcpServers : {}
  } catch {
    return {}
  }
}

function writeRaw(servers: Record<string, McpServer>): void {
  mkdirSync(sapbuddyPath(""), { recursive: true })
  writeFileSync(MCP_FILE, JSON.stringify({ mcpServers: servers }, null, 2) + "\n")
}

function toView(name: string, s: McpServer): McpServerView {
  return {
    name,
    url: s.url,
    headers: s.headers && Object.keys(s.headers).length > 0 ? s.headers : undefined,
    disabled: s.disabled === true,
    hasHeaders: Boolean(s.headers && Object.keys(s.headers).length > 0),
  }
}

/** 全部服务器（脱敏视图） */
export function listMcpServers(): McpServerView[] {
  return Object.entries(readRaw())
    .filter(([name, s]) => Boolean(name) && Boolean(s))
    .map(([name, s]) => toView(name, s))
}

function validate(name: string, s: McpServer): string | undefined {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) return "服务器名只能包含字母/数字/下划线/连字符（1-32 位）"
  if (!String(s?.url ?? "").trim()) return "服务器地址（url）不能为空"
  try { new URL(s.url) } catch { return `服务器地址不是合法 URL: ${s.url}` }
  return undefined
}

/** 新建或更新服务器 */
export function saveMcpServer(name: string, input: McpServer): { ok: true } | { ok: false; error: string } {
  const err = validate(name, input)
  if (err) return { ok: false, error: err }
  const servers = readRaw()
  servers[name] = { url: input.url.trim(), ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}), ...(input.disabled === true ? { disabled: true } : {}) }
  try { writeRaw(servers) } catch (e) {
    return { ok: false, error: `写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true }
}

/** 删除服务器 */
export function deleteMcpServer(name: string): { ok: true } | { ok: false; error: string } {
  const servers = readRaw()
  if (!(name in servers)) return { ok: false, error: `服务器 ${name} 不存在` }
  delete servers[name]
  try { writeRaw(servers) } catch (e) {
    return { ok: false, error: `写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true }
}

/** 读取服务器完整配置（含 headers；仅供宿主测试连接用） */
export function getMcpServer(name: string): McpServer | undefined {
  return readRaw()[name]
}

/** 整体替换 mcp.json（设置页 JSON 编辑器入口）。接受 {"mcpServers": {...}} 或直接映射 */
export function replaceMcpServers(raw: unknown): { ok: true } | { ok: false; error: string } {
  let servers: Record<string, McpServer>
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "mcpServers" in raw) {
    servers = (raw as { mcpServers: unknown }).mcpServers as Record<string, McpServer>
  } else {
    servers = raw as Record<string, McpServer>
  }
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return { ok: false, error: "JSON 顶层必须是对象（mcpServers 映射，如 {\"mcpServers\": {...}}）" }
  }
  for (const [name, s] of Object.entries(servers)) {
    if (!s || typeof s !== "object") return { ok: false, error: `服务器 ${name} 的配置必须是对象` }
    const err = validate(name, s)
    if (err) return { ok: false, error: `[${name}] ${err}` }
  }
  try { writeRaw(servers) } catch (e) {
    return { ok: false, error: `写入失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true }
}

/** 行 id：serverName 约束 [A-Za-z0-9_-]{1,32}；id 需小写 kebab */
function sanitizeId(name: string): string {
  return "mcp-" + String(name).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32)
}

/** 生成 dsh-mcp-client 配置（YAML 文本；disabled 服务器跳过）。
 * ⚠️ 必须包在 `- insert:` 块里——patch 层的裸 `- id:` 是覆盖补丁（entry not found），
 * 新增行会被静默跳过、插件永不挂载。 */
export function renderMcpClientRows(servers: Record<string, McpServer>): string {
  const out: string[] = []
  for (const [name, s] of Object.entries(servers)) {
    if (!s || s.disabled === true || !s.url) continue
    const lines = [
      `    - id: ${sanitizeId(name)}`,
      `      name: '@deepseek-ai/dsh-mcp-client'`,
      `      config:`,
      `        serverName: ${name}`,
      `        transport: streamable-http`,
      `        url: ${s.url}`,
    ]
    if (s.headers && Object.keys(s.headers).length > 0) {
      lines.push(`        headers:`)
      for (const [hk, hv] of Object.entries(s.headers)) {
        lines.push(`          ${hk}: ${typeof hv === "string" ? JSON.stringify(hv) : hv}`)
      }
    }
    out.push(lines.join("\n"))
  }
  return out.length > 0 ? `- insert:\n${out.join("\n")}` : ""
}

/** 把 mcp.json 的服务器写入 home 级 patch（幂等；整体重建，单次原子写）。
 * ⚠️ 必须保证 home patch 始终是合法顶层数组。对任意历史脏状态（粘连的 `[]`、
 * 重复注释、旧 MCP 块残留、并发写入产物）都做归一化：
 *  - 去掉所有孤立 `[]`（含与注释粘连的）；
 *  - 截掉旧 MCP 块（header 起至文件尾）整体重建；
 *  - 无服务器写 `[]`，有服务器写注释+行；绝不允许只剩注释。 */
export function appendMcpToHomePatch(): { ok: true; target: string; count: number } | { ok: false; error: string } {
  const servers = readRaw()
  const rows = renderMcpClientRows(servers)
  const target = HOME_PATCH
  try {
    mkdirSync(path.dirname(target), { recursive: true })
    const existing = existsSync(target) ? readFileSync(target, "utf8") : ""
    const marker = "# MCP 服务器（由 sapbuddy-dsh 设置页生成"
    const header = `# MCP 服务器（由 sapbuddy-dsh 设置页生成，来源 ${MCP_FILE}）`
    // 1) 截掉旧 MCP 块（marker 起至文件尾，含脏残留）
    let text = existing
    const mi = text.indexOf(marker)
    if (mi >= 0) text = text.slice(0, mi)
    // 2) 去掉所有孤立 `[]`（含 `[]# comment` 粘连形态），避免 [] 与后续行并列成非法文档
    text = text.replace(/\s*\[\s*\]\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd()
    // 3) 组装 body：无服务器 → 合法空数组；有 → header + 行
    const body = rows.trim() === "" ? "[]" : `${header}\n${rows}\n`
    const next = text ? `${text}\n${body}` : body
    writeFileSync(target, next)
    return { ok: true, target, count: rows.split("\n").filter(Boolean).length }
  } catch (e) {
    return { ok: false, error: `写入 home patch 失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}
