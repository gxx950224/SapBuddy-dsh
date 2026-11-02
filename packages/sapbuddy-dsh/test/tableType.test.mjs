/** 表类型（TTYP/DA）：枚举校验 + 定义校验 + XML 生成 + 写入流程（mock HTTP，不连 SAP） */
import { test } from "node:test"
import assert from "node:assert/strict"
const DIST = "../dist/sap-tools/tools"
const tt = await import(`${DIST}/tableType.js`)
const { createObjectTool } = await import(`${DIST}/writeTools.js`)

const ok = (def) => { const r = tt.normalizeTableTypeDefinition(def); assert.ok(r.ok, JSON.stringify(r.errors)); return r.value }
const bad = (def, frag) => { const r = tt.normalizeTableTypeDefinition(def); assert.equal(r.ok, false); assert.ok(r.errors.join("|").includes(frag), r.errors.join("|")) }

test("schema：objectType 枚举包含 TTYP/DA，非法值被拒", () => {
  const s = createObjectTool.inputSchema
  const base = { name: "ZTT_X", description: "d", packageName: "$TMP" }
  assert.ok(s.safeParse({ ...base, objectType: "TTYP/DA", rowType: "BAPIRET2" }).success)
  assert.equal(s.safeParse({ ...base, objectType: "TTYP/XX" }).success, false)
  assert.equal(s.safeParse({ ...base, objectType: "TTYP/DA", accessType: "index" }).success, false)
  assert.equal(s.safeParse({ ...base, objectType: "TTYP/DA", keyKind: "maybe" }).success, false)
})

test("工具：TTYP/DA 缺 rowType 在连 SAP 前拦截", async () => {
  const out = await createObjectTool.execute({ objectType: "TTYP/DA", name: "ZTT_X", description: "d", packageName: "$TMP", connectionId: "none" })
  assert.ok(out.includes("rowType"), out)
})

test("工具：hashed + nonUnique 被拦截", async () => {
  const out = await createObjectTool.execute({ objectType: "TTYP/DA", name: "ZTT_X", description: "d", packageName: "$TMP", rowType: "BAPIRET2", accessType: "hashed", keyKind: "nonUnique", connectionId: "none" })
  assert.ok(out.includes("hashed"), out)
})

test("定义校验：默认值 / 内置类型自动识别 / 各类错误", () => {
  const d = ok({ rowType: "bapiret2" })
  assert.deepEqual([d.rowType, d.rowTypeKind, d.accessType, d.keyDefinition, d.keyKind], ["BAPIRET2", "dictionaryType", "standard", "standard", "nonUnique"])
  assert.equal(ok({ rowType: "string" }).rowTypeKind, "predefinedAbapType")
  assert.equal(ok({ rowType: "ZS", accessType: "hashed" }).keyKind, "unique")
  bad({ rowType: "C" }, "length")
  bad({ rowType: "I", decimals: 2 }, "decimals")
  bad({ rowType: "STRING", rowTypeKind: "dictionaryType" }, "内置类型")
  bad({ rowType: "ZS", accessType: "standard", keyKind: "unique" }, "nonUnique")
  bad({ rowType: "ZS", accessType: "sorted", keyDefinition: "empty" }, "空键")
  bad({ rowType: "ZS", keyDefinition: "keyComponents" }, "keyComponents")
  bad({ rowType: "STRING", keyDefinition: "keyComponents", keyComponents: ["A"] }, "DDIC 结构")
  bad({ rowType: "ZS", keyComponents: ["A"] }, "只有 keyDefinition")
  bad({ rowType: "ZS", keyDefinition: "keyComponents", keyComponents: ["A", "a"] }, "重复")
  bad({ rowType: "Z S" }, "不合法")
})

for (const accessType of ["standard", "sorted", "hashed"]) {
  for (const keyDefinition of ["standard", "rowType", "keyComponents", "empty"]) {
    for (const keyKind of ["nonUnique", "unique"]) {
      const def = { rowType: "ZS_ROW", accessType, keyDefinition, keyKind, keyComponents: keyDefinition === "keyComponents" ? ["BUKRS", "belnr"] : undefined }
      const r = tt.normalizeTableTypeDefinition(def)
      const valid = !(accessType === "standard" && keyKind === "unique") && !(accessType === "hashed" && keyKind !== "unique") && !(keyDefinition === "empty" && accessType !== "standard")
      test(`XML：${accessType}/${keyDefinition}/${keyKind} → ${valid ? "生成" : "拦截"}`, () => {
        assert.equal(r.ok, valid, JSON.stringify(r.errors))
        if (!valid) return
        const xml = tt.buildTableTypeXml({ name: "ztt_row", description: 'a & "b"', packageName: "$tmp", language: "zh", responsible: "dev" }, r.value)
        assert.match(xml, /<ttyp:tableType xmlns:ttyp="http:\/\/www\.sap\.com\/dictionary\/tabletype"/)
        assert.match(xml, /adtcore:name="ZTT_ROW" adtcore:type="TTYP\/DA"/)
        assert.match(xml, /adtcore:description="a &amp; &quot;b&quot;"/)
        assert.match(xml, /<adtcore:packageRef adtcore:name="\$TMP"\/>/)
        assert.match(xml, /<ttyp:rowType><ttyp:typeKind>dictionaryType<\/ttyp:typeKind><ttyp:typeName>ZS_ROW<\/ttyp:typeName><ttyp:builtInType><ttyp:dataType>STRU<\/ttyp:dataType>/)
        assert.ok(xml.includes(`<ttyp:accessType>${accessType}</ttyp:accessType>`))
        assert.ok(xml.includes(`<ttyp:definition>${keyDefinition}</ttyp:definition><ttyp:kind>${keyKind}</ttyp:kind>`))
        if (keyDefinition === "keyComponents")
          assert.ok(xml.includes('<ttyp:components ttyp:isVisible="true"><ttyp:component ttyp:name="BUKRS"/><ttyp:component ttyp:name="BELNR"/></ttyp:components>'))
        else assert.ok(xml.includes('<ttyp:components ttyp:isVisible="false"/>'))
        // 元素顺序：rowType → initialRowCount → accessType → primaryKey → secondaryKeys
        const order = ["<ttyp:rowType>", "<ttyp:initialRowCount>", "<ttyp:accessType>", "<ttyp:primaryKey", "<ttyp:secondaryKeys"].map((t) => xml.indexOf(t))
        assert.deepEqual([...order].sort((a, b) => a - b), order)
      })
    }
  }
}

test("XML：内置行类型 C(10) / P(15,2)", () => {
  const c = tt.buildRowTypeXml(ok({ rowType: "C", length: 10 }))
  assert.equal(c, "<ttyp:rowType><ttyp:typeKind>predefinedAbapType</ttyp:typeKind><ttyp:typeName/><ttyp:builtInType><ttyp:dataType>C</ttyp:dataType><ttyp:length>000010</ttyp:length><ttyp:decimals>000000</ttyp:decimals></ttyp:builtInType><ttyp:rangeType/></ttyp:rowType>")
  assert.ok(tt.buildRowTypeXml(ok({ rowType: "P", length: 15, decimals: 2 })).includes("<ttyp:length>000015</ttyp:length><ttyp:decimals>000002</ttyp:decimals>"))
})

const SHELL = '<?xml version="1.0" encoding="utf-8"?><ttyp:tableType adtcore:name="ZTT_ROW" adtcore:type="TTYP/DA" xmlns:ttyp="http://www.sap.com/dictionary/tabletype" xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:packageRef adtcore:name="$TMP"/><ttyp:rowType><ttyp:typeKind>predefinedAbapType</ttyp:typeKind><ttyp:typeName/><ttyp:builtInType><ttyp:dataType>CHAR</ttyp:dataType><ttyp:length>000001</ttyp:length><ttyp:decimals>000000</ttyp:decimals></ttyp:builtInType><ttyp:rangeType/></ttyp:rowType><ttyp:initialRowCount>00000</ttyp:initialRowCount><ttyp:accessType>standard</ttyp:accessType><ttyp:primaryKey ttyp:isVisible="true" ttyp:isEditable="true"><ttyp:definition>standard</ttyp:definition><ttyp:kind>nonUnique</ttyp:kind><ttyp:components ttyp:isVisible="false"/><ttyp:alias/></ttyp:primaryKey><ttyp:secondaryKeys ttyp:isVisible="true" ttyp:isEditable="true"><ttyp:allowed>notSpecified</ttyp:allowed></ttyp:secondaryKeys><ttyp:valueHelps><ttyp:x/></ttyp:valueHelps></ttyp:tableType>'

test("applyTableTypeDefinition：替换读回壳的行类型/类别/主键，保留其余，去掉 valueHelps", () => {
  const xml = tt.applyTableTypeDefinition(SHELL, ok({ rowType: "ZS_ROW", accessType: "sorted", keyDefinition: "keyComponents", keyKind: "unique", keyComponents: ["F1"] }))
  assert.ok(xml.includes("<ttyp:typeName>ZS_ROW</ttyp:typeName>") && !xml.includes("CHAR"))
  assert.ok(xml.includes("<ttyp:accessType>sorted</ttyp:accessType>"))
  assert.ok(xml.includes("<ttyp:definition>keyComponents</ttyp:definition><ttyp:kind>unique</ttyp:kind>"))
  assert.ok(xml.includes('<ttyp:component ttyp:name="F1"/>'))
  assert.ok(xml.includes("<ttyp:secondaryKeys") && xml.includes('adtcore:packageRef adtcore:name="$TMP"'))
  assert.ok(!xml.includes("valueHelps"))
  assert.throws(() => tt.applyTableTypeDefinition("<foo/>", ok({ rowType: "ZS" })))
})

function mockClient() {
  const calls = []
  return {
    calls, stateful: "stateless", username: "DEV",
    httpClient: { request: async (url, cfg) => { calls.push({ op: cfg.method, url, cfg }); return { body: cfg.method === "GET" ? SHELL : "" } } },
    lock: async (url) => { calls.push({ op: "LOCK", url }); return { LOCK_HANDLE: "H1", CORRNR: "", IS_LOCAL: "X" } },
    unLock: async (url, h) => { calls.push({ op: "UNLOCK", url, h }) },
  }
}

test("createTableTypeObject：POST /sap/bc/adt/ddic/tabletypes，vendor content type，带请求号", async () => {
  const c = mockClient()
  await tt.createTableTypeObject(c, { name: "ZTT_ROW", description: "d", packageName: "ZPKG" }, ok({ rowType: "ZS_ROW" }), "DEVK900001")
  assert.equal(c.calls.length, 1)
  const [{ op, url, cfg }] = c.calls
  assert.equal(op, "POST"); assert.equal(url, "/sap/bc/adt/ddic/tabletypes")
  assert.match(cfg.headers["Content-Type"], /^application\/vnd\.sap\.adt\.tabletype\.v1\+xml/)
  assert.deepEqual(cfg.qs, { corrNr: "DEVK900001" })
  assert.match(cfg.body, /<ttyp:tableType /)
})

test("writeTableTypeDefinition：lock → GET → PUT(lockHandle) → unlock，恢复会话状态", async () => {
  const c = mockClient()
  await tt.writeTableTypeDefinition(c, "ZTT_ROW", ok({ rowType: "ZS_ROW", accessType: "hashed" }))
  assert.deepEqual(c.calls.map((x) => x.op), ["LOCK", "GET", "PUT", "UNLOCK"])
  const put = c.calls[2]
  assert.equal(put.url, "/sap/bc/adt/ddic/tabletypes/ztt_row")
  assert.deepEqual(put.cfg.qs, { lockHandle: "H1" })
  assert.ok(put.cfg.body.includes("<ttyp:accessType>hashed</ttyp:accessType>") && put.cfg.body.includes("<ttyp:kind>unique</ttyp:kind>"))
  assert.equal(c.stateful, "stateless")
})

test("writeTableTypeDefinition：PUT 失败也会 unlock", async () => {
  const c = mockClient()
  c.httpClient.request = async (url, cfg) => { c.calls.push({ op: cfg.method }); if (cfg.method === "PUT") throw new Error("boom"); return { body: SHELL } }
  await assert.rejects(tt.writeTableTypeDefinition(c, "ZTT_ROW", ok({ rowType: "ZS" })), /boom/)
  assert.equal(c.calls.at(-1).op, "UNLOCK")
})
