#!/usr/bin/env node
/**
 * mcp2dsh —— 把 SapBuddy 的 mcp.json 转成 DSH 的 dsh-mcp-client 配置行
 *
 * 输入（与 SapBuddy mcp-client.mjs 同源）：项目 mcp.json 或 ~/.SapBuddy/mcp.json
 *   { "mcpServers": { "<name>": { "url": "...", "headers": {...}, "disabled": false } } }
 * 输出：@deepseek-ai/dsh-mcp-client 插件行（streamable-http），默认追加到
 *   ~/.dsh/cordis.patch.yml（home 层，对所有 profile 生效）。
 *
 * 用法：
 *   node scripts/mcp2dsh.mjs            # 追加到 ~/.dsh/cordis.patch.yml
 *   node scripts/mcp2dsh.mjs --stdout   # 只打印行，不写文件
 *   node scripts/mcp2dsh.mjs --target <path>   # 写入指定 patch 文件
 *   node scripts/mcp2dsh.mjs --dry-run  # 预览将写入的内容
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const GLOBAL_MCP = path.join(os.homedir(), ".SapBuddy", "mcp.json")
const PRESET_MCP = path.join(os.homedir(), ".dsh", ".agent-presets", "sapbuddy", "mcp.json")
const PROJECT_MCP = path.join(process.cwd(), "mcp.json")
const HOME_PATCH = path.join(os.homedir(), ".dsh", "cordis.patch.yml")

/** 读 mcp.json：项目 → preset 目录 → 旧全局（配置收口于 preset 目录） */
export function loadMcpServers() {
  for (const f of [PROJECT_MCP, PRESET_MCP, GLOBAL_MCP]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, "utf8"))
      if (j && j.mcpServers && typeof j.mcpServers === "object") return { source: f, servers: j.mcpServers }
    } catch { /* 继续 */ }
  }
  return { source: undefined, servers: {} }
}

/** 行 id：serverName 约束 [A-Za-z0-9_-]{1,32}；id 需小写 kebab */
function sanitizeId(name) {
  return "mcp-" + String(name).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32)
}

/** 生成 dsh-mcp-client 配置行（YAML 文本） */
export function renderRows(servers) {
  const out = []
  for (const [name, s] of Object.entries(servers)) {
    if (!s || s.disabled === true || !s.url) continue
    const lines = []
    lines.push(`- id: ${sanitizeId(name)}`)
    lines.push(`  name: '@deepseek-ai/dsh-mcp-client'`)
    lines.push(`  config:`)
    lines.push(`    serverName: ${name}`)
    lines.push(`    transport: streamable-http`)
    lines.push(`    url: ${s.url}`)
    if (s.headers && typeof s.headers === "object" && Object.keys(s.headers).length > 0) {
      lines.push(`    headers:`)
      for (const [hk, hv] of Object.entries(s.headers)) {
        lines.push(`      ${hk}: ${typeof hv === "string" ? JSON.stringify(hv) : hv}`)
      }
    }
    out.push(lines.join("\n"))
  }
  return out.join("\n")
}

function main() {
  const args = process.argv.slice(2)
  const stdout = args.includes("--stdout")
  const dryRun = args.includes("--dry-run")
  const targetArg = args[args.indexOf("--target") + 1]

  const { source, servers } = loadMcpServers()
  const rows = renderRows(servers)
  const header = `# 由 sapbuddy-dsh/scripts/mcp2dsh.mjs 生成（来源: ${source ?? "无 mcp.json"}）\n# 编辑请保留 dsh-mcp-client 行结构；重新运行会追加新行（已有行请手工去重）`

  if (stdout || dryRun) {
    console.log(header)
    console.log(rows || "# （无可用 MCP 服务器）")
    return
  }

  const target = targetArg || HOME_PATCH
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : ""
  const block = `\n${header}\n${rows}\n`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, existing.trimEnd() + "\n" + block)
  console.log(`[mcp2dsh] 已追加 ${rows ? rows.split("\n").filter(Boolean).length + " 行" : "0 行（无可用服务器）"} → ${target}`)
  console.log(`[mcp2dsh] 提示：修改 ~/.dsh/cordis.patch.yml 后重启 dsh 生效；或直接编辑该文件管理 MCP 服务器。`)
}

main()
