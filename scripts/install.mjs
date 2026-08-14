#!/usr/bin/env node
/**
 * sapbuddy-dsh 一键安装器：把 SapBuddy 集成进本机 DeepSeek Harness
 *
 * 做什么：
 *   0. 构建前置：三个包的 dist/ 缺失时自动 pnpm -r build（全新 clone 无 dist）
 *   1. 安装 sapbuddy-tools / sapbuddy-settings / sapbuddy-settings-ui 插件到指定 profile（dsh plugin add）
 *   2. 复制 preset → ~/.dsh/.agent-presets/sapbuddy/
 *   3. 生成 settings.yaml 的 llm-pi-ai 多模型段（deepseek/qwen/moonshot/zhipu/doubao/minimax/hunyuan/ernie）
 *   4. 写 API Key 到 ~/.dsh/.credentials.yaml（环境变量或交互输入）
 *
 * 用法：
 *   node scripts/install.mjs                 # 默认 web profile，file: 安装（推荐，git clone 分发）
 *   node scripts/install.mjs --source npm    # 从 npm registry 安装（需 3 个包已发布；sapbuddy-settings
 *                                            #   的依赖须改为 semver 而非 file:，见包 README）
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
const SETTINGS_PKG_SRC = path.join(ROOT, "packages", "sapbuddy-settings")
const SETTINGS_UI_PKG_SRC = path.join(ROOT, "packages", "sapbuddy-settings-ui")
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
    skipPlugin: false, skipPreset: false, skipModels: false, skipCredentials: false,
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

  // 0) 构建前置 + 源校验
  if (opts.source === "npm") {
    // npm 源要求 3 个包都已发布到 registry（settings 的依赖也须是 semver 而非 file:）
    for (const [pkg, ver] of [
      ["sapbuddy-tools", JSON.parse(fs.readFileSync(path.join(PACKAGE_SRC, "package.json"), "utf8")).version],
      ["sapbuddy-settings", JSON.parse(fs.readFileSync(SETTINGS_PKG_SRC, "package.json", "utf8")).version],
      ["sapbuddy-settings-ui", JSON.parse(fs.readFileSync(SETTINGS_UI_PKG_SRC, "package.json", "utf8")).version],
    ]) {
      const v = spawnSync("npm", ["view", `${pkg}@${ver}`, "version"], { encoding: "utf8" })
      if (v.status !== 0 || !v.stdout.trim()) {
        console.error(`[install] --source npm 需要 ${pkg}@${ver} 已发布到 npm registry，但未找到。`)
        console.error(`         建议使用默认 git clone + file: 安装（直接运行 node scripts/install.mjs）；`)
        console.error(`         或先发布 3 个包并把 sapbuddy-settings 的依赖改为 "sapbuddy-tools": "^0.2.7" 再重试。`)
        process.exit(1)
      }
    }
  } else {
    // file: 安装要求 dist 已构建（dist 不入库，全新 clone 后为空）
    const entries = [
      [PACKAGE_SRC, "dist/index.js"],
      [SETTINGS_PKG_SRC, "dist/index.js"],
      [SETTINGS_UI_PKG_SRC, "dist/client.js"],
    ]
    const missing = entries.filter(([pkg, rel]) => !fs.existsSync(path.join(pkg, rel)))
    if (missing.length > 0) {
      console.log("[0/4] dist 缺失，执行 pnpm -r build 构建 3 个包 ...")
      const b = spawnSync("pnpm", ["-r", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" })
      if (b.status !== 0) {
        console.error("[install] 构建失败：请确认已安装 pnpm 且仓库依赖已就绪（pnpm install），或用 --skip-plugin 跳过插件安装")
        process.exit(1)
      }
    } else {
      console.log("[0/4] dist 已存在，跳过构建")
    }
  }

  // 1) 插件
  if (!opts.skipPlugin) {
    const pkgRef = opts.source === "npm" ? "sapbuddy-tools" : `file:${PACKAGE_SRC}`
    console.log(`[1/4] 安装 sapbuddy-tools → profile "${opts.profile}"（${pkgRef}）...`)
    const r = run(DSH_BIN, ["plugin", "--profile", opts.profile, "add", pkgRef])
    if (r.status !== 0 && !opts.dryRun) {
      console.error("[install] 插件安装失败，请检查 pnpm/dsh 环境后重试（--skip-plugin 可跳过）")
      process.exit(1)
    }
  }

  // 1b) 设置页包（仅 web profile）：宿主 API 包 + 客户端 UI 包（官方"宿主服务/客户端 UI"分离模式）
  if (opts.profile === "web" && !opts.skipPlugin) {
    for (const [pkg, src] of [["sapbuddy-settings", SETTINGS_PKG_SRC], ["sapbuddy-settings-ui", SETTINGS_UI_PKG_SRC]]) {
      const pkgRef = opts.source === "npm" ? pkg : `file:${src}`
      console.log(`[1b] 安装 ${pkg}（SAP 连接设置）→ web profile（${pkgRef}）...`)
      const r = run(DSH_BIN, ["plugin", "--profile", "web", "add", pkgRef])
      if (r.status !== 0 && !opts.dryRun) {
        console.error(`[install] ${pkg} 安装失败（--skip-plugin 可跳过）`)
        process.exit(1)
      }
    }
    // 在 web profile 的用户 patch 层追加主机行（幂等）。新增行必须用 insert 块——
    // 裸 `- id:` 是给已存在行的覆盖补丁，会报 "entry not found"。
    const patchFile = path.join(os.homedir(), ".dsh", "profiles", "web", "cordis.patch.yml")
    const row = "- insert:\n    - id: sapbuddy-settings\n      name: 'sapbuddy-settings'\n    - id: sapbuddy-settings-ui\n      name: 'sapbuddy-settings-ui'\n"
    const existing = fs.existsSync(patchFile) ? fs.readFileSync(patchFile, "utf8") : ""
    if (existing.includes("id: sapbuddy-settings")) {
      console.log("[1b] web profile patch 已含 sapbuddy-settings 行，跳过")
    } else {
      if (!opts.dryRun) {
        fs.mkdirSync(path.dirname(patchFile), { recursive: true })
        // 空列表 `[]` 行 → 原位替换为行；否则追加到列表末尾
        const lines = existing.split("\n")
        const emptyIdx = lines.findIndex((l) => /^\s*\[\s*\]\s*$/.test(l))
        let next
        if (emptyIdx >= 0) {
          lines.splice(emptyIdx, 1, row.trimEnd())
          next = lines.join("\n") + "\n"
        } else if (existing.trim() === "") {
          next = row
        } else {
          next = existing.trimEnd() + "\n" + row
        }
        fs.writeFileSync(patchFile, next)
        console.log(`[1b] 已追加 sapbuddy-settings 行 → ${patchFile}（重启 dsh web 生效）`)
      } else {
        console.log(`[1b] [dry-run] 追加行到 ${patchFile}`)
      }
    }
  }

  // 2) preset + 配置收口（一切配置自包含于 preset 目录，不再散落 ~/.SapBuddy）
  if (!opts.skipPreset) {
    console.log(`[2/4] 复制 preset → ${PRESET_DST}`)
    if (fs.existsSync(PRESET_DST) && !opts.force) {
      console.log("[install] preset 已存在（--force 覆盖；不覆盖以保留你的修改）")
    } else {
      if (!opts.dryRun) {
        fs.rmSync(PRESET_DST, { recursive: true, force: true })
        fs.cpSync(PRESET_SRC, PRESET_DST, { recursive: true })
      }
    }
    // 提示词同步（老安装升级）：prompts/SYSTEM.md、prompts/Memory.md、AGENTS.md 缺失时补拷。
    // Memory.md 是用户沉淀文件，已存在时绝不覆盖（cp -n 语义）。
    if (!opts.dryRun) {
      for (const rel of ["prompts/SYSTEM.md", "prompts/Memory.md", "AGENTS.md"]) {
        const src = path.join(PRESET_SRC, rel)
        const dst = path.join(PRESET_DST, rel)
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          fs.mkdirSync(path.dirname(dst), { recursive: true })
          fs.copyFileSync(src, dst)
          console.log(`[2c] 补拷提示词 ${rel} → ${dst}`)
        }
      }
    }
    // 配置种子/迁移：connections.json / settings.json 缺失时生成（旧版 ~/.SapBuddy 一次性迁移）
    console.log("[2b] 配置收口：在 preset 目录生成/迁移 connections.json / settings.json")
    const seedFrom = (name, example, legacy) => {
      const dst = path.join(PRESET_DST, name)
      if (fs.existsSync(dst)) return `已有`
      const srcs = [legacy, example ? path.join(PRESET_SRC, example) : undefined].filter(Boolean)
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
    if (!opts.dryRun) fs.mkdirSync(PRESET_DST, { recursive: true })
    console.log(`  connections.json: ${seedFrom("connections.json", "connections.example.json", legacyConn)}`)
    console.log(`  settings.json:    ${seedFrom("settings.json", "settings.example.json", legacySet)}`)
    for (const sub of ["logs", "output", "uploads"]) {
      if (!opts.dryRun) fs.mkdirSync(path.join(PRESET_DST, sub), { recursive: true })
    }
    console.log(`  目录: logs/ output/ uploads/ 已就绪（SapBuddy 全部配置现集中于 ${PRESET_DST}）`)
  }

  // 3) 模型
  if (!opts.skipModels) {
    console.log("[3/4] 生成 settings.yaml llm-pi-ai 多模型段")
    const existing = fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS, "utf8") : ""
    const hasSection = /^\s*llm-pi-ai\s*:/m.test(existing)
    const hasProviderEntries = existing.includes("apiKeyEnv:")
    if (hasSection && hasProviderEntries) {
      console.log("[install] settings.yaml 已有 llm-pi-ai 段（含模型），跳过（可在 Web 模型页或该文件维护）")
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
        // 段已存在但 providers 为空（如 providers: {}）→ 整段替换，避免 YAML 重复键
        const start = existing.search(/^llm-pi-ai\s*:/m)
        const rest = existing.slice(start)
        const m = rest.match(/\n(?=^[A-Za-z0-9_.-]+\s*:)/m)
        const end = m ? start + m.index + 1 : existing.length
        const next = hasSection ? existing.slice(0, start) + block.trimEnd() + existing.slice(end) : existing.trimEnd() + "\n" + block
        fs.writeFileSync(SETTINGS, next)
        console.log("[install] 已写入 llm-pi-ai 段 → " + SETTINGS)
      }
    }
  }

  // 4) 凭据
  if (!opts.skipCredentials) {
    console.log("[4/4] API Key 凭据 → ~/.dsh/.credentials.yaml")
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

  console.log(`
[install] 完成 ✔ 下一步：
  1. 填写 SAP 连接：${path.join(PRESET_DST, "connections.json")}
     （参考 ${path.join(PRESET_DST, "connections.example.json")}；ADT 需在 SICF 激活 /sap/bc/adt）
  2. 启动：dsh web → 浏览器打开 → 侧边栏选择 "SapBuddy" preset → 开始会话
  3. 单次问答：dsh --profile headless --patch <sapbuddy-dsh>/overlays/headless.sapbuddy.yml "解释 ZPPR006"
  （headless 需先：dsh plugin --profile headless add sapbuddy-tools）
  SapBuddy 配置集中于 preset 目录（connections/settings/logs/output/uploads），不再使用 ~/.SapBuddy。`)
}

await main()
