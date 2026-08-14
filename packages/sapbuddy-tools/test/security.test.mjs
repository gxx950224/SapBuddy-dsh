/**
 * 安全核心逻辑单测（覆盖 register.ts 的硬编码规则与 shared.ts 的转义）
 * 针对：scanCodeViolations / handleUserMessage 授权窗口 / namespaceViolation / escapeXmlAttr
 */
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const register = require("../dist/sap-tools/register.js")
const shared = require("../dist/sap-tools/tools/shared.js")
const gate = require("../dist/sap-tools/gate.js")

const { scanCodeViolations, handleUserMessage, clearWriteApproval, isWriteApproved, namespaceViolation } = register
const { escapeXmlAttr } = shared
const { configPathViolation } = gate

before(() => clearWriteApproval())
after(() => clearWriteApproval())

// ── scanCodeViolations ───────────────────────────────────────────────────────
test("scanCodeViolations：硬编码中文文案被拦截", () => {
  const code = `WRITE: '你好世界'.`
  const v = scanCodeViolations(code)
  assert.ok(v.some((x) => x.includes("硬编码中文")), `应报中文违规，实际: ${v.join("|")}`)
})

test("scanCodeViolations：注释中的中文不误报", () => {
  const code = `* 这是注释 " 含中文\nWRITE: 'OK'.`
  const v = scanCodeViolations(code)
  assert.deepEqual(v, [])
})

test("scanCodeViolations：程序内局部变量裸类型放行（DATA 变量）", () => {
  const code = `DATA: lv_text TYPE string, lv_i TYPE i.`
  const v = scanCodeViolations(code)
  assert.deepEqual(v, [], `程序内 DATA 裸类型应放行，实际: ${v.join("|")}`)
})

test("scanCodeViolations：方法/函数参数裸类型放行", () => {
  const code = `METHODS m IMPORTING iv_text TYPE string RETURNING VALUE(rv_n) TYPE i.`
  const v = scanCodeViolations(code)
  assert.deepEqual(v, [], `方法参数裸类型应放行，实际: ${v.join("|")}`)
})

test("scanCodeViolations：自建结构 TYPES 块字段裸类型被拦截", () => {
  const code = [
    `TYPES: BEGIN OF ts_line,`,
    `  field1 TYPE string,`,
    `  field2 TYPE i,`,
    `END OF ts_line.`,
  ].join("\n")
  const v = scanCodeViolations(code)
  assert.ok(v.some((x) => x.includes("TYPE STRING")), `应报 TYPE STRING，实际: ${v.join("|")}`)
  assert.ok(v.some((x) => x.includes("TYPE I")), `应报 TYPE I，实际: ${v.join("|")}`)
})

test("scanCodeViolations：TYPES 引用 DDIC 表/元素不误报", () => {
  const code = `TYPES: tt_mard TYPE STANDARD TABLE OF MARD.`
  const v = scanCodeViolations(code)
  assert.deepEqual(v, [], `引用 DDIC 表不应误报，实际: ${v.join("|")}`)
})

test("scanCodeViolations：DDIC DSL 结构字段 abap.* 裸类型被拦截（clnt 放行）", () => {
  const code = [
    `define structure zss_demo {`,
    `  key client : abap.clnt not null;`,
    `  chars : abap.char(3);`,
    `  num   : abap.int4;`,
    `  id    : zdemo_abap_dtel;`,
    `}`,
  ].join("\n")
  const v = scanCodeViolations(code)
  assert.ok(v.some((x) => x.includes("abap.CHAR")), `应报 abap.CHAR，实际: ${v.join("|")}`)
  assert.ok(v.some((x) => x.includes("abap.INT4")), `应报 abap.INT4，实际: ${v.join("|")}`)
  assert.ok(!v.some((x) => x.includes("CLNT")), `abap.clnt 客户端键不应误报，实际: ${v.join("|")}`)
})

test("scanCodeViolations：DDIC 元素/复合类型不误报", () => {
  const code = [
    `DATA: lv_matnr TYPE matnr.`,
    `DATA: lr_ref TYPE REF TO zcl_foo.`,
    `DATA: lt_tab TYPE TABLE OF zstruct.`,
    `DATA: lv_bool TYPE abap_bool.`,
    `DATA: lv_idx TYPE sy-tabix.`,
  ].join("\n")
  const v = scanCodeViolations(code)
  assert.deepEqual(v, [], `不应有违规，实际: ${v.join("|")}`)
})

test("scanCodeViolations：空代码通过", () => {
  assert.deepEqual(scanCodeViolations(""), [])
})

test("scanCodeViolations：CDS 注解中文（@EndUserText.label 等 DDIC 元数据）不误报", () => {
  const code = [
    `@EndUserText.label: '物料编码与描述查询'`,
    `@AbapCatalog.sqlViewName: 'ZCTEST'`,
    `DEFINE VIEW ZC_TEST AS SELECT FROM I_Product`,
    `  KEY ProductID AS ProductId,`,
  ].join("\n")
  const v = scanCodeViolations(code)
  assert.deepEqual(v, [], `CDS 注解中的中文描述不应违规，实际: ${v.join("|")}`)
})

// ── 授权窗口（handleUserMessage）────────────────────────────────────────────
test("授权窗口：明确批准词打开窗口", () => {
  clearWriteApproval()
  handleUserMessage("确认，按这个方案执行")
  assert.equal(isWriteApproved(), true)
})

test("授权窗口：日常应答词不再打开窗口（好的/可以/ok/行）", () => {
  clearWriteApproval()
  for (const msg of ["好的", "可以", "ok", "OK", "行", "好的，谢谢", "嗯嗯"]) {
    handleUserMessage(msg)
    assert.equal(isWriteApproved(), false, `消息"${msg}"不应打开授权窗口`)
  }
})

test("授权窗口：普通查询消息不打开窗口", () => {
  clearWriteApproval()
  handleUserMessage("帮我查一下销售订单的数据")
  assert.equal(isWriteApproved(), false)
})

test("授权窗口：拒绝词清空窗口（即使含确认词）", () => {
  clearWriteApproval()
  handleUserMessage("确认")
  assert.equal(isWriteApproved(), true)
  handleUserMessage("不要了，取消")
  assert.equal(isWriteApproved(), false)
})

test("授权窗口：'不执行'按拒绝处理（先于确认词判断）", () => {
  clearWriteApproval()
  handleUserMessage("先不执行，我再想想")
  assert.equal(isWriteApproved(), false)
})

// ── 命名空间强制（namespaceViolation）───────────────────────────────────────
test("namespaceViolation：Z*/Y* 对象放行", () => {
  assert.equal(namespaceViolation({ name: "ZAIR004" }), "")
  assert.equal(namespaceViolation({ objectName: "zcl_foo" }), "")
  assert.equal(namespaceViolation({ className: "YCL_TEST" }), "")
})

test("namespaceViolation：SAP 标准对象被拦截", () => {
  assert.ok(namespaceViolation({ name: "SAPLSEUH" }).includes("Z*/Y*"))
  assert.ok(namespaceViolation({ objectName: "BC_DATAL" }).includes("Z*/Y*"))
})

test("namespaceViolation：传输请求号等非对象名字段不拦截", () => {
  assert.equal(namespaceViolation({ transportNumber: "DEVK900001" }), "")
  assert.equal(namespaceViolation({}), "")
  assert.equal(namespaceViolation({ objectName: "" }), "")
})

// ── XML 转义（escapeXmlAttr）─────────────────────────────────────────────────
test("escapeXmlAttr：& 先转义，避免二次转义", () => {
  assert.equal(escapeXmlAttr('A&B "Q" <X>'), "A&amp;B &quot;Q&quot; &lt;X&gt;")
  // 含引号时不产生 &amp;quot;（旧 bug 的回归用例）
  assert.equal(escapeXmlAttr('AB"C'), "AB&quot;C")
  assert.equal(escapeXmlAttr('A & B'), "A &amp; B")
})

// ── 敏感配置目录保护（configPathViolation：AI 不得读写安全配置；配置收口于 preset 目录）──
// 用真实 sapbuddyHome() 作为路径前缀（configPathViolation 按真实配置根匹配）
const HOME = require("../dist/sap-tools/sapbuddy-home.js").sapbuddyHome()

test("配置文件禁止 AI 修改：connections.json 被拦截", () => {
  const r = configPathViolation("write", { path: `${HOME}/connections.json` })
  assert.ok(r, "应拦截")
  assert.ok(r.includes("禁止由 AI 直接修改"), `应报写入拦截，实际: ${r?.slice(0, 80)}`)
})

test("配置文件禁止 AI 修改：auth.json / models.json 也被拦截（任意位置）", () => {
  for (const f of [`${HOME}/auth.json`, "/tmp/whatever/models.json"]) {
    const r = configPathViolation("write", { path: f })
    assert.ok(r, `${f} 应被拦截`)
  }
})

test("配置文件禁止 AI 读取：read auth.json 被拦截", () => {
  const r = configPathViolation("read", { path: `${HOME}/auth.json` })
  assert.ok(r)
  assert.ok(r.includes("禁止由 AI 读取"), `应报读取拦截，实际: ${r?.slice(0, 80)}`)
})

test("配置文件禁止 AI 读取：glob/grep 命中敏感文件名也被拦截", () => {
  for (const [tool, arg] of [["glob", "pattern"], ["grep", "path"]]) {
    const r = configPathViolation(tool, { [arg]: `${HOME}/connections.json` })
    assert.ok(r, `${tool} 应拦截敏感配置读取`)
  }
})

test("配置目录保护：output/skills 子树正常放行", () => {
  assert.equal(configPathViolation("read", { path: `${HOME}/output/ZAIR010/ZAIR010.abap` }), undefined)
  assert.equal(configPathViolation("read", { path: `${HOME}/skills/dev-write/SKILL.md` }), undefined)
  assert.equal(configPathViolation("write", { path: `${HOME}/output/ZAIR010/ZAIR010.abap` }), undefined)
})

// ── bash 命令门禁：放行"打开产物/读上传"，仍拦敏感配置/读取 ──
test("bash 命令门禁：start 打开 output 产物放行（自动打开 HTML 流程图场景）", () => {
  const r = configPathViolation("bash", { command: `start "" "${HOME}/output/ZPPR006_NEW2/ZPPR006_NEW2_排产引擎流程图.html"` })
  assert.equal(r, undefined, "打开产物命令不应被拦截")
})

test("bash 命令门禁：start 指向敏感配置仍拦截", () => {
  const r = configPathViolation("bash", { command: `start "" "${HOME}/auth.json"` })
  assert.ok(r, "指向 auth.json 应拦截")
  assert.ok(r.includes("安全拦截"), `应报安全拦截，实际: ${r?.slice(0, 60)}`)
})

test("bash 命令门禁：cat 读取 output 仍拦截（读产物应走 read 工具）", () => {
  const r = configPathViolation("bash", { command: `cat ${HOME}/output/x/y.html` })
  assert.ok(r, "cat 不是放行操作，应拦截")
})

test("bash 命令门禁：路径穿越 ../ 不因 output 前缀被放行", () => {
  const r = configPathViolation("bash", { command: `start "" "${HOME}/output/../auth.json"` })
  assert.ok(r, "含 ../ 的 open 命令应拦截")
})

test("bash 命令门禁：python 读 uploads 上传的 Excel 放行（分析上传文件场景）", () => {
  const r = configPathViolation("bash", { command: `cd ${HOME}/uploads && python -c "import openpyxl; wb = openpyxl.load_workbook('越南翻译文本清单.xlsx')"` })
  assert.equal(r, undefined, "引用仅限 uploads 子树的命令不应被拦截")
})

test("bash 命令门禁：uploads 引用带路径穿越 ../ 仍拦截", () => {
  const r = configPathViolation("bash", { command: `python -c "open('${HOME}/uploads/../../auth.json').read()"` })
  assert.ok(r, "含 ../ 的 uploads 命令应拦截")
})

test("bash 命令门禁：uploads 引用命中敏感配置文件名仍拦截", () => {
  const r = configPathViolation("bash", { command: `cat ${HOME}/uploads/connections.json` })
  assert.ok(r, "uploads 下命中敏感配置文件名也应拦截")
  assert.ok(r.includes("安全拦截"), `应报安全拦截，实际: ${r?.slice(0, 60)}`)
})

// ── pi 版遗留拦截逻辑（自身源码保护 / 产物路径规则）──
// installWriteGate(pi) 为 pi 适配层遗留代码，DSH 版未移植（自身源码保护由 DSH 沙箱
// 对工作区外写入的天然限制覆盖；产物路径规则待 P2 移植为 DSH fs guard）。相关测试
// 保留但跳过，移植后恢复。

// ── 自身源码禁读写（installWriteGate：运行中的 AI 不得读写 SapBuddy 自身代码）────
