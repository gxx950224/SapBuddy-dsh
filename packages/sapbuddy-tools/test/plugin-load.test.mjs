/**
 * 插件加载测试：sapbuddy-tools 在最小 Cordis 上下文中注册 41 个 SAP 工具。
 * 用桩 tools 注册表 + 真实 defineTool 校验（defineTool 构造期即校验 schema 合法性）。
 */
import { test } from "node:test"
import assert from "node:assert/strict"

test("插件注册 41 个 SAP 工具，无重名，schema 合法", async () => {
  const { Context } = await import("@deepseek-ai/cordis")
  const plugin = (await import("../dist/index.js")).default
  const { tools: toolDefs } = await import("../dist/sap-tools/tools/index.js")

  const ctx = new Context()
  const registered = []
  ctx.provide("tools", {
    register: (def) => {
      registered.push(def)
      return () => {}
    },
  })
  ctx.plugin(plugin)
  // cordis 4：ctx.plugin() 同步返回，apply 在下一宏任务执行
  await new Promise((r) => setImmediate(r))

  assert.equal(registered.length, 41, `应注册 41 个工具，实际 ${registered.length}`)
  const names = registered.map((d) => d.name)
  const expected = toolDefs.map((t) => t.name)
  assert.deepEqual([...names].sort(), [...expected].sort(), "注册的工具名应与 tools/index 声明一致")
  assert.equal(new Set(names).size, names.length, "工具名不得重复")

  // 每个工具都有文本输出声明
  for (const d of registered) {
    assert.equal(d.output?.schema?.type, "string", `${d.name} 输出应为 string`)
    assert.equal(typeof d.output?.render, "function", `${d.name} 应提供 render`)
    assert.equal(typeof d.execute, "function", `${d.name} 应提供 execute`)
  }
})

test("schema 形状抽查：search_abap_objects（required/array/integer 投影正确）", async () => {
  const { Context } = await import("@deepseek-ai/cordis")
  const plugin = (await import("../dist/index.js")).default

  const ctx = new Context()
  const registered = []
  ctx.provide("tools", { register: (def) => { registered.push(def); return () => {} } })
  ctx.plugin(plugin)
  await new Promise((r) => setImmediate(r))

  const t = registered.find((d) => d.name === "search_abap_objects")
  assert.ok(t, "应存在 search_abap_objects")
  // defineTool 把参数规格编译为 JSON Schema 形态（type/properties/required）
  const p = t.parameters
  assert.equal(p.type, "object")
  const props = p.properties
  assert.equal(props.pattern.type, "string")
  assert.ok(p.required.includes("pattern"), "pattern 必填")
  assert.ok(!p.required.includes("connectionId"), "connectionId 可选")
  assert.ok(!p.required.includes("types"), "types 可选")
  assert.equal(props.types.type, "array")
  assert.equal(props.types.items.type, "string")
  assert.equal(props.maxResults.type, "integer")
  assert.equal(typeof props.pattern.description, "string", "describe 描述应保留")
})

test("写工具清单与门禁元数据一致", async () => {
  const { writeToolNames, listToolNames } = await import("../dist/index.js")
  const { tools: toolDefs } = await import("../dist/sap-tools/tools/index.js")
  const writeSet = writeToolNames()
  const expected = new Set(toolDefs.filter((t) => t.write).map((t) => t.name))
  assert.deepEqual([...writeSet].sort(), [...expected].sort())
  const list = listToolNames()
  assert.equal(list.length, toolDefs.length)
  assert.ok(list.every((e) => typeof e.write === "boolean"))
})
