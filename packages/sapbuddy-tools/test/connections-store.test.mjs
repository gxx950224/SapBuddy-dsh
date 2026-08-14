/**
 * connections-store 单测：CRUD / 切换启用 / 密码脱敏与保持 / 配置缓存失效与 dirty 标记。
 * 通过 SAPBUDDY_HOME 指向临时目录，不触碰真实配置。
 */
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const require = createRequire(import.meta.url)

let home = ""
before(() => {
  home = mkdtempSync(join(tmpdir(), "sapbuddy-store-"))
  process.env.SAPBUDDY_HOME = home
})
after(() => {
  delete process.env.SAPBUDDY_HOME
  rmSync(home, { recursive: true, force: true })
})

const store = require("../dist/sap-tools/connections-store.js")
const { isConnectionDirty, clearConnectionDirty } = require("../dist/sap-tools/adtManager.js")

function rawFile() {
  return JSON.parse(readFileSync(join(home, "connections.json"), "utf8"))
}

test("初始无连接；save 新建后 list 可见且密码脱敏", () => {
  assert.deepEqual(store.listConnections(), [])
  const r = store.saveConnection({ id: "dev", url: "https://sap:44300", client: "100", username: "BC01", password: "secret1" })
  assert.equal(r.ok, true)
  const list = store.listConnections()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, "dev")
  assert.equal(list[0].hasPassword, true)
  assert.ok(!("password" in list[0]), "密码不得出现在视图")
  assert.equal(rawFile().connections[0].password, "secret1", "文件保存明文供工具层使用")
})

test("更新：密码留空/*** 保持原密码；新密码覆盖", () => {
  store.saveConnection({ id: "dev", url: "https://sap:44300", username: "BC01", password: "secret2" })
  assert.equal(rawFile().connections[0].password, "secret2")
  // 更新其他字段，密码不传 → 保持
  store.saveConnection({ id: "dev", url: "https://sap:44300", client: "800", username: "BC01" })
  assert.equal(rawFile().connections[0].password, "secret2", "省略密码应保持")
  assert.equal(rawFile().connections[0].client, "800")
  // 传 *** 也保持
  store.saveConnection({ id: "dev", url: "https://sap:44300", username: "BC01", password: "***" })
  assert.equal(rawFile().connections[0].password, "secret2")
})

test("切换启用：activate 置 active，其余清空；get_connected_systems 场景的 dirty 标记", () => {
  clearConnectionDirty()
  store.saveConnection({ id: "prod", url: "https://sap2:44300", username: "BC01", password: "p2" })
  assert.equal(isConnectionDirty(), true, "保存后应标记连接变更")
  store.activateConnection("prod")
  const list = store.listConnections()
  assert.equal(list.find((c) => c.id === "prod").active, true)
  assert.equal(list.find((c) => c.id === "dev").active, false)
})

test("删除：删除启用连接后自动启用剩余第一个", () => {
  store.activateConnection("dev")
  store.deleteConnection("dev")
  const list = store.listConnections()
  assert.equal(list.length, 1)
  assert.equal(list[0].id, "prod")
  assert.equal(list[0].active, true, "删除启用连接后应回落到剩余第一个")
})

test("校验：空 id / 非法 id / 缺 url / 缺用户名 均拒绝；删除不存在的连接报错", () => {
  assert.equal(store.saveConnection({ id: "", url: "x", username: "u" }).ok, false)
  assert.equal(store.saveConnection({ id: "a b", url: "x", username: "u" }).ok, false)
  assert.equal(store.saveConnection({ id: "ok", url: "", username: "u" }).ok, false)
  assert.equal(store.saveConnection({ id: "ok", url: "x", username: "" }).ok, false)
  assert.equal(store.deleteConnection("nope").ok, false)
  assert.equal(store.activateConnection("nope").ok, false)
})

test("首个连接自动启用；重复 id 为更新而非新增", () => {
  const f = mkdtempSync(join(tmpdir(), "sapbuddy-store2-"))
  process.env.SAPBUDDY_HOME = f
  try {
    store.saveConnection({ id: "a", url: "u1", username: "x" })
    store.saveConnection({ id: "a", url: "u2", username: "x" })
    const list = store.listConnections()
    assert.equal(list.length, 1)
    assert.equal(list[0].url, "u2")
    assert.equal(list[0].active, true)
  } finally {
    process.env.SAPBUDDY_HOME = home
    rmSync(f, { recursive: true, force: true })
  }
})
