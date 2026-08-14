/**
 * mcp-store 单测：MCP 服务器 CRUD / 校验 / dsh-mcp-client 行生成 / home patch 写入。
 * 通过 SAPBUDDY_HOME 指向临时目录 + HOME 环境变量指向临时 home（home patch 写入隔离）。
 */
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const require = createRequire(import.meta.url)

let home = ""
let fakeHome = ""
const realHome = process.env.HOME
before(() => {
  home = mkdtempSync(join(tmpdir(), "sapbuddy-mcp-"))
  fakeHome = mkdtempSync(join(tmpdir(), "sapbuddy-home-"))
  process.env.SAPBUDDY_HOME = home
  process.env.HOME = fakeHome
})
after(() => {
  delete process.env.SAPBUDDY_HOME
  process.env.HOME = realHome
  rmSync(home, { recursive: true, force: true })
  rmSync(fakeHome, { recursive: true, force: true })
})

const store = require("../dist/sap-tools/mcp-store.js")

test("初始为空；save 新建后 list 可见", () => {
  assert.deepEqual(store.listMcpServers(), [])
  const r = store.saveMcpServer("sap-ai", { url: "https://host/sap/bc/adt/mcp", headers: { Authorization: "Bearer x" } })
  assert.equal(r.ok, true)
  const list = store.listMcpServers()
  assert.equal(list.length, 1)
  assert.equal(list[0].name, "sap-ai")
  assert.equal(list[0].hasHeaders, true)
  assert.equal(list[0].disabled, false)
})

test("校验：非法名/空 url/非法 url 拒绝；disabled 服务器保留在列表", () => {
  assert.equal(store.saveMcpServer("bad name", { url: "x" }).ok, false)
  assert.equal(store.saveMcpServer("ok1", { url: "" }).ok, false)
  assert.equal(store.saveMcpServer("ok1", { url: "not a url" }).ok, false)
  const r = store.saveMcpServer("off", { url: "https://x", disabled: true })
  assert.equal(r.ok, true)
  assert.equal(store.listMcpServers().find((s) => s.name === "off").disabled, true)
})

test("删除：不存在报错；删除后列表消失", () => {
  assert.equal(store.deleteMcpServer("nope").ok, false)
  assert.equal(store.deleteMcpServer("off").ok, true)
  assert.equal(store.listMcpServers().some((s) => s.name === "off"), false)
})

test("renderMcpClientRows：生成 dsh-mcp-client 行（disabled 跳过、headers 透传）", () => {
  const rows = store.renderMcpClientRows({
    sap: { url: "https://host/mcp", headers: { Authorization: "Bearer t" } },
    off: { url: "https://x", disabled: true },
  })
  assert.ok(rows.includes("- id: mcp-sap"), "应含 mcp-sap 行")
  assert.ok(rows.includes("name: '@deepseek-ai/dsh-mcp-client'"))
  assert.ok(rows.includes("transport: streamable-http"))
  assert.ok(rows.includes("serverName: sap"))
  assert.ok(rows.includes('Authorization: "Bearer t"'), "headers 应透传")
  assert.ok(!rows.includes("mcp-off"), "disabled 服务器应跳过")
})

test("appendMcpToHomePatch：写入 home patch，幂等替换生成块", () => {
  const r1 = store.appendMcpToHomePatch()
  assert.equal(r1.ok, true)
  assert.ok(r1.count > 0)
  const target = join(fakeHome, ".dsh", "cordis.patch.yml")
  assert.ok(existsSync(target), "home patch 应生成")
  const text = readFileSync(target, "utf8")
  assert.ok(text.includes("mcp-sap") && text.includes("dsh-mcp-client"), "patch 应含生成行")
  const countBefore = (text.match(/mcp-sap/g) || []).length

  // 修改服务器后再生成：块整体替换而非追加
  store.saveMcpServer("sap2", { url: "https://host2/mcp" })
  const r2 = store.appendMcpToHomePatch()
  assert.equal(r2.ok, true)
  const text2 = readFileSync(target, "utf8")
  assert.ok(text2.includes("mcp-sap2"), "新服务器应出现")
  const countAfter = (text2.match(/mcp-sap2/g) || []).length
  assert.ok(countAfter >= 1)
  // 不应重复累积旧块
  assert.ok(!text2.includes("mcp-sap:"), "被删除的服务器不应残留")
})

test("replaceMcpServers：整体替换（支持 mcpServers 包装与直接映射；校验失败拒绝）", () => {
  // 包装形式
  let r = store.replaceMcpServers({ mcpServers: { a: { url: "https://a/mcp" }, b: { url: "https://b/mcp", headers: { "X-K": "v" } } } })
  assert.equal(r.ok, true)
  assert.equal(store.listMcpServers().length, 2)
  // 直接映射形式（覆盖旧值）
  r = store.replaceMcpServers({ c: { url: "https://c/mcp" } })
  assert.equal(r.ok, true)
  const list = store.listMcpServers()
  assert.equal(list.length, 1)
  assert.equal(list[0].name, "c")
  // 校验失败整体拒绝
  r = store.replaceMcpServers({ ok1: { url: "https://ok" }, bad: { url: "not a url" } })
  assert.equal(r.ok, false)
  assert.ok(r.error.includes("bad"), "错误应指名坏服务器")
  assert.equal(store.listMcpServers().length, 1, "失败不应写盘")
  // 非对象顶层拒绝
  assert.equal(store.replaceMcpServers([]).ok, false)
  assert.equal(store.replaceMcpServers("x").ok, false)
})

test("appendMcpToHomePatch：无服务器时 home patch 必须是合法空数组（修复启动崩溃）", () => {
  // 清空所有服务器后重新生成 → patch 应为 []，且能被 YAML 解析为数组
  store.replaceMcpServers({ mcpServers: {} })
  const r = store.appendMcpToHomePatch()
  assert.equal(r.ok, true)
  assert.equal(r.count, 0)
  const target = join(fakeHome, ".dsh", "cordis.patch.yml")
  const text = readFileSync(target, "utf8")
  const yaml = require("js-yaml")
  const parsed = yaml.load(text)
  assert.ok(Array.isArray(parsed), "home patch 必须是顶层数组（否则 dsh 启动失败）")
  assert.equal(parsed.length, 0, "无服务器时数组应为空")

  // 加一台再生成 → 仍是合法数组且含行
  store.saveMcpServer("sap", { url: "https://host/mcp" })
  const r2 = store.appendMcpToHomePatch()
  assert.equal(r2.ok, true)
  const parsed2 = yaml.load(readFileSync(target, "utf8"))
  assert.ok(Array.isArray(parsed2), "有服务器时仍须是顶层数组")
  assert.equal(parsed2.length, 1, "应恰好一行 dsh-mcp-client")
  assert.equal(parsed2[0].id, "mcp-sap")
})

test("appendMcpToHomePatch：历史脏状态归一化（粘连[]/重复注释/旧块残留）始终合法", () => {
  const yaml = require("js-yaml")
  store.replaceMcpServers({ mcpServers: {} }) // 隔离：清空此前测试残留
  const target = join(fakeHome, ".dsh", "cordis.patch.yml")
  const write = (t) => require("node:fs").writeFileSync(target, t)
  const read = () => require("node:fs").readFileSync(target, "utf8")
  // 1) 复现用户遇到的损坏态：粘连 [] + 重复注释 + 旧 MCP 块
  write("# dsh home-level patch layer (applies to every profile)\n[]# dsh home-level patch layer (applies to every profile)\n[]\n\n# MCP 服务器（由 sapbuddy-dsh 设置页生成，来源 x）\n\n")
  store.saveMcpServer("s1", { url: "https://a/mcp" })
  let r = store.appendMcpToHomePatch()
  assert.equal(r.ok, true)
  let y = yaml.load(read())
  assert.ok(Array.isArray(y), "损坏态归一化后必须是数组")
  assert.equal(y.length, 1)
  assert.equal(y[0].id, "mcp-s1")
  // 2) 清空后再生成 → 回到合法 []
  store.replaceMcpServers({ mcpServers: {} })
  r = store.appendMcpToHomePatch()
  assert.equal(r.ok, true)
  y = yaml.load(read())
  assert.ok(Array.isArray(y))
  assert.equal(y.length, 0)
  // 3) 空文件 + 服务器 → 只有行，无 [] 残留
  write("")
  store.saveMcpServer("s2", { url: "https://b/mcp" })
  r = store.appendMcpToHomePatch()
  assert.equal(r.ok, true)
  y = yaml.load(read())
  assert.ok(Array.isArray(y))
  assert.equal(y.length, 1)
  assert.equal(y[0].id, "mcp-s2")
  assert.ok(!read().includes("[]"), "不应有 [] 与行并列")
})
