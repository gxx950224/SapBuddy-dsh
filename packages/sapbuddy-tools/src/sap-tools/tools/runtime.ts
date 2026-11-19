/** 工具组：运行时分析（analyze_abap_dumps、analyze_abap_traces、get_version_history） */
import { z } from "zod"
import { getClient, getConnection } from "../adtManager.js"
import {
  findObject,
  readSourceSmart,
  requireObject,
  resolveConnectionId,
  toToolError,
  connectionIdSchema,
  objectTypeSchema,
} from "./shared.js"
import {
  buildDumpFql,
  clampDumpMaxResults,
  clampDumpTimeoutMs,
  fetchDumpDetail,
  fetchDumpsFeed,
  matchDumpById,
  parseSapTimeZoneOffset,
  pickDumpDetailHref,
  resolveDumpTimeWindow,
  truncationNote,
  validateDumpDetailUrl,
  type DumpHttpClient,
  type DumpTimeWindow,
} from "./dumpQuery.js"
import {
  decodeSnapId,
  extractExtraClues,
  formatSnapDetail,
  formatSnapList,
  normalizeSnapDump,
  querySnap,
  snapDetailSql,
  snapListSql,
  type RunQuery,
  type SnapKey,
  type SnapRawRow,
} from "./dumpSnap.js"

/** 取 client.runQuery 的绑定函数；SNAP 直查走它（不存在则返回 null，调用方回退 feed）。 */
function snapper(client: unknown): RunQuery | null {
  const c = client as { runQuery?: (...a: unknown[]) => unknown }
  if (typeof c.runQuery !== "function") return null
  return (sql: string, n: number) =>
    Promise.resolve(c.runQuery!.call(c, sql, n)) as Promise<{ values?: SnapRawRow[] }>
}

async function runSnapList(
  rq: RunQuery,
  window: DumpTimeWindow,
  user: string | undefined,
  max: number,
  offset: { label: string },
  timeoutMs: number,
  client: string,
): Promise<string> {
  const rows = await querySnap(rq, snapListSql(window, user, client), 2000, timeoutMs)
  const dumps = rows
    .map(normalizeSnapDump)
    .sort((a, b) => (b.ymd + b.hhmmss).localeCompare(a.ymd + a.hhmmss) || Number(b.modno) - Number(a.modno))
  const wl = `${window.fromLocal.replace("T", " ")} → ${window.toLocal.replace("T", " ")}（SAP ${offset.label}）`
  return formatSnapList(dumps, { windowLabel: wl, offsetLabel: offset.label, max, fetched: dumps.length })
}

async function runSnapDetail(
  rq: RunQuery,
  key: SnapKey,
  offset: { label: string },
  timeoutMs: number,
  connId: string,
  client: unknown,
): Promise<string> {
  const rows = await querySnap(rq, snapDetailSql(key), 2000, timeoutMs)
  if (rows.length === 0) {
    return `未找到该 dump（SNAP）: ${key.ymd} ${key.hhmmss} client ${key.mandt} MODNO ${key.modno}`
  }
  const headerRow = rows.find((r) => String(r.SEQNO) === "000") ?? rows[0]
  const dump = normalizeSnapDump(headerRow)

  // 首选：ADT 标准 dump 详情端点（只渲染这一条，~200ms，结构标准、任何错误类型通用）
  try {
    const adtId = buildAdtDumpId(headerRow)
    const body = await fetchAdtDumpFormatted(client, adtId, timeoutMs)
    if (body.trim()) {
      let out =
        "Dump 标准详情（ADT）\n" +
        `时间 ${dump.datum} ${dump.time}   用户 ${dump.user || "?"}   客户端 ${dump.mandt}   主机 ${dump.ahost || "-"}   MODNO ${dump.modno}\n\n` +
        compactStandardDump(body, 6800)
      const snippet = await fetchFailingSource(connId, client, dump.include || dump.program, dump.line)
      if (snippet) out += `\n\n出错源码（${snippet.object} 第 ${snippet.line} 行附近）:\n${snippet.text}`
      return out
    }
  } catch {
    /* 端点不可用 → 回退 SNAP 渲染 */
  }

  // 兜底：SNAP 分段渲染
  let text = formatSnapDetail(rows, dump, { offsetLabel: offset.label })
  const snippet = await fetchFailingSource(connId, client, dump.include || dump.program, dump.line)
  if (snippet) {
    text += `\n\n出错源码（${snippet.object} 第 ${snippet.line} 行附近）:\n${snippet.text}`
  } else {
    const extra = extractExtraClues(rows)
    if (extra.screens.length || extra.calls.length) {
      text += "\n\n附加线索（未能取到单行源码）:"
      for (const s of extra.screens) text += `\n  • 屏幕/程序: ${s}`
      for (const c of extra.calls) text += `\n  • 异常/调用: ${c}`
    } else {
      text += `\n\n出错源码: 该 dump 无单行源码可读（行号 ${dump.line || 0}，可能是屏幕/字段类错误或类池 CP 生成代码）。`
    }
  }
  return text
}

function pad2n(n: number): string {
  return String(n).padStart(2, "0")
}

/** 由 SNAP 头部行拼出 ADT dump id：时间戳 + AHOST(32) + UNAME(12) + client(3) + MODNO(4)。 */
function buildAdtDumpId(row: SnapRawRow): string {
  const d = new Date(String(row.DATUM ?? ""))
  const ymd = Number.isNaN(d.getTime())
    ? String(row.DATUM ?? "").replace(/\D/g, "").slice(0, 8)
    : `${d.getUTCFullYear()}${pad2n(d.getUTCMonth() + 1)}${pad2n(d.getUTCDate())}`
  const ts = ymd + String(row.UZEIT ?? "").padStart(6, "0")
  return (
    ts +
    String(row.AHOST ?? "").trim().padEnd(32, " ") +
    String(row.UNAME ?? "").trim().padEnd(12, " ") +
    String(row.MANDT ?? "").padStart(3, "0") +
    String(row.MODNO ?? "").padStart(4, "0")
  )
}

/** 压缩 ADT 标准 dump 文本到可控长度（保留头部/短文本/错误分析等核心段）。 */
function compactStandardDump(body: string, max: number): string {
  const t = body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const at = cut.lastIndexOf("\n")
  return (at > 0 ? cut.slice(0, at) : cut) + "\n…（已截断；完整 dump 见 ST22 或 ADT 详情端点）"
}

async function fetchAdtDumpFormatted(client: unknown, id: string, timeoutMs: number): Promise<string> {
  const http = (client as { httpClient?: { request: (p: string, c?: unknown) => Promise<{ body?: string }> } }).httpClient
  if (!http || typeof http.request !== "function") throw new Error("no httpClient")
  let timer: NodeJS.Timeout | undefined
  try {
    const res = await Promise.race([
      http.request(`/sap/bc/adt/runtime/dump/${encodeURIComponent(id)}/formatted`, {
        method: "GET",
        headers: { Accept: "text/plain" },
        timeout: timeoutMs,
      }),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error("ADT dump 详情超时")), timeoutMs)
      }),
    ])
    return String(res?.body ?? "")
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 读取 dump 失败处的 ABAP 源码（优先 include，因为行号属于 include），带 2 行上下文。 */
async function fetchFailingSource(
  connId: string,
  client: unknown,
  objectName: string | undefined,
  line: string | undefined,
): Promise<{ object: string; line: number; text: string } | undefined> {
  const n = Number(line)
  if (!objectName || !Number.isFinite(n) || n < 1) return undefined
  try {
    const obj = await findObject(connId, objectName, "PROG")
    if (!obj) return undefined
    const source = await readSourceSmart(
      client as Parameters<typeof readSourceSmart>[0],
      obj["adtcore:type"],
      obj["adtcore:uri"],
    )
    const lines = source.split("\n")
    if (n > lines.length) return undefined
    const from = Math.max(1, n - 2)
    const to = Math.min(lines.length, n + 1)
    const out: string[] = []
    for (let i = from; i <= to; i++) {
      const marker = i === n ? ">" : " "
      out.push(`${String(i).padStart(4, " ")} ${marker} ${lines[i - 1] ?? ""}`)
    }
    return { object: objectName, line: n, text: out.join("\n") }
  } catch {
    return undefined
  }
}

// ─── analyze_abap_dumps ─────────────────────────────────────────────────────
export const dumpAnalysisTool = {
  name: "analyze_abap_dumps",
  title: "Analyze ABAP Dumps",
  description:
    "分析 ABAP 运行时错误（ST22 dumps）：按时间/用户列出 dumps 或查看单个 dump 详情。" +
    "默认查最近 2 小时；支持 user / date / fromTime·toTime / from·to / hoursBack 过滤。" +
    "数据源优先 SNAP 直查（ST22 底层表，含日期+时间+用户过滤，~200ms），SNAP 不可用时回退 ADT feed。" +
    "时间按连接/参数 sapTimeZoneOffset（如 +08:00）解释，不用本机时区冒充。" +
    "analyze_dump 会返回「错误明细」（内核错误 / 触发值 / 相关变量 / 所在过程）。" +
    "⚠️ 回答用户时，必须基于这些事实**用中文主动给出一句根因归纳**" +
    "（如“上传 Excel 的『总用时』列串进了物料描述文本，STRING→数值转换失败；数量列带了千分位逗号”），" +
    "不要只把技术字段原样丢给用户——归纳由你依据事实理解生成，不要照抄或凭空猜测。",
  inputSchema: z.object({
    action: z.enum(["list_dumps", "analyze_dump"]).describe("list_dumps=按时间窗列出; analyze_dump=查看单个 dump 详情"),
    dumpId: z.string().optional().describe("dump ID（analyze_dump 必填，从 list_dumps 结果获取）"),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("list_dumps 最大返回条数，默认 100、上限 100；按时间倒序取最近的"),
    user: z.string().optional().describe("按 SAP 用户过滤（FQL equals(user,...)）"),
    date: z.string().optional().describe("SAP 系统本地日期 YYYY-MM-DD；可配 fromTime/toTime，跨午夜时 toTime<fromTime 自动落到次日"),
    fromTime: z.string().optional().describe("SAP 本地开始时刻 HH:mm[:ss]，需同时给 date"),
    toTime: z.string().optional().describe("SAP 本地结束时刻 HH:mm[:ss]，需同时给 date"),
    from: z.string().optional().describe("SAP 本地开始日期时间 YYYY-MM-DDTHH:mm[:ss]，须与 to 成对"),
    to: z.string().optional().describe("SAP 本地结束日期时间 YYYY-MM-DDTHH:mm[:ss]，须与 from 成对"),
    hoursBack: z.number().positive().max(48).optional().describe("相对当前 SAP 本地时间回溯小时数；默认 2；与 date/from 互斥"),
    sapTimeZoneOffset: z
      .string()
      .optional()
      .describe('SAP 系统时区偏移，如 "+08:00" / "UTC+8"；优先于连接配置；未提供则读 connections[].sapTimeZoneOffset；都没有则报错（不默猜）'),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(60000)
      .optional()
      .describe("单次 HTTP 超时毫秒，默认 30000，上限 60000（写入 ADT 请求 timeout，避免无界等待）"),
    connectionId: connectionIdSchema,
  }),
  async execute(args: {
    action: string
    dumpId?: string
    maxResults?: number
    user?: string
    date?: string
    fromTime?: string
    toTime?: string
    from?: string
    to?: string
    hoursBack?: number
    sapTimeZoneOffset?: string
    timeoutMs?: number
    connectionId?: string
  }): Promise<string> {
    try {
      const connId = await resolveConnectionId(args.connectionId)
      const conf = getConnection(connId)
      const client = await getClient(connId)
      const http = (client as { httpClient?: DumpHttpClient }).httpClient

      const offset = parseSapTimeZoneOffset(args.sapTimeZoneOffset ?? conf.sapTimeZoneOffset)
      const window = resolveDumpTimeWindow(args, offset)
      const query = buildDumpFql(window, args.user)
      const timeoutMs = clampDumpTimeoutMs(args.timeoutMs)
      const max = clampDumpMaxResults(args.maxResults)

      // 首选 SNAP 直查（ST22 底层表，按 DATUM/UZEIT/UNAME 过滤，~200ms）；
      // 不可用或失败时回退到 ADT dumps feed（有界 FQL，不再空 query）。
      const runQuery = snapper(client)
      if (args.action === "list_dumps" && runQuery) {
        try {
          return await runSnapList(runQuery, window, args.user, max, offset, timeoutMs, conf.client)
        } catch {
          /* SNAP 不可用 → 回退 feed */
        }
      }
      if (args.action === "analyze_dump" && args.dumpId) {
        const key = decodeSnapId(args.dumpId)
        if (key && runQuery) {
          try {
            return await runSnapDetail(runQuery, key, offset, timeoutMs, connId, client)
          } catch (e) {
            return `analyze_dump 失败（SNAP）: ${e instanceof Error ? e.message : String(e)}`
          }
        }
      }

      if (!http || typeof http.request !== "function") {
        return "工具执行失败: 当前 ADT 客户端缺少 httpClient（且 SNAP 直查不可用），无法查询 dumps"
      }

      if (args.action === "list_dumps") {
        const feed = await fetchDumpsFeed(http, query, timeoutMs)
        const dumps = feed.dumps ?? []
        if (dumps.length === 0) {
          return [
            "指定时间窗内没有可访问的 ABAP dumps（或无权限/系统不支持 dump feed）。",
            `时间窗(SAP ${offset.label}): ${window.fromLocal} → ${window.toLocal}` +
              (window.crossedMidnight ? "（跨午夜）" : ""),
            `FQL: ${query}`,
          ].join("\n")
        }
        const shown = dumps.slice(0, max)
        const lines = [
          `最近 ${shown.length} 个 ABAP dumps（时间窗 SAP ${offset.label}: ${window.fromLocal} → ${window.toLocal}` +
            (window.crossedMidnight ? "，跨午夜" : "") +
            `）:`,
          "",
        ]
        for (const d of shown) {
          // 真实 id 常是 /sap/bc/adt/vit/runtime/dumps/<YYYYMMDDHHMMSS>... 的 URI，
          // 时间戳不一定在开头，所以允许前导 "/" 后再匹配 14 位时间戳。
          const ts = d.id.match(/(?:^|\/)(\d{14})/)?.[1]
          const time = ts
            ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)} ${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}`
            : "?"
          const txt = (d.text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90)
          lines.push(`- [${time}] 用户: ${d.author ?? "?"} | ${txt}`)
          lines.push(`  dumpId: ${d.id}`)
        }
        lines.push("", truncationNote(dumps.length, max))
        lines.push(`FQL: ${query}`)
        lines.push("用 analyze_dump + dumpId（建议带同一时间窗参数）查看某个 dump 的完整详情。")
        return lines.join("\n")
      }

      if (args.action === "analyze_dump") {
        if (!args.dumpId) return "analyze_dump 需要 dumpId 参数（先用 list_dumps 获取）。"
        // 有界列表匹配：同一时间窗 FQL，绝不回退无条件全量 dumps()
        const feed = await fetchDumpsFeed(http, query, timeoutMs)
        const dump = matchDumpById(feed.dumps ?? [], args.dumpId)
        if (!dump) {
          return [
            `未在时间窗内找到 dump: ${args.dumpId.slice(0, 80)}…`,
            `时间窗(SAP ${offset.label}): ${window.fromLocal} → ${window.toLocal}`,
            `FQL: ${query}`,
            "请确认 dumpId，或扩大 from/to（仍受 48 小时上限），不要期望无条件全库扫描。",
          ].join("\n")
        }

        const lines = [
          `Dump 详情: ${dump.id}`,
          `类型: ${dump.type}`,
          `用户: ${dump.author ?? "?"}`,
          `时间窗(SAP ${offset.label}): ${window.fromLocal} → ${window.toLocal}`,
          "",
        ]

        const detailHref = pickDumpDetailHref(dump.links)
        let detailFetched = false
        if (detailHref) {
          const checked = validateDumpDetailUrl(detailHref, conf.url)
          if (!checked.ok) {
            lines.push(`详情链接已拒绝（安全校验）: ${checked.reason}`)
            lines.push(`原始 href: ${detailHref}`)
          } else {
            try {
              const body = await fetchDumpDetail(http, checked.requestPath, timeoutMs)
              const cleaned = body.replace(/\r\n/g, "\n").trim()
              if (cleaned) {
                lines.push(cleaned.slice(0, 80_000))
                detailFetched = true
              } else {
                lines.push("详情链接返回空正文，回退为 feed 摘要。")
              }
            } catch (err) {
              lines.push(
                `详情链接读取失败（已保留有界 feed 摘要，不全量降级）: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              )
            }
          }
        } else {
          lines.push("entry 未提供可用 dump 详情链接，使用 feed 摘要。")
        }

        if (!detailFetched) {
          lines.push(dump.text || "(无 summary 文本)")
        }

        if (dump.links?.length) {
          lines.push("", "关联链接:")
          for (const l of dump.links) lines.push(`  - ${l.title ?? l.rel ?? "?"}: ${l.href ?? ""}`)
        }
        lines.push("", truncationNote(feed.dumps.length, max))
        return lines.join("\n")
      }

      return `未知操作: ${args.action}`
    } catch (err) {
      return toToolError(err)
    }
  },
}


// ─── analyze_abap_traces ────────────────────────────────────────────────────
export const traceAnalysisTool = {
  name: "analyze_abap_traces",
  title: "Analyze ABAP Traces",
  description:
    "分析 ABAP 性能追踪（ST05）：列出用户的追踪请求，或查看单个追踪的命中明细。" +
    "analyze_trace=命中列表（粗粒度）；statements=SQL 语句明细（看具体哪条语句慢）；db_access=数据库表访问明细（看哪张表慢）。" +
    "delete_trace=删除某个追踪。用于性能瓶颈定位。",
  inputSchema: z.object({
    action: z
      .enum(["list_traces", "analyze_trace", "statements", "db_access", "delete_trace"])
      .describe("list_traces=列出追踪请求; analyze_trace=命中列表; statements=语句明细; db_access=DB表访问明细; delete_trace=删除追踪"),
    traceId: z.string().optional().describe("追踪 ID（analyze_trace/statements/db_access/delete_trace 必填）"),
    maxResults: z.number().int().min(1).max(500).optional().describe("statements/db_access 最大返回条数，默认 100"),
    connectionId: connectionIdSchema,
  }),
  async execute(args: { action: string; traceId?: string; maxResults?: number; connectionId?: string }): Promise<string> {
    try {
      const connId = await resolveConnectionId(args.connectionId)
      const client = await getClient(connId)

      if (args.action === "list_traces") {
        const data = await client.tracesListRequests(client.username)
        const list = data?.requests ?? []
        if (list.length === 0) return `${client.username} 没有可用的性能追踪请求。可在 SAP GUI（ST05）中创建后重试。`
        const lines = [`用户 ${client.username} 的追踪请求:`, ""]
        for (const t of list.slice(0, 50)) {
          lines.push(`- ${t.id} ${t.title ?? ""}`)
        }
        lines.push("", "用 analyze_trace + traceId 分析具体追踪。")
        return lines.join("\n")
      }

      if (args.action === "analyze_trace") {
        if (!args.traceId) return "analyze_trace 需要 traceId 参数（先用 list_traces 获取）。"
        const hits = await client.tracesHitList(args.traceId, true)
        const lines = [`追踪 ${args.traceId} 命中明细:`, ""]
        const hitList = (hits as { traceHitList?: unknown[] })?.traceHitList
        const items = hitList ?? (Array.isArray(hits) ? hits : null)
        if (!items || items.length === 0) {
          return `追踪 ${args.traceId} 无命中记录。`
        }
        for (const h of items.slice(0, 100)) {
          const row = h as Record<string, unknown>
          const title = String(row.title ?? row.statement ?? row.traceName ?? "?")
          const time = row.executionTime ?? row.time ?? "?"
          const count = row.executions ?? row.hitCount ?? "?"
          lines.push(`- ${title}  [耗时: ${time}ms] [次数: ${count}]`)
        }
        if (items.length > 100) lines.push(`... 其余 ${items.length - 100} 条省略`)
        return lines.join("\n")
      }

      if (args.action === "statements") {
        if (!args.traceId) return "statements 需要 traceId 参数（先用 list_traces 获取）。"
        const max = Math.min(args.maxResults ?? 100, 500)
        const data = await client.tracesStatements(args.traceId)
        const stmts = data?.statements ?? []
        if (stmts.length === 0) return `追踪 ${args.traceId} 无语句明细。`
        const lines = [`追踪 ${args.traceId} 语句明细（${stmts.length} 条，显示前 ${Math.min(max, stmts.length)} 条）:`, ""]
        for (const s of stmts.slice(0, max)) {
          const ms = s.grossTime?.time ?? 0
          const prog = s.callingProgram?.name ? ` [${s.callingProgram.name}]` : ""
          lines.push(`- ${s.description}  [耗时: ${ms}ms] [命中: ${s.hitCount}]${prog}`)
        }
        if (stmts.length > max) lines.push(`... 其余 ${stmts.length - max} 条省略`)
        return lines.join("\n")
      }

      if (args.action === "db_access") {
        if (!args.traceId) return "db_access 需要 traceId 参数（先用 list_traces 获取）。"
        const max = Math.min(args.maxResults ?? 100, 500)
        const data = await client.tracesDbAccess(args.traceId)
        const dbs = data?.dbaccesses ?? []
        if (dbs.length === 0) return `追踪 ${args.traceId} 无数据库访问明细。`
        // 按总耗时降序，把最慢的表放前面
        const sorted = [...dbs].sort((a, b) => (b.accessTime?.total ?? 0) - (a.accessTime?.total ?? 0))
        const lines = [`追踪 ${args.traceId} 数据库访问明细（按耗时降序，显示前 ${Math.min(max, sorted.length)} 条）:`, ""]
        for (const d of sorted.slice(0, max)) {
          const ms = d.accessTime?.total ?? 0
          const buffered = d.bufferedCount ? ` (缓冲 ${d.bufferedCount})` : ""
          lines.push(`- 表 ${d.tableName}  [耗时: ${ms}ms] [访问: ${d.totalCount}${buffered}]  ${d.statement || ""}`)
        }
        if (sorted.length > max) lines.push(`... 其余 ${sorted.length - max} 条省略`)
        return lines.join("\n")
      }

      if (args.action === "delete_trace") {
        if (!args.traceId) return "delete_trace 需要 traceId 参数。"
        await client.tracesDelete(args.traceId)
        return `已删除追踪 ${args.traceId}。`
      }
      return `未知操作: ${args.action}`
    } catch (err) {
      return toToolError(err)
    }
  },
}

// ─── get_version_history ────────────────────────────────────────────────────
export const versionHistoryTool = {
  name: "get_version_history",
  title: "Get Version History",
  description:
    "查看对象的版本历史：列出历史版本（作者/时间/版本号）、获取某版本源码、比较两个版本。用于代码回溯和变更审查。",
  inputSchema: z.object({
    action: z.enum(["list_versions", "get_version_source", "compare_versions"]).describe("操作类型"),
    objectName: z.string().describe("对象名称"),
    objectType: objectTypeSchema,
    versionNumber: z.number().int().min(1).optional().describe("get_version_source: 版本序号（1=最新）"),
    version1: z.number().int().min(1).optional().describe("compare_versions: 第一个版本序号（1=最新）"),
    version2: z.number().int().min(1).optional().describe("compare_versions: 第二个版本序号"),
    maxResults: z.number().int().min(1).max(50).optional().describe("list_versions 最大条数，默认 20"),
    connectionId: connectionIdSchema,
  }),
  async execute(args: {
    action: string
    objectName: string
    objectType?: string
    versionNumber?: number
    version1?: number
    version2?: number
    maxResults?: number
    connectionId?: string
  }): Promise<string> {
    try {
      const connId = await resolveConnectionId(args.connectionId)
      const obj = await requireObject(connId, args.objectName, args.objectType)
      const client = await getClient(connId)
      const revisions = await client.revisions(obj["adtcore:uri"])

      if (!revisions || revisions.length === 0) {
        return `${obj["adtcore:type"]} ${args.objectName} 无版本历史（新对象或系统不支持）。`
      }

      if (args.action === "list_versions") {
        const max = args.maxResults ?? 20
        const lines = [`${obj["adtcore:type"]} ${args.objectName} 的版本历史（共 ${revisions.length} 个版本，最新在前）:`, ""]
        for (let i = 0; i < Math.min(revisions.length, max); i++) {
          const r = revisions[i]
          lines.push(`  #${i + 1}  ${r.date}  ${r.author ?? "?"}  [${r.version}] ${r.versionTitle ?? ""}`)
        }
        lines.push("", "用 get_version_source（versionNumber）取某版本源码，或用 compare_versions 比较。")
        return lines.join("\n")
      }

      if (args.action === "get_version_source") {
        const idx = (args.versionNumber ?? 1) - 1
        if (idx < 0 || idx >= revisions.length) {
          return `versionNumber 超出范围（1-${revisions.length}）。`
        }
        const source = await client.getObjectSource(revisions[idx].uri)
        return `版本 #${args.versionNumber ?? 1}（${revisions[idx].date}，${revisions[idx].author}）源码:\n\n${source}`
      }

      if (args.action === "compare_versions") {
        const i1 = (args.version1 ?? 1) - 1
        const i2 = (args.version2 ?? 2) - 1
        if (i1 < 0 || i2 < 0 || i1 >= revisions.length || i2 >= revisions.length) {
          return `版本序号超出范围（1-${revisions.length}）。`
        }
        const [s1, s2] = await Promise.all([
          client.getObjectSource(revisions[i1].uri),
          client.getObjectSource(revisions[i2].uri),
        ])
        const l1 = s1.split("\n")
        const l2 = s2.split("\n")
        const maxLen = Math.max(l1.length, l2.length)
        const lines = [
          `版本比较 #${i1 + 1}（${revisions[i1].date}）vs #${i2 + 1}（${revisions[i2].date}）:`,
          "",
        ]
        let diffs = 0
        for (let i = 0; i < maxLen; i++) {
          const a = l1[i] ?? ""
          const b = l2[i] ?? ""
          if (a !== b) {
            diffs++
            lines.push(`行 ${i + 1}:`)
            if (a) lines.push(`  - ${a}`)
            if (b) lines.push(`  + ${b}`)
          }
        }
        if (diffs === 0) lines.push("两个版本内容相同。")
        return lines.join("\n")
      }
      return `未知操作: ${args.action}`
    } catch (err) {
      return toToolError(err)
    }
  },
}
