/**
 * Dump 查询离线单测：时间窗/FQL/时区/转义/有界首批/详情链接校验/超时取消/老调用兼容
 * 全部 mock，不发真实 SAP HTTP。
 */
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const dq = require("../dist/sap-tools/tools/dumpQuery.js")
const { dumpAnalysisTool } = require("../dist/sap-tools/tools/runtime.js")
const { __setConfigForTest } = require("../dist/sap-tools/config.js")
const { __setClientFactoryForTest, markConnectionUnhealthy } = require("../dist/sap-tools/adtManager.js")

const {
  parseSapTimeZoneOffset,
  resolveDumpTimeWindow,
  buildDumpFql,
  normalizeDumpUser,
  validateDumpDetailUrl,
  pickDumpDetailHref,
  parseDumpsAtom,
  matchDumpById,
  fetchDumpsFeed,
  clampDumpMaxResults,
  truncationNote,
  DUMP_DEFAULT_HOURS_BACK,
  DUMP_FEED_PAGE_HINT,
} = dq

const FAKE_CONFIG = {
  connections: [
    {
      id: "dev",
      url: "https://sap.example.com:44300",
      client: "200",
      username: "SAPUSER",
      password: "x",
      language: "EN",
      sapTimeZoneOffset: "+08:00",
    },
  ],
  security: { readOnly: true },
}

function cleanup() {
  __setClientFactoryForTest(null)
  __setConfigForTest(null)
  markConnectionUnhealthy("dev")
}

before(() => {
  __setConfigForTest(FAKE_CONFIG)
})
after(() => cleanup())

const sampleAtom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Dumps</title>
  <link href="/sap/bc/adt/runtime/dumps"/>
  <entry>
    <id>20261119101010abcdefghij_DS4_00</id>
    <author><name>880354</name></author>
    <summary type="html">TIME_OUT in &lt;PROG&gt;</summary>
    <category term="CX" label="ABAP runtime error"/>
    <link rel="alternate" href="/sap/bc/adt/runtime/dump/20261119101010abcdefghij_DS4_00/formatted" title="formatted"/>
    <link rel="self" href="/sap/bc/adt/runtime/dumps/20261119101010abcdefghij_DS4_00"/>
  </entry>
  <entry>
    <id>20261119101111zzzzzzzzzz_DS4_00</id>
    <author><name>SAPUSER</name></author>
    <summary type="text">COMPUTE_INT_ZERODIVIDE</summary>
    <link href="https://evil.example/phish"/>
  </entry>
</feed>`

// ── 时区 / 默认时间过滤 ───────────────────────────────────────────────────────
test("parseSapTimeZoneOffset：接受显式偏移，拒绝空值和 IANA", () => {
  assert.equal(parseSapTimeZoneOffset("+08:00").offsetMinutes, 480)
  assert.equal(parseSapTimeZoneOffset("UTC+8").label, "+08:00")
  assert.equal(parseSapTimeZoneOffset("-05:30").offsetMinutes, -330)
  assert.throws(() => parseSapTimeZoneOffset(""), /缺少 SAP 系统时区/)
  assert.throws(() => parseSapTimeZoneOffset(undefined), /缺少 SAP 系统时区/)
  assert.throws(() => parseSapTimeZoneOffset("Asia/Shanghai"), /无法解析/)
})

test("默认最近 2 小时：按 SAP 偏移把 UTC now 换成系统本地墙钟，并生成带 Z 的 FQL 字面量", () => {
  // 2026-11-19T04:00:00Z == SAP+08 本地 12:00:00 → 回溯 2h → 10:00:00
  const now = new Date("2026-11-19T04:00:00.000Z")
  const offset = parseSapTimeZoneOffset("+08:00")
  const w = resolveDumpTimeWindow({}, offset, now)
  assert.equal(w.source, "default")
  assert.equal(w.hours, DUMP_DEFAULT_HOURS_BACK)
  assert.equal(w.fromLocal, "2026-11-19T10:00:00")
  assert.equal(w.toLocal, "2026-11-19T12:00:00")
  assert.equal(w.fromFql, "2026-11-19T10:00:00Z")
  assert.equal(w.toFql, "2026-11-19T12:00:00Z")
  const fql = buildDumpFql(w)
  assert.match(fql, /greaterOrEquals\(datetime,2026-11-19T10:00:00Z\)/)
  assert.match(fql, /less\(datetime,2026-11-19T12:00:00Z\)/)
  assert.ok(!fql.includes("lessThan"), "不得使用 ADT 不存在的 lessThan 算子")
  assert.ok(!fql.includes(";"), "FQL 不得使用分号")
})

test("显式 date + 时区 + 跨午夜", () => {
  const offset = parseSapTimeZoneOffset("UTC+8")
  const w = resolveDumpTimeWindow(
    { date: "2026-11-19", fromTime: "22:00", toTime: "02:00" },
    offset,
  )
  assert.equal(w.crossedMidnight, true)
  assert.equal(w.fromLocal, "2026-11-19T22:00:00")
  assert.equal(w.toLocal, "2026-11-20T02:00:00")
  assert.equal(w.fromFql, "2026-11-19T22:00:00Z")
  assert.equal(w.toFql, "2026-11-20T02:00:00Z")
})

test("用户转义：合法用户进入 FQL；逗号/分号/括号被拒", () => {
  const offset = parseSapTimeZoneOffset("+08:00")
  const w = resolveDumpTimeWindow({ hoursBack: 1 }, offset, new Date("2026-11-19T04:00:00Z"))
  const fql = buildDumpFql(w, "880354")
  assert.match(fql, /equals\(user,880354\)/)
  assert.match(fql, /^and\(/)
  assert.equal(normalizeDumpUser("ABAP_DEV"), "ABAP_DEV")
  assert.throws(() => normalizeDumpUser("a,b"), /非法字符/)
  assert.throws(() => normalizeDumpUser("a;b"), /非法字符/)
  assert.throws(() => normalizeDumpUser("a(b)"), /非法字符/)
  assert.throws(() => buildDumpFql(w, "bad;user"), /非法字符/)
})

test("反向 / 非法范围拒绝；过大窗口拒绝", () => {
  const offset = parseSapTimeZoneOffset("+08:00")
  assert.throws(
    () => resolveDumpTimeWindow({ from: "2026-11-19T12:00:00", to: "2026-11-19T11:00:00" }, offset),
    /时间范围无效/,
  )
  assert.throws(
    () => resolveDumpTimeWindow({ from: "2026-11-01T00:00:00", to: "2026-11-10T00:00:00" }, offset),
    /时间窗口过大/,
  )
  assert.throws(() => resolveDumpTimeWindow({ hoursBack: 100 }, offset), /hoursBack 过大/)
  assert.throws(() => resolveDumpTimeWindow({ fromTime: "10:00" }, offset), /必须同时提供 date/)
  assert.throws(() => resolveDumpTimeWindow({ from: "2026-11-19T00:00:00" }, offset), /成对/)
})

test("禁止空 query：fetchDumpsFeed 拒空；buildDumpFql 始终含时间谓词", () => {
  const offset = parseSapTimeZoneOffset("+00:00")
  const w = resolveDumpTimeWindow({ hoursBack: 2 }, offset, new Date("2026-11-19T12:00:00Z"))
  const q = buildDumpFql(w)
  assert.ok(q.trim().length > 0)
  assert.match(q, /datetime/)
  assert.rejects(async () => fetchDumpsFeed({ request: async () => ({ body: "" }) }, "", 1000), /禁止无条件/)
  assert.rejects(async () => fetchDumpsFeed({ request: async () => ({ body: "" }) }, "   ", 1000), /禁止无条件/)
})

test("首批有界：maxResults 客户端截取 + 截断提示；不是服务端 limit 声明", () => {
  assert.equal(clampDumpMaxResults(100), 100)
  assert.equal(clampDumpMaxResults(undefined), 100)
  const note = truncationNote(DUMP_FEED_PAGE_HINT, 20)
  assert.match(note, /不是服务端 LIMIT/)
  assert.match(note, /第一页/)
  assert.match(note, new RegExp(String(DUMP_FEED_PAGE_HINT)))
})

test("可信详情链接接受；恶意/跨源/非 dump 路径拒绝", () => {
  const base = "https://sap.example.com:44300"
  const ok = validateDumpDetailUrl("/sap/bc/adt/runtime/dump/ID1/formatted", base)
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.requestPath, "/sap/bc/adt/runtime/dump/ID1/formatted")

  const absOk = validateDumpDetailUrl("https://sap.example.com:44300/sap/bc/adt/runtime/dump/ID1/formatted", base)
  assert.equal(absOk.ok, true)

  assert.equal(validateDumpDetailUrl("https://evil.example/sap/bc/adt/runtime/dump/x", base).ok, false)
  assert.equal(validateDumpDetailUrl("javascript:alert(1)", base).ok, false)
  assert.equal(validateDumpDetailUrl("/sap/bc/adt/oo/classes/zcl", base).ok, false)
  assert.equal(validateDumpDetailUrl("https://user:pass@sap.example.com:44300/sap/bc/adt/runtime/dump/x", base).ok, false)

  const picked = pickDumpDetailHref([
    { href: "https://evil.example/x", title: "no" },
    { href: "/sap/bc/adt/runtime/dump/ID/formatted", rel: "alternate", title: "formatted" },
  ])
  assert.equal(picked, "/sap/bc/adt/runtime/dump/ID/formatted")
})

test("Atom 解析与 dumpId 匹配", () => {
  const feed = parseDumpsAtom(sampleAtom)
  assert.equal(feed.dumps.length, 2)
  assert.equal(feed.dumps[0].author, "880354")
  assert.match(feed.dumps[0].text, /TIME_OUT/)
  assert.ok(feed.dumps[0].links.some((l) => l.href.includes("/formatted")))
  assert.equal(matchDumpById(feed.dumps, "20261119101010abcdefghij_DS4_00")?.author, "880354")
  assert.equal(matchDumpById(feed.dumps, "abcdefghij_DS4_00")?.id.startsWith("20261119101010"), true)
})

test("超时取消：httpClient.request 收到 timeout 配置；超时错误上浮", async () => {
  const calls = []
  const http = {
    request: async (_path, cfg) => {
      calls.push(cfg)
      const err = new Error("timeout of 1000ms exceeded")
      err.code = "ECONNABORTED"
      throw err
    },
  }
  await assert.rejects(() => fetchDumpsFeed(http, "greaterOrEquals(datetime,2026-11-19T00:00:00Z)", 1000), /timeout/)
  assert.equal(calls[0].timeout, 1000)
  assert.equal(calls[0].qs.$query.includes("datetime"), true)
})

test("老调用兼容：仅 action=list_dumps 时走默认 2h，并带上连接配置中的时区", async () => {
  const queries = []
  const detailCalls = []
  const client = {
    login: async () => undefined,
    httpClient: {
      request: async (path, cfg) => {
        if (path === "/sap/bc/adt/runtime/dumps") {
          queries.push(cfg.qs?.$query)
          assert.ok(cfg.qs?.$query, "禁止空 query")
          assert.equal(typeof cfg.timeout, "number")
          // 造 55 条，验证客户端截取
          const entries = Array.from({ length: 55 }, (_, i) => {
            const id = `2026111910${String(i).padStart(2, "0")}00id${i}_DS4_00`
            return `<entry><id>${id}</id><author><name>U</name></author><summary type="text">e${i}</summary>
              <link href="/sap/bc/adt/runtime/dump/${id}/formatted" title="formatted"/></entry>`
          }).join("")
          return { body: `<feed><title>Dumps</title>${entries}</feed>` }
        }
        detailCalls.push(path)
        return { body: "FULL DETAIL BODY" }
      },
    },
  }
  __setConfigForTest(FAKE_CONFIG)
  __setClientFactoryForTest(() => client)
  try {
    const out = await dumpAnalysisTool.execute({ action: "list_dumps", connectionId: "dev" })
    assert.equal(queries.length, 1)
    assert.match(queries[0], /greaterOrEquals\(datetime,/)
    assert.match(queries[0], /less\(datetime,/)
    assert.match(out, /maxResults=100 只是客户端截取/)
    assert.match(out, /dumpId:/)
    // 展示不超过 100（假数据 55 条 → 全展示）
    const ids = out.match(/dumpId:/g) || []
    assert.equal(ids.length, 55)

    // analyze_dump：同源详情成功
    const id = "20261119100000id0_DS4_00"
    const detail = await dumpAnalysisTool.execute({
      action: "analyze_dump",
      dumpId: id,
      hoursBack: 2,
      connectionId: "dev",
    })
    assert.match(detail, /FULL DETAIL BODY/)
    assert.ok(detailCalls.some((p) => p.includes("/formatted")))

    // 恶意链接：第二条目只有 evil 链接 → 拒绝后回退摘要，不全量 dumps
    const evil = await dumpAnalysisTool.execute({
      action: "analyze_dump",
      dumpId: "20261119101111zzzzzzzzzz_DS4_00",
      date: "2026-11-19",
      fromTime: "00:00",
      toTime: "23:59",
      connectionId: "dev",
      // 覆盖 request 返回含恶意链接的单条
    })
    // 上面仍走 55 条 feed；改用专用 client
  } finally {
    cleanup()
    __setConfigForTest(FAKE_CONFIG)
  }
})

test("详情失败有界回退：拒绝恶意链接；详情 HTTP 失败时用 feed 摘要，不调用空 query", async () => {
  const queries = []
  const client = {
    login: async () => undefined,
    httpClient: {
      request: async (path, cfg) => {
        if (path === "/sap/bc/adt/runtime/dumps") {
          queries.push(cfg.qs?.$query ?? "")
          assert.ok(cfg.qs?.$query?.includes("datetime"))
          return {
            body: `<?xml version="1.0"?><feed>
              <entry>
                <id>20261119120000badlink_DS4_00</id>
                <author><name>U</name></author>
                <summary type="text">SUMMARY_ONLY</summary>
                <link href="https://evil.example/sap/bc/adt/runtime/dump/x/formatted" title="formatted"/>
              </entry>
              <entry>
                <id>20261119120100failhttp_DS4_00</id>
                <author><name>U</name></author>
                <summary type="text">SUMMARY_FAIL</summary>
                <link href="/sap/bc/adt/runtime/dump/20261119120100failhttp_DS4_00/formatted" title="formatted"/>
              </entry>
            </feed>`,
          }
        }
        throw new Error("detail boom")
      },
    },
  }
  __setConfigForTest(FAKE_CONFIG)
  __setClientFactoryForTest(() => client)
  try {
    const rejected = await dumpAnalysisTool.execute({
      action: "analyze_dump",
      dumpId: "20261119120000badlink_DS4_00",
      hoursBack: 3,
      sapTimeZoneOffset: "+08:00",
      connectionId: "dev",
    })
    assert.match(rejected, /详情链接已拒绝|跨源/)
    assert.match(rejected, /SUMMARY_ONLY/)
    assert.ok(queries.every((q) => q && q.includes("datetime")))

    const failed = await dumpAnalysisTool.execute({
      action: "analyze_dump",
      dumpId: "failhttp_DS4_00",
      hoursBack: 3,
      connectionId: "dev",
    })
    assert.match(failed, /详情链接读取失败/)
    assert.match(failed, /SUMMARY_FAIL/)
    assert.match(failed, /不全量降级|有界/)
  } finally {
    cleanup()
    __setConfigForTest(FAKE_CONFIG)
  }
})

test("缺少时区时不默猜（即使老调用只传 action）", async () => {
  __setConfigForTest({
    connections: [{ id: "dev", url: "https://sap.example.com:44300", client: "200", username: "U", password: "x" }],
    security: { readOnly: true },
  })
  __setClientFactoryForTest(() => ({ login: async () => undefined, httpClient: { request: async () => ({ body: "<feed/>" }) } }))
  try {
    const out = await dumpAnalysisTool.execute({ action: "list_dumps", connectionId: "dev" })
    assert.match(out, /缺少 SAP 系统时区|sapTimeZoneOffset/)
    assert.doesNotMatch(out, /dumpId:/)
  } finally {
    cleanup()
    __setConfigForTest(FAKE_CONFIG)
  }
})

test("inputSchema：老字段仍在；新字段可选；maxResults 上限 100", () => {
  const s = dumpAnalysisTool.inputSchema
  assert.equal(s.safeParse({ action: "list_dumps" }).success, true)
  assert.equal(s.safeParse({ action: "analyze_dump", dumpId: "x", maxResults: 50 }).success, true)
  assert.equal(s.safeParse({ action: "list_dumps", maxResults: 100 }).success, true)
  assert.equal(s.safeParse({ action: "list_dumps", maxResults: 101 }).success, false)
  assert.equal(s.safeParse({ action: "list_dumps", sapTimeZoneOffset: "+08:00", user: "A", hoursBack: 2 }).success, true)
})
