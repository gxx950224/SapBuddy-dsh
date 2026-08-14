#!/usr/bin/env node
/**
 * sapbuddy-dsh 一键安装器：把 SapBuddy 集成进本机 DeepSeek Harness
 *
 * 做什么：
 *   0. 构建前置：三个包的 dist/ 缺失时自动 pnpm -r build（全新 clone 无 dist）
 *   1. 安装 sapbuddy-tools / sapbuddy-settings / sapbuddy-settings-ui 插件到指定 profile（dsh plugin add）
 *   2. 复制 preset → ~/.dsh/.agent-presets/sapbuddy/
 *
 * 不做什么：**不配置模型/凭据**——模型直接复用 DSH 自身的配置（Web 模型页），
 * sapbuddy-dsh 不写 settings.yaml 的模型段、不写 ~/.dsh/.credentials.yaml。
 *
 * 用法：
 *   node scripts/install.mjs                 # 默认 web profile，file: 安装（推荐，git clone 分发）
 *   node scripts/install.mjs --source npm    # 从 npm registry 安装（需 3 个包已发布；sapbuddy-settings
 *                                            #   的依赖须改为 semver 而非 file:，见包 README）
 *   node scripts/install.mjs --profile headless
 *   node scripts/install.mjs --dry-run       # 预览不执行
 *
 * DSH_BIN 可覆盖 dsh 可执行文件路径。
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..")
const PRESET_SRC = path.join(ROOT, "preset")
const PACKAGE_SRC = path.join(ROOT, "packages", "sapbuddy-tools")
const SETTINGS_PKG_SRC = path.join(ROOT, "packages", "sapbuddy-settings")
const SETTINGS_UI_PKG_SRC = path.join(ROOT, "packages", "sapbuddy-settings-ui")
const PRESET_DST = path.join(os.homedir(), ".dsh", ".agent-presets", "sapbuddy")
const DSH_BIN = process.env.DSH_BIN || "dsh"

function parseArgs(argv) {
  const opts = {
    profile: "web",
    source: "file",
    skipPlugin: false, skipPreset: false,
    force: false, dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--profile") opts.profile = argv[++i]
    else if (a === "--source") opts.source = argv[++i]
    else if (a === "--skip-plugin") opts.skipPlugin = true
    else if (a === "--skip-preset") opts.skipPreset = true
    else if (a === "--force") opts.force = true
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

function main() {
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
      console.log("[0/3] dist 缺失，执行 pnpm -r build 构建 3 个包 ...")
      const b = spawnSync("pnpm", ["-r", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" })
      if (b.status !== 0) {
        console.error("[install] 构建失败：请确认已安装 pnpm 且仓库依赖已就绪（pnpm install），或用 --skip-plugin 跳过插件安装")
        process.exit(1)
      }
    } else {
      console.log("[0/3] dist 已存在，跳过构建")
    }
  }

  // 1) 插件
  if (!opts.skipPlugin) {
    const pkgRef = opts.source === "npm" ? "sapbuddy-tools" : `file:${PACKAGE_SRC}`
    console.log(`[1/3] 安装 sapbuddy-tools → profile "${opts.profile}"（${pkgRef}）...`)
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
    console.log(`[2/3] 复制 preset → ${PRESET_DST}`)
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

  console.log(`
[install] 完成 ✔ 下一步：
  1. 填写 SAP 连接：${path.join(PRESET_DST, "connections.json")}
     （参考 ${path.join(PRESET_DST, "connections.example.json")}；ADT 需在 SICF 激活 /sap/bc/adt）
  2. 模型：直接使用 DSH 自身配置（Web 设置 → 模型页选择 provider/模型；如需填 key 也在此页）
  3. 启动：dsh web → 浏览器打开 → 侧边栏选择 "SapBuddy" preset → 开始会话
  4. 单次问答：dsh --profile headless --patch <sapbuddy-dsh>/overlays/headless.sapbuddy.yml "解释 ZPPR006"
  （headless 需先：dsh plugin --profile headless add sapbuddy-tools）
  SapBuddy 配置集中于 preset 目录（connections/settings/logs/output/uploads），不再使用 ~/.SapBuddy。`)
}

main()
