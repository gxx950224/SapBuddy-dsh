/**
 * SapBuddy 配置根目录（自包含解析）
 *
 * 所有配置（connections.json / settings.json / mcp.json / logs / output / uploads）
 * 统一收口到 DSH 的 agent preset 目录，随 preset 一起分发、一起升级，不再散落
 * 在 ~/.SapBuddy 多处。
 *
 * 解析顺序：
 *   1. SAPBUDDY_HOME 环境变量（显式指定，如便携部署）
 *   2. 默认 <$DSH_HOME|~/.dsh>/.agent-presets/sapbuddy
 *
 * 旧版 ~/.SapBuddy 仅由安装器（scripts/install.mjs）做一次性迁移，工具层不再读写。
 */
import os from "node:os"
import path from "node:path"

export function sapbuddyHome(): string {
  if (process.env.SAPBUDDY_HOME) return process.env.SAPBUDDY_HOME
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh")
  return path.join(dshHome, ".agent-presets", "sapbuddy")
}

/** 拼接配置根下的子路径 */
export function sapbuddyPath(...segs: string[]): string {
  return path.join(sapbuddyHome(), ...segs)
}
