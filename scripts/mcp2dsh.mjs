#!/usr/bin/env node
/**
 * mcp2dsh —— 把 SapBuddy 的 mcp.json 转成 DSH 原生 dsh-mcp-client 配置行
 *
 * 数据源与行生成逻辑集中在 sapbuddy-tools 的 mcp-store（本脚本是 CLI 薄封装）：
 * - mcp.json 位置：<preset>/mcp.json（SAPBUDDY_HOME 可覆盖）
 * - 输出：@deepseek-ai/dsh-mcp-client 插件行（streamable-http），追加到 home 级
 *   patch（~/.dsh/cordis.patch.yml，对所有 profile 生效 → 所有会话/preset 可用）
 *
 * 用法：
 *   node scripts/mcp2dsh.mjs            # 生成并写入 home patch
 *   node scripts/mcp2dsh.mjs --stdout   # 只打印行，不写文件
 *   node scripts/mcp2dsh.mjs --dry-run  # 预览
 */
import { listMcpServers, renderMcpClientRows, appendMcpToHomePatch, HOME_PATCH } from "sapbuddy-tools/mcp-store"
import fs from "node:fs"

function main() {
  const args = process.argv.slice(2)
  const stdout = args.includes("--stdout")
  const dryRun = args.includes("--dry-run")

  const servers = Object.fromEntries(listMcpServers().map((s) => [s.name, { url: s.url, ...(s.headers ? { headers: s.headers } : {}), ...(s.disabled ? { disabled: true } : {}) }]))
  const rows = renderMcpClientRows(servers)

  if (stdout || dryRun) {
    console.log(`# MCP 服务器（来源 ${listMcpServers().length ? "mcp.json" : "无配置"}）`)
    console.log(rows || "# （无可用 MCP 服务器）")
    if (dryRun) console.log(`# （--dry-run 未写入 ${HOME_PATCH}）`)
    return
  }

  const r = appendMcpToHomePatch()
  if (!r.ok) {
    console.error(`[mcp2dsh] 失败: ${r.error}`)
    process.exit(1)
  }
  console.log(`[mcp2dsh] 已生成 ${r.count} 行 → ${r.target}`)
  console.log(`[mcp2dsh] 提示：重启 dsh 后生效；或手工编辑 ${HOME_PATCH} 管理 MCP 服务器。`)
  if (fs.existsSync(HOME_PATCH)) {
    console.log(`[mcp2dsh] 当前 home patch 内容：\n${fs.readFileSync(HOME_PATCH, "utf8")}`)
  }
}

main()
