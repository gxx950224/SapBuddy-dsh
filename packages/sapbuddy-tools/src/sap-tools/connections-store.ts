/**
 * SAP 连接配置存储 —— 供设置 UI（sapbuddy-settings 的 HTTP API）与工具层共用
 *
 * - 读写 <preset>/connections.json（sapbuddyPath，与 config.ts 同源）
 * - upsert / delete / activate（切换启用）
 * - 保存后：失效 config 缓存（getConfig 的 cached）+ 标记连接变更（markConnectionDirty，
 *   使工具层强制"先 get_connected_systems 重确认"——与 pi 版连接切换规则一致）
 *
 * 密码安全：对外（list/响应）一律脱敏为 '***'；更新时密码为空或 '***' 视为"保持原密码"。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { sapbuddyPath } from "./sapbuddy-home.js"
import { markConnectionDirty } from "./adtManager.js"
import { reloadConfig } from "./config.js"

export interface ConnectionInput {
  id: string
  name?: string
  url: string
  client?: string
  username: string
  password?: string
  language?: string
  authMethod?: string
  description?: string
  ssl?: { allowSelfSigned?: boolean; customCA?: string }
  security?: { requireDevClient?: boolean; developmentCategories?: string[] }
  active?: boolean
}

/** 脱敏视图（密码永不出现在响应中） */
export interface ConnectionView extends Omit<ConnectionInput, "password"> {
  hasPassword: boolean
}

interface RawFile {
  connections: ConnectionInput[]
  security?: { readOnly?: boolean; apiKey?: string }
}

const PASSWORD_MASK = "***"

function readRaw(): RawFile {
  const p = sapbuddyPath("connections.json")
  if (!existsSync(p)) return { connections: [] }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as RawFile
    if (!Array.isArray(raw.connections)) return { connections: [] }
    return raw
  } catch {
    return { connections: [] }
  }
}

function writeRaw(file: RawFile): void {
  const p = sapbuddyPath("connections.json")
  mkdirSync(sapbuddyPath(""), { recursive: true })
  writeFileSync(p, JSON.stringify(file, null, 2) + "\n")
  // 配置变更：失效工具层缓存 + 标记连接变更（工具层要求 get_connected_systems 重确认）
  try { reloadConfig() } catch { /* 无连接或文件刚建，忽略 */ }
  markConnectionDirty()
}

/** 全部连接（脱敏视图） */
export function listConnections(): ConnectionView[] {
  return readRaw().connections.map(toView)
}

function toView(c: ConnectionInput): ConnectionView {
  const { password, ...rest } = c
  return { ...rest, hasPassword: Boolean(password && password !== "") }
}

function validate(input: ConnectionInput): string | undefined {
  const id = String(input.id ?? "").trim()
  if (!id) return "连接 ID 不能为空"
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return "连接 ID 只能包含字母/数字/下划线/连字符"
  if (!String(input.url ?? "").trim()) return "连接地址（url）不能为空"
  if (!String(input.username ?? "").trim()) return "用户名不能为空"
  return undefined
}

/** 新建或更新连接；更新时密码为空/'***' 保持原密码。返回 {ok} 或 {ok:false,error} */
export function saveConnection(input: ConnectionInput): { ok: true; id: string } | { ok: false; error: string } {
  const err = validate(input)
  if (err) return { ok: false, error: err }
  const id = input.id.trim().toLowerCase()
  const file = readRaw()
  const existing = file.connections.find((c) => c.id.toLowerCase() === id)
  const password = input.password === undefined || input.password === "" || input.password === PASSWORD_MASK
    ? existing?.password ?? ""
    : input.password

  const next: ConnectionInput = {
    ...existing,
    ...input,
    id,
    password,
    client: String(input.client ?? existing?.client ?? "").trim(),
    language: input.language ?? existing?.language ?? "ZH",
    authMethod: input.authMethod ?? existing?.authMethod ?? "basic",
  }

  if (existing) {
    file.connections = file.connections.map((c) => (c.id.toLowerCase() === id ? next : c))
  } else {
    file.connections.push(next)
  }
  // 首个连接默认启用
  if (!file.connections.some((c) => c.active === true)) {
    file.connections[0].active = true
  }
  try {
    writeRaw(file)
  } catch (e) {
    return { ok: false, error: `写入配置文件失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, id }
}

/** 删除连接；被删的是启用连接时，启用剩余第一个 */
export function deleteConnection(id: string): { ok: true } | { ok: false; error: string } {
  const file = readRaw()
  const idx = file.connections.findIndex((c) => c.id.toLowerCase() === id.toLowerCase())
  if (idx < 0) return { ok: false, error: `连接 ${id} 不存在` }
  file.connections.splice(idx, 1)
  if (file.connections.length > 0 && !file.connections.some((c) => c.active === true)) {
    file.connections[0].active = true
  }
  try { writeRaw(file) } catch (e) {
    return { ok: false, error: `写入配置文件失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true }
}

/** 切换启用连接（其余全部置为非启用） */
export function activateConnection(id: string): { ok: true } | { ok: false; error: string } {
  const file = readRaw()
  if (!file.connections.some((c) => c.id.toLowerCase() === id.toLowerCase())) {
    return { ok: false, error: `连接 ${id} 不存在` }
  }
  file.connections = file.connections.map((c) => ({ ...c, active: c.id.toLowerCase() === id.toLowerCase() }))
  try { writeRaw(file) } catch (e) {
    return { ok: false, error: `写入配置文件失败: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true }
}

/** 读取某连接的完整配置（含明文密码，仅宿主内部/测试连接用，绝不返回给客户端） */
export function getConnectionSecret(id: string): ConnectionInput | undefined {
  return readRaw().connections.find((c) => c.id.toLowerCase() === id.toLowerCase())
}
