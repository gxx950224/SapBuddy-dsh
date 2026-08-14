#!/usr/bin/env node
/**
 * sapbuddy-dsh 恢复脚本 —— 若 web profile 因设置页插件启动失败，一键回到稳定状态
 *
 * 原理：SAP 连接设置页（sapbuddy-settings / sapbuddy-settings-ui）完全由 web profile
 * 用户 patch 层（~/.dsh/profiles/web/cordis.patch.yml）的两行决定。把 patch 重置为空
 * 列表 = 禁用设置页，恢复未安装时的原始状态；sapbuddy 工具 preset 不受影响（它在
 * ~/.dsh/.agent-presets/sapbuddy，与 profile patch 无关）。
 *
 * 用法：
 *   node scripts/recover.mjs          # 备份并重置 patch 为 []（推荐，立即恢复）
 *   node scripts/recover.mjs --full   # 重置 patch + 从 profile 移除两个设置包
 *   node scripts/recover.mjs --dry-run# 只打印将做什么
 *
 * 恢复后：重启 dsh web 即回到稳定状态。设置页配置（connections.json 等）不会被删除，
 * 之后想重试设置页：node scripts/install.mjs 即可重新接入。
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..")
const PATCH = path.join(os.homedir(), ".dsh", "profiles", "web", "cordis.patch.yml")
const DSH_BIN = process.env.DSH_BIN || "dsh"

const TEMPLATE = `# Your patch layer for this dsh profile, applied after every bundle layer:
# a top-level YAML array of loader patch entries (id-targeted config
# overrides, disables, and insert lists; \`!!js\` expressions allowed).
[]
`

function main() {
  const args = process.argv.slice(2)
  const full = args.includes("--full")
  const dryRun = args.includes("--dry-run")

  console.log("[recover] web profile 恢复：重置用户 patch 层")
  if (dryRun) console.log("[recover] --dry-run：不实际修改")

  // 1) 备份 + 重置 patch
  if (fs.existsSync(PATCH)) {
    const backup = `${PATCH}.bak-${Date.now()}`
    if (!dryRun) {
      fs.copyFileSync(PATCH, backup)
      fs.writeFileSync(PATCH, TEMPLATE)
    }
    console.log(`[recover] patch 已备份 → ${backup}`)
    console.log(`[recover] patch 已重置为 []（设置页已禁用；sapbuddy 工具 preset 不受影响）`)
  } else {
    if (!dryRun) fs.mkdirSync(path.dirname(PATCH), { recursive: true })
    if (!dryRun) fs.writeFileSync(PATCH, TEMPLATE)
    console.log("[recover] patch 不存在，已创建空模板")
  }

  // 2) 可选：移除设置包
  if (full) {
    for (const pkg of ["sapbuddy-settings", "sapbuddy-settings-ui"]) {
      console.log(`[recover] 从 web profile 移除 ${pkg} ...`)
      if (dryRun) continue
      const r = spawnSync(DSH_BIN, ["plugin", "--profile", "web", "remove", pkg], { stdio: "inherit", shell: process.platform === "win32" })
      if (r.status !== 0) console.error(`[recover] 移除 ${pkg} 失败（可手动 dsh plugin --profile web remove ${pkg}）`)
    }
  }

  console.log(`
[recover] 完成。请重启 dsh web：
  重启后即回到未安装 SAP 连接设置页的稳定状态（SapBuddy 41 工具、preset、模型配置均不受影响）。
  之后想重新启用设置页：node scripts/install.mjs
  想彻底还原（含包）：node scripts/recover.mjs --full 后再 node scripts/install.mjs`)
}

main()
