/**
 * 写门禁单测：decideWriteApproval 纯决策 + installWriteGate 三层集成（注入桩依赖）。
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { decideWriteApproval, extractUserText, installWriteGate } = require("../dist/sap-tools/gate.js")
const { isWriteTool, setWriteApprovalWindow, clearWriteApproval, isWriteApproved, handleUserMessage } = require("../dist/sap-tools/register.js")

const base = { toolName: "create_object_programmatically", args: { name: "ZTEST01" }, readOnly: false, connectionDirty: false, windowApproved: false }

test("decideWriteApproval：只读模式 deny（fail-closed）", () => {
  const d = decideWriteApproval({ ...base, readOnly: true })
  assert.equal(d.kind, "deny")
  assert.match(d.reason, /只读/)
})

test("decideWriteApproval：连接变更 deny（get_connected_systems 除外）", () => {
  assert.equal(decideWriteApproval({ ...base, connectionDirty: true }).kind, "deny")
  const d = decideWriteApproval({ ...base, toolName: "get_connected_systems", connectionDirty: true })
  assert.notEqual(d.kind, "deny", "get_connected_systems 不应被连接变更拦截")
})

test("decideWriteApproval：命名空间违规 deny（Z*/Y* 放行）", () => {
  assert.notEqual(decideWriteApproval({ ...base, args: { name: "SAPLZFOO" } }).kind, "deny", "SAPL<Z/Y> 函数组程序放行")
  const d = decideWriteApproval({ ...base, args: { name: "SFLIGHT" } })
  assert.equal(d.kind, "deny")
  assert.match(d.reason, /Z\*\/Y\*/)
  // 无对象名字段的写调用（如只有 fileUri）不误伤
  assert.notEqual(decideWriteApproval({ ...base, args: { fileUri: "" } }).kind, "deny")
})

test("decideWriteApproval：窗口已开 allow，否则 ask", () => {
  assert.equal(decideWriteApproval({ ...base, windowApproved: true }).kind, "allow")
  const d = decideWriteApproval(base)
  assert.equal(d.kind, "ask")
  assert.match(d.reason, /确认|批准/)
})

test("extractUserText：从 ContentBlock 提取文本", () => {
  assert.equal(extractUserText({ content: [{ type: "text", text: "确认" }, { type: "text", text: "执行" }] }), "确认\n执行")
  assert.equal(extractUserText({ content: [{ type: "image", text: "x" }] }), "")
  assert.equal(extractUserText(undefined), "")
  assert.equal(extractUserText({}), "")
})

test("安装集成：guard 硬规则行为（注入桩）", () => {
  const handlers = {}
  const ctx = {
    get: (name) => (name === "tools" ? { guard: (fn) => { handlers.guard = fn; return () => {} } } : undefined),
    on: (name, fn) => { handlers[name] = fn; return () => {} },
  }
  const state = { readOnly: true, dirty: false, approved: false }
  installWriteGate(ctx, {
    isReadOnly: () => state.readOnly,
    isConnectionDirty: () => state.dirty,
    isWriteApproved: () => state.approved,
    handleUserMessage: (t) => { t.includes("确认") ? setWriteApprovalWindow(60000) : clearWriteApproval() },
  })

  // 读工具：不拦截
  assert.equal(handlers.guard({ name: "search_abap_objects", arguments: {} }), undefined)
  // 写工具 + 只读：deny
  assert.match(handlers.guard({ name: "create_object_programmatically", arguments: { name: "ZFOO" } }), /只读/)
  // 关闭只读后：命名空间违规 deny
  state.readOnly = false
  assert.match(handlers.guard({ name: "create_object_programmatically", arguments: { name: "SFLIGHT" } }), /Z\*\/Y\*/)
  // 合法写调用 + 窗口未开：guard 放行（ask 由 pre-execute 负责）
  assert.equal(handlers.guard({ name: "create_object_programmatically", arguments: { name: "ZFOO" } }), undefined)
})

test("安装集成：pre-execute ask 门（窗口关 → ask；窗口开 → next）", async () => {
  const handlers = {}
  const ctx = {
    get: () => undefined,
    on: (name, fn) => { handlers[name] = fn; return () => {} },
  }
  let approved = false
  let nextCalls = 0
  installWriteGate(ctx, {
    isReadOnly: () => false,
    isConnectionDirty: () => false,
    isWriteApproved: () => approved,
    handleUserMessage: () => {},
  })

  const exec = { name: "create_object_programmatically", arguments: { name: "ZFOO" } }
  const next = async () => { nextCalls++; return { kind: "allow" } }

  const ask = await handlers["tools/pre-execute"](exec, next)
  assert.equal(ask.kind, "ask", "窗口关闭时应 ask")
  assert.equal(nextCalls, 0)

  approved = true
  const allow = await handlers["tools/pre-execute"](exec, next)
  assert.equal(allow.kind, "allow", "窗口开启时应放行")
  assert.equal(nextCalls, 1)

  // 读工具始终 next
  const read = await handlers["tools/pre-execute"]({ name: "search_abap_objects", arguments: {} }, next)
  assert.equal(read.kind, "allow")
})

test("安装集成：用户消息确认词/拒绝词 → 授权窗口", () => {
  const handlers = {}
  const ctx = {
    get: () => undefined,
    on: (name, fn) => { handlers[name] = fn; return () => {} },
  }
  // 用真实 handleUserMessage + 真实窗口状态
  installWriteGate(ctx, {})

  clearWriteApproval()
  assert.equal(isWriteApproved(), false)
  handlers["agent/inbox/claimed"]({ message: { content: [{ type: "text", text: "好的，确认执行" }] } })
  assert.equal(isWriteApproved(), true, "确认词应打开授权窗口")
  handlers["agent/inbox/claimed"]({ message: { content: [{ type: "text", text: "取消，不执行了" }] } })
  assert.equal(isWriteApproved(), false, "拒绝词应清空窗口")
  clearWriteApproval()
})

test("isWriteTool 覆盖写工具清单", () => {
  const { tools } = require("../dist/sap-tools/tools/index.js")
  const writeTools = tools.filter((t) => t.write)
  assert.ok(writeTools.length > 0)
  for (const t of writeTools) assert.equal(isWriteTool(t.name), true)
  for (const t of tools.filter((x) => !x.write)) assert.equal(isWriteTool(t.name), false)
})
