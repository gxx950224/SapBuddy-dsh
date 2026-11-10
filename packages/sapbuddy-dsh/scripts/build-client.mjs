/**
 * 构建统一包 sapbuddy-dsh 的浏览器端 bundle（dist/client.js）
 *
 * 统一包的设置页 UI 与 `packages/sapbuddy-settings-ui/client/index.ts` 是同一份源码，
 * 只换注册 id / 头注释，避免两份 dist 长期漂移（历史上一直是无脚本的手工同步）。
 *
 * 兼容点（与 sapbuddy-settings-ui/scripts/build-client.mjs 相同）：
 * esbuild 的 CJS 产物会 `module.exports = __toCommonJS(...)` 整体换掉 exports 对象；
 * 当前 DSH 取 factory 的【返回值】所以可用，但这里把导出再挂回最初的 exports 对象并
 * 返回它，并补 `Symbol.toStringTag = "Module"`，两种加载器形态都能读到 apply/inject。
 */
import { build } from "esbuild"
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const SRC = join(ROOT, "../sapbuddy-settings-ui/client/index.ts")

const result = await build({
  entryPoints: [SRC],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["react", "react/*", "@deepseek-ai/*"],
  write: false,
})

const code = result.outputFiles[0].text
const wrapped = wrapClientBundle(code, {
  id: "sapbuddy-dsh",
  banner: "sapbuddy-dsh client bundle",
})
mkdirSync(join(ROOT, "dist"), { recursive: true })
writeFileSync(join(ROOT, "dist/client.js"), wrapped)
console.log(`[build-client] dist/client.js ${Buffer.byteLength(wrapped)} bytes`)

/**
 * 把 esbuild 的 CJS 产物包进 `window.__ModuleLoader__.load({id, factory})`。
 * @param {string} code - esbuild format=cjs 的产物（可能以 `module.exports = __toCommonJS(...)` 结尾）。
 * @param {{ id: string, banner: string }} options - 注册 id 与文件头注释。
 * @returns {string} 浏览器端 bundle 源码。
 */
function wrapClientBundle(code, { id, banner }) {
  return `/* ${banner} (esbuild) */
window.__ModuleLoader__.load({
  id: ${JSON.stringify(id)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    // esbuild 的 CJS 导出对象被换掉了：把导出挂回最初的 exports 对象并返回它，
    // 使「取返回值」与「取最初 exports 引用」两种加载器都能读到 apply / inject。
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    if (module.exports !== exports) {
      for (const key of Object.keys(module.exports)) {
        if (!Object.prototype.hasOwnProperty.call(exports, key)) {
          Object.defineProperty(exports, key, Object.getOwnPropertyDescriptor(module.exports, key));
        }
      }
    }
    return exports;
  }
});
`
}
