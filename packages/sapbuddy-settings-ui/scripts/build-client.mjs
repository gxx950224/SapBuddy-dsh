/**
 * 构建 sapbuddy-settings 浏览器端 bundle（dist/client.js）
 *
 * DSH 客户端模块加载器要求：文件以 `window.__ModuleLoader__.load({id, factory})`
 * 注册一个 CJS factory（factory 接收加载器的 require，解析已注册的模块：react 等）。
 * esbuild 打 CJS bundle（react / @deepseek-ai/* 为 external），再包进 factory。
 */
import { build } from "esbuild"
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")

const result = await build({
  entryPoints: [join(ROOT, "client/index.ts")],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["react", "react/*", "@deepseek-ai/*"],
  write: false,
})

const code = result.outputFiles[0].text
const wrapped = `/* sapbuddy-settings client bundle (esbuild) */\nwindow.__ModuleLoader__.load({\n  id: "sapbuddy-settings-ui",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n${code}\n    return module.exports;\n  }\n});\n`
mkdirSync(join(ROOT, "dist"), { recursive: true })
writeFileSync(join(ROOT, "dist/client.js"), wrapped)
console.log(`[build-client] dist/client.js ${Buffer.byteLength(wrapped)} bytes`)
