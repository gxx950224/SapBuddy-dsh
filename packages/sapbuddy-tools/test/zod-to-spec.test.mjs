/**
 * zod-to-spec 转换器单测：zod v4 schema → DSH ParameterSchemaSpec。
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { z } = require("zod")
const { zodToParameterSpec } = require("../dist/sap-tools/zod-to-spec.js")

test("基本类型：string/number/int/boolean/enum/optional", () => {
  const spec = zodToParameterSpec(
    z.object({
      name: z.string().describe("对象名"),
      count: z.number(),
      limit: z.number().int().optional().describe("条数"),
      flag: z.boolean(),
      level: z.enum(["INFO", "WARN"]),
    }),
  )
  assert.equal(spec.name.type, "string")
  assert.equal(spec.name.required, true)
  assert.equal(spec.name.description, "对象名")
  assert.equal(spec.count.type, "number")
  assert.equal(spec.limit.type, "integer")
  assert.equal(spec.limit.required, undefined, "optional 不进 required")
  assert.equal(spec.flag.type, "boolean")
  assert.equal(spec.level.type, "string")
  assert.deepEqual(spec.level.enum, ["INFO", "WARN"])
})

test("嵌套 object：必填成员正确投影", () => {
  const spec = zodToParameterSpec(
    z.object({
      texts: z.object({
        name: z.string().describe("对象名"),
        lang: z.string().optional(),
      }),
    }),
  )
  assert.equal(spec.texts.type, "object")
  assert.equal(spec.texts.required, true)
  assert.equal(spec.texts.properties.name.type, "string")
  assert.equal(spec.texts.properties.name.required, true, "嵌套必填")
  assert.equal(spec.texts.properties.lang.required, undefined, "嵌套可选")
  assert.equal(spec.texts.additionalProperties, false, "zod object 默认关闭额外属性")
})

test("array：items 递归转换", () => {
  const spec = zodToParameterSpec(
    z.object({
      types: z.array(z.string()).optional().describe("类型列表"),
    }),
  )
  assert.equal(spec.types.type, "array")
  assert.equal(spec.types.items.type, "string")
  assert.equal(spec.types.description, "类型列表")
})

test("nullable / union：展开为单值或 oneOf", () => {
  const s1 = zodToParameterSpec(z.object({ v: z.string().nullable() }))
  assert.equal(s1.v.type, "string", "nullable 应展开为非 null 分支")

  const s2 = zodToParameterSpec(z.object({ u: z.union([z.string(), z.number()]) }))
  assert.equal(s2.u.type, "oneOf")
  assert.equal(s2.u.oneOf.length, 2)
  assert.equal(s2.u.oneOf[0].type, "string")
  assert.equal(s2.u.oneOf[1].type, "number")
})

test("非 object 根抛错", () => {
  assert.throws(() => zodToParameterSpec(z.string()), /必须是 z\.object/)
})

test("41 个真实工具 schema 均可转换（不抛错）", async () => {
  const { tools } = await import("../dist/sap-tools/tools/index.js")
  for (const t of tools) {
    let spec
    assert.doesNotThrow(() => { spec = zodToParameterSpec(t.inputSchema) }, `${t.name} 转换失败`)
    assert.equal(typeof spec, "object")
    const keys = Object.keys(spec)
    // 允许零参数工具（如 get_connected_systems）——参数表为空同样合法
    for (const k of keys) {
      assert.ok(["string", "number", "integer", "boolean", "null", "array", "object", "json", "oneOf"].includes(spec[k].type), `${t.name}.${k} 类型非法: ${spec[k].type}`)
    }
  }
})
