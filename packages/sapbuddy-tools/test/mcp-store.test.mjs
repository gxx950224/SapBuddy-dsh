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
