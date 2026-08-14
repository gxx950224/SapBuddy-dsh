/**
 * 提示词注入单测：installPromptFiles 注册 3 段 section，text provider 每次组装实时读文件。
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const require = createRequire(import.meta.url)
const { installPromptFiles } = require("../dist/sap-tools/prompt-files.js")

function fakeCtx(capture) {
  return {
    get: (name) =>
      name === "systemPrompt"
        ? { section: (s) => { capture[s.name] = s; return () => {} } }
        : undefined,
  }
}

test("installPromptFiles：注册 3 段，text provider 实时读文件（Memory 即改即生效）", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sapbuddy-prompts-"))
  fs.mkdirSync(path.join(tmp, "prompts"), { recursive: true })
  fs.writeFileSync(path.join(tmp, "prompts", "SYSTEM.md"), "# SYSTEM 测试")
  fs.writeFileSync(path.join(tmp, "AGENTS.md"), "# AGENTS 测试")
  fs.writeFileSync(path.join(tmp, "prompts", "Memory.md"), "# Memory 测试")

  const sections = {}
  const disposers = installPromptFiles(fakeCtx(sections), tmp)
  assert.equal(disposers.length, 3)

  assert.equal(sections["sapbuddy.prompts.system"].text(), "# SYSTEM 测试")
  assert.equal(sections["sapbuddy.prompts.agents"].text(), "# AGENTS 测试")
  assert.equal(sections["sapbuddy.prompts.memory"].text(), "# Memory 测试")

  // 每次组装重新读文件：Memory.md 追加后即反映（避坑沉淀机制）
  fs.appendFileSync(path.join(tmp, "prompts", "Memory.md"), "\n## 新避坑条目")
  assert.ok(sections["sapbuddy.prompts.memory"].text().includes("新避坑条目"))

  // order 为负（在 persona(0) 之前渲染）
  for (const name of ["sapbuddy.prompts.system", "sapbuddy.prompts.agents", "sapbuddy.prompts.memory"]) {
    assert.ok(sections[name].order < 0, `${name} order 应为负`)
  }
})

test("installPromptFiles：systemPrompt 缺失 → 不注册；文件缺失 → text 返回空串", () => {
  assert.deepEqual(installPromptFiles({ get: () => undefined }), [])

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sapbuddy-prompts-empty-"))
  const sections = {}
  const disposers = installPromptFiles(fakeCtx(sections), tmp)
  assert.equal(disposers.length, 3)
  assert.equal(sections["sapbuddy.prompts.system"].text(), "")
  assert.equal(sections["sapbuddy.prompts.memory"].text(), "")
})
