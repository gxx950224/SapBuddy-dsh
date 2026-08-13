#!/usr/bin/env node
/**
 * sapbuddy-dsh 一键安装器：把 SapBuddy 集成进本机 DeepSeek Harness
 *
 * 做什么：
 *   1. 安装 sapbuddy-tools 插件到指定 profile（dsh plugin add）
 *   2. 复制 preset → ~/.dsh/.agent-presets/sapbuddy/
 *   3. 生成 settings.yaml 的 llm-pi-ai 多模型段（deepseek/qwen/moonshot/zhipu/doubao/minimax/hunyuan/ernie）
 *   4. 写 API Key 到 ~/.dsh/.credentials.yaml（环境变量或交互输入）
 *   5. 若存在 ~/.SapBuddy/mcp.json，调用 mcp2dsh.mjs 转成 dsh-mcp-client 行
 *
 * 用法：
 *   node scripts/install.mjs                 # 默认 web profile，file: 安装
 *   node scripts/install.mjs --source npm    # 从 npm registry 安装 sapbuddy-tools
 *   node scripts/install.mjs --profile headless
 *   node scripts/install.mjs --yes           # 非交互（凭据只从环境变量读）
 *   node scripts/install.mjs --dry-run       # 预览不执行
 *
 * 环境变量（--yes 或非 TTY 时用于写凭据）：DEEPSEEK_API_KEY / QWEN_API_KEY / ...
 * DSH_BIN 可覆盖 dsh 可执行文件路径。
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..")
const PRESET_SRC = path.join(ROOT, "preset")
const PACKAGE_SRC = path.join(ROOT, "packages", "sapbuddy-tools")
const PRESET_DST = path.join(os.homedir(), ".dsh", ".agent-presets", "sapbuddy")
const SETTINGS = path.join(os.homedir(), ".dsh", "settings.yaml")
const CREDENTIALS = path.join(os.homedir(), ".dsh", ".credentials.yaml")
const DSH_BIN = process.env.DSH_BIN || "dsh"

/** 默认多模型 provider 模板（与上游 SapBuddy models.json 一致，全部 openai-completions 网关） */
const PROVIDERS = [
  { key: "deepseek", env: "DEEPSEEK_API_KEY", baseURL: "https://api.deepseek.com/v1", models: ["deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"] },
  { key: "qwen", env: "QWEN_API_KEY", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: ["qwen-plus", "qwen-max", "qwen-max-latest", "qwen2.5-coder-32b-instruct", "qwen3-coder-plus"] },
  { key: "moonshot", env: "MOONSHOT_API_KEY", baseURL: "https://api.moonshot.cn/v1", models: ["moonshot-v1-8k", "moonshot-v1-32k", "kimi-k2"] },
  { key: "zhipu", env: "ZHIPU_API_KEY", baseURL: "https://open.bigmodel.cn/api/paas/v4", models: ["glm-4-plus", "glm-4-flash", "glm-4-air", "glm-4.5"] },
  { key: "doubao", env: "DOUBAO_API_KEY", baseURL: "https://ark.cn-beijing.volces.com/api/v3", models: ["doubao-seed-1.6", "doubao-seed-1.6-250615", "doubao-pro-32k"] },
  { key: "minimax", env: "MINIMAX_API_KEY", baseURL: "https://api.minimax.com/v1", models: ["MiniMax-M2.7", "abab6.5s-chat", "MiniMax-Text-01"] },
  { key: "hunyuan", env: "HUNYUAN_API_KEY", baseURL: "https://api.hunyuan.cloud.tencent.com/v1", models: ["hunyuan-turbo", "hunyuan-pro", "hunyuan-standard"] },
  { key: "ernie", env: "ERNIE_API_KEY", baseURL: "https://qianfan.baidubce.com/v2", models: ["ernie-4.5", "ernie-4.0-8k", "ernie-speed-128k", "ernie-3.5-8k"] },
]

function parseArgs(argv) {
  const opts = {
    profile: "web",
    source: "file",
    skipPlugin: false, skipPreset: false, skipModels: false, skipCredentials: false, skipMcp: false,
    force: false, yes: false, dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--profile") opts.profile = argv[++i]
    else if (a === "--source") opts.source = argv[++i]
    else if (a === "--skip-plugin") opts.skipPlugin = true
    else if (a === "--skip-preset") opts.skipPreset = true
    else if (a === "--skip-models") opts.skipModels = true
    else if (a === "--skip-credentials") opts.skipCredentials = true
    else if (a === "--skip-mcp") opts.skipMcp = true
    else if (a === "--force") opts.force = true
    else if (a === "--yes") opts.yes = true
    else if (a === "--dry-run") opts.dryRun = true
    else { console.error(`[install] 未知参数: ${a}`); process.exit(2) }
  }
  return opts
}

/** 当前解析出的选项（main 内赋值，供 run 使用） */
let opts = null

function run(cmd, args) {
  if (opts.dryRun) { console.log(`[dry-run] ${cmd} ${args.join(" ")}`); return { status: 0 } }
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" })
  return r
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()) }))
}

async function main() {
  opts = parseArgs(process.argv.slice(2))
  console.log(`[install] SapBuddy × DeepSeek Harness 安装器（profile=${opts.profile}, source=${opts.source}）`)

  // 1) 插件
  if (!opts.skipPlugin) {
    const pkgRef = opts.source === "npm" ? "sapbuddy-tools" : `file:${PACKAGE_SRC}`
    console.log(`[1/5] 安装 sapbuddy-tools → profile "${opts.profile}"（${pkgRef}）...`)
    const r = run(DSH_BIN, ["plugin", "--profile", opts.profile, "add", pkgRef])
    if (r.status !== 0 && !opts.dryRun) {
      console.error("[install] 插件安装失败，请检查 pnpm/dsh 环境后重试（--skip-plugin 可跳过）")
      process.exit(1)
    }
  }

  // 2) preset + 配置收口（一切配置自包含于 preset 目录，不再散落 ~/.SapBuddy）
  if (!opts.skipPreset) {
    console.log(`[2/5] 复制 preset → ${PRESET_DST}`)
    if (fs.existsSync(PRESET_DST) && !opts.force) {
      console.log("[install] preset 已存在（--force 覆盖；不覆盖以保留你的修改）")
    } else {
      if (!opts.dryRun) {
        fs.rmSync(PRESET_DST, { recursive: true, force: true })
        fs.cpSync(PRESET_SRC, PRESET_DST, { recursive: true })
      }
    }
    // 配置种子/迁移：connections.json / settings.json / mcp.json 缺失时生成（旧版 ~/.SapBuddy 一次性迁移）
    console.log("[2b] 配置收口：在 preset 目录生成/迁移 connections.json / settings.json / mcp.json")
    const seedFrom = (name, example, legacy) => {
      const dst = path.join(PRESET_DST, name)
      if (fs.existsSync(dst)) return `已有`
      const srcs = [legacy, path.join(PRESET_SRC, example)]
      for (const s of srcs) {
        if (s && fs.existsSync(s)) {
          if (!opts.dryRun) fs.copyFileSync(s, dst)
          return `从 ${path.basename(s)} 生成`
        }
      }
      return `（无模板，跳过）`
    }
    const legacyConn = path.join(os.homedir(), ".SapBuddy", "connections.json")
    const legacySet = path.join(os.homedir(), ".SapBuddy", "settings.json")
    const legacyMcp = path.join(os.homedir(), ".SapBuddy", "mcp.json")
    if (!opts.dryRun) fs.mkdirSync(PRESET_DST, { recursive: true })
    console.log(`  connections.json: ${seedFrom("connections.json", "connections.example.json", legacyConn)}`)
    console.log(`  settings.json:    ${seedFrom("settings.json", "settings.example.json", legacySet)}`)
    console.log(`  mcp.json:         ${seedFrom("mcp.json", undefined, legacyMcp)}`)
    for (const sub of ["logs", "output", "uploads"]) {
      if (!opts.dryRun) fs.mkdirSync(path.join(PRESET_DST, sub), { recursive: true })
    }
    console.log(`  目录: logs/ output/ uploads/ 已就绪（SapBuddy 全部配置现集中于 ${PRESET_DST}）`)
  }

  // 3) 模型
  if (!opts.skipModels) {
    console.log("[3/5] 生成 settings.yaml llm-pi-ai 多模型段")
    const existing = fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS, "utf8") : ""
    if (/^\s*llm-pi-ai\s*:/m.test(existing)) {
      console.log("[install] settings.yaml 已有 llm-pi-ai 段，跳过（可在 Web 模型页或该文件维护）")
    } else {
      const lines = ["", "llm-pi-ai:", "  providers:"]
      for (const p of PROVIDERS) {
        lines.push(`    ${p.key}:`)
        lines.push(`      apiKeyEnv: ${p.env}`)
        lines.push(`      api: openai-completions`)
        lines.push(`      baseURL: ${p.baseURL}`)
        lines.push(`      models:`)
        for (const m of p.models) lines.push(`        - id: ${m}`)
      }
      const block = lines.join("\n") + "\n"
      if (opts.dryRun) { console.log(block) } else {
        fs.mkdirSync(path.dirname(SETTINGS), { recursive: true })
        fs.writeFileSync(SETTINGS, existing.trimEnd() + "\n" + block)
        console.log("[install] 已写入 llm-pi-ai 段 → " + SETTINGS)
      }
    }
  }

  // 4) 凭据
  if (!opts.skipCredentials) {
    console.log("[4/5] API Key 凭据 → ~/.dsh/.credentials.yaml")
    const creds = fs.existsSync(CREDENTIALS) ? fs.readFileSync(CREDENTIALS, "utf8") : ""
    for (const p of PROVIDERS) {
      const fromEnv = process.env[p.env]
      let value = fromEnv
      if (!value && !opts.yes && process.stdin.isTTY) {
        value = await ask(`  ${p.key} 的 ${p.env}（留空跳过）: `)
      }
      if (value) {
        const re = new RegExp(`^${p.env}\\s*:.*$`, "m")
        const line = `${p.env}: ${value}`
        if (!opts.dryRun) {
          fs.mkdirSync(path.dirname(CREDENTIALS), { recursive: true })
          const next = re.test(creds) ? creds.replace(re, line) : creds.trimEnd() + "\n" + line + "\n"
          fs.writeFileSync(CREDENTIALS, next)
        } else {
          console.log(`  [dry-run] 写入 ${line.slice(0, p.env.length + 8)}…`)
        }
      }
    }
    if (opts.yes && !process.env.DEEPSEEK_API_KEY) {
      console.log("[install] --yes 且未设置 DEEPSEEK_API_KEY：跳过凭据（可在 Web 模型页补填）")
    }
  }

  // 5) MCP
  if (!opts.skipMcp) {
    console.log("[5/5] MCP 转换（~/.SapBuddy/mcp.json → dsh-mcp-client 行）")
    const mcp2dsh = path.join(HERE, "mcp2dsh.mjs")
    if (fs.existsSync(path.join(os.homedir(), ".SapBuddy", "mcp.json"))) {
      const r = run(process.execPath, [mcp2dsh, ...(opts.dryRun ? ["--dry-run"] : [])])
      if (r.status !== 0) console.log("[install] mcp2dsh 执行失败（可 --skip-mcp 跳过）")
    } else {
      console.log("[install] 未发现 ~/.SapBuddy/mcp.json，跳过")
    }
  }

  console.log(`
[install] 完成 ✔ 下一步：
  1. 填写 SAP 连接：${path.join(PRESET_DST, "connections.json")}
     （参考 ${path.join(PRESET_DST, "connections.example.json")}；ADT 需在 SICF 激活 /sap/bc/adt）
  2. 启动：dsh web → 浏览器打开 → 侧边栏选择 "SapBuddy" preset → 开始会话
  3. 单次问答：dsh --profile headless --patch <sapbuddy-dsh>/overlays/headless.sapbuddy.yml "解释 ZPPR006"
  （headless 需先：dsh plugin --profile headless add sapbuddy-tools）
  SapBuddy 全部配置已集中于 preset 目录（connections/settings/mcp/logs/output/uploads），不再使用 ~/.SapBuddy。`)
}

await main()
