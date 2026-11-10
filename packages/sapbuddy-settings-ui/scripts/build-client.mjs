/**
 * 构建 sapbuddy-settings 浏览器端 bundle（dist/client.js）
 *
 * DSH 客户端模块加载器要求：文件以 `window.__ModuleLoader__.load({id, factory})`
 * 注册一个 CJS factory（factory 接收加载器的 require，解析已注册的模块：react 等）。
 * esbuild 打 CJS bundle（react / @deepseek-ai/* 为 external），再包进 factory。
 *
 * 两个兼容点（见 wrapClientBundle）：
 * 1. esbuild 的 CJS 产物会 `module.exports = __toCommonJS(...)` 整体换掉 exports 对象。
 *    当前 DSH 的 client-modules 取 factory 的【返回值】，所以这样能工作；但历史上/未来
 *    若有加载器持有 factory 里最初的 exports 引用，就会读不到 apply/inject。这里把产物
 *    的导出再挂回最初的 exports 对象并返回它，两种加载方式都能拿到 apply/inject。
 * 2. 补 `Symbol.toStringTag = "Module"`，与官方构建预设产出的 bundle 形态一致。
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
const wrapped = wrapClientBundle(code, {
  id: "sapbuddy-settings-ui",
  banner: "sapbuddy-settings client bundle",
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
