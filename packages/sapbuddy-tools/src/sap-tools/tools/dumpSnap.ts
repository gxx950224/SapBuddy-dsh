/**
 * SNAP 直查（ST22 底层表）+ FLIST 解析 + 排版。
 *
 * 为什么走 SNAP：ADT 的 /sap/bc/adt/runtime/dumps feed 每条都会在后端把最多 50 条
 * dump 的 "What happened / Error analysis" 整段渲染出来，在大 dump 量生产系统上
 * 动辄 45s~120s；而 SNAP 是 ST22 真正读的表，按 DATUM/UZEIT/UNAME 索引查询 ~200ms。
 *
 * SNAP 结构：一个 dump = 同一个 (DATUM,UZEIT,AHOST,UNAME,MANDT,MODNO) 下的多段行，
 * SEQNO='000' 是头部（含错误类型/程序/行号/异常类），SEQNO 001.. 是调用栈/程序环境/SQL。
 * 头部及明细字段都打包在 FLIST 里，格式为重复的 <1字符类别><1字符子类><3位长度><值>。
 */
import type { DumpTimeWindow } from "./dumpQuery.js"
import { normalizeDumpUser } from "./dumpQuery.js"

export type SnapRawRow = Record<string, unknown>

export type SnapDump = {
  datum: string // YYYY-MM-DD
  ymd: string // YYYYMMDD（SNAP DATUM）
  time: string // HH:MM:SS
  hhmmss: string // HHMMSS（SNAP UZEIT）
  user: string
  mandt: string // 3 位
  modno: string
  ahost: string
  flist: string
  error?: string
  program?: string
  include?: string
  line?: string
  exception?: string
}

export type SnapKey = { mandt: string; ymd: string; hhmmss: string; modno: string; ahost: string }

export type RunQuery = (sql: string, maxRows: number) => Promise<{ values?: SnapRawRow[] }>

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function ymdFrom(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}${pad2(v.getUTCMonth() + 1)}${pad2(v.getUTCDate())}`
  }
  const s = String(v ?? "").trim()
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
  return m ? `${m[1]}${m[2]}${m[3]}` : s.replace(/\D/g, "").slice(0, 8)
}

function hhmmssFrom(v: unknown): string {
  const digits = String(v ?? "").replace(/\D/g, "")
  return digits.padStart(6, "0").slice(-6)
}

/** 解析 FLIST 分段：<类别><子类><3位长度><值> 重复。遇到不合规即停止，不抛错。 */
export function parseFlistSegments(s: string): Array<{ k: string; v: string }> {
  const out: Array<{ k: string; v: string }> = []
  let i = 0
  while (i + 5 <= s.length) {
    const cls = s[i]
    const sub = s[i + 1]
    const lenStr = s.slice(i + 2, i + 5)
    if (!/^\d{3}$/.test(lenStr)) break
    const len = parseInt(lenStr, 10)
    if (len < 0 || i + 5 + len > s.length) break
    out.push({ k: cls + sub, v: s.slice(i + 5, i + 5 + len) })
    i += 5 + len
  }
  return out
}

/** 从 FLIST 头部提取错误类型/程序/包含/行号/异常类（FC/AP/AI/AL/XC）。 */
export function parseFlistHeader(flist: string): {
  error?: string
  program?: string
  include?: string
  line?: string
  exception?: string
} {
  const m: Record<string, string> = {}
  for (const seg of parseFlistSegments(flist)) {
    if (!(seg.k in m)) m[seg.k] = seg.v
  }
  return {
    error: m.FC || undefined,
    program: m.AP || undefined,
    include: m.AI || undefined,
    line: m.AL || undefined,
    exception: m.XC || undefined,
  }
}

export function normalizeSnapDump(raw: SnapRawRow): SnapDump {
  const ymd = ymdFrom(raw.DATUM)
  const hhmmss = hhmmssFrom(raw.UZEIT)
  const flist = String(raw.FLIST ?? "")
  const h = parseFlistHeader(flist)
  return {
    ymd,
    datum: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    hhmmss,
    time: `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}`,
    user: String(raw.UNAME ?? "").trim(),
    mandt: String(raw.MANDT ?? "").trim().padStart(3, "0"),
    modno: String(raw.MODNO ?? "").trim(),
    ahost: String(raw.AHOST ?? "").trim(),
    flist,
    ...h,
  }
}

export function encodeSnapId(d: SnapDump): string {
  return `snap1|${d.mandt}|${d.ymd}|${d.hhmmss}|${d.modno}|${d.ahost}`
}

export function decodeSnapId(id: string): SnapKey | null {
  const parts = id.trim().split("|")
  if (parts.length < 5 || parts[0] !== "snap1") return null
  const [, mandt, ymd, hhmmss, modno, ahost] = parts
  if (!/^\d{3}$/.test(mandt || "") || !/^\d{8}$/.test(ymd || "") || !/^\d{6}$/.test(hhmmss || "")) return null
  return { mandt, ymd, hhmmss, modno: modno || "", ahost: ahost || "" }
}

function splitLocal(local: string): { ymd: string; hhmmss: string } {
  const [d, t] = local.split("T")
  return { ymd: (d || "").replace(/-/g, ""), hhmmss: (t || "00:00:00").replace(/:/g, "") }
}

/** 生成 SNAP 的 WHERE 子句（含日期/时间/用户过滤）。SQL 运算符两侧必须有空格。 */
export function buildSnapWhere(window: DumpTimeWindow, user?: string, client?: string): string {
  const from = splitLocal(window.fromLocal)
  const to = splitLocal(window.toLocal)
  const conds: string[] = []
  if (from.ymd === to.ymd) {
    conds.push(`DATUM = '${from.ymd}'`, `UZEIT >= '${from.hhmmss}'`, `UZEIT <= '${to.hhmmss}'`)
  } else {
    conds.push(
      `((DATUM = '${from.ymd}' AND UZEIT >= '${from.hhmmss}')` +
        ` OR (DATUM = '${to.ymd}' AND UZEIT <= '${to.hhmmss}')` +
        ` OR (DATUM > '${from.ymd}' AND DATUM < '${to.ymd}'))`,
    )
  }
  // 客户端（mandant）：默认按当前连接的 client 限定；传空表示跨所有客户端
  const cli = String(client ?? "").trim().replace(/\D/g, "")
  if (cli) conds.push(`MANDT = '${cli.padStart(3, "0")}'`)
  const u = normalizeDumpUser(user)
  if (u) conds.push(`UNAME = '${u}'`)
  return conds.join(" AND ")
}

export function snapListSql(window: DumpTimeWindow, user?: string, client?: string): string {
  const where = buildSnapWhere(window, user, client)
  return `SELECT DATUM, UZEIT, UNAME, MANDT, MODNO, AHOST, FLIST FROM SNAP WHERE ${where} AND SEQNO = '000'`
}

export function snapDetailSql(key: SnapKey): string {
  // 同一 dump 用 DATUM+UZEIT+MANDT+MODNO 定位（AHOST 在 SNAP 里常右侧补空格，不参与比较）
  // 必须带 FLIST02..08：KERNEL_ERRID / VALUE 触发值 / 变量名都在这些分列里，只读 FLIST 会漏掉根因。
  return (
    `SELECT SEQNO, FLIST, FLIST02, FLIST03, FLIST04, FLIST05, FLIST06, FLIST07, FLIST08,` +
    ` DATUM, UZEIT, UNAME, MANDT, MODNO, AHOST FROM SNAP` +
    ` WHERE DATUM = '${key.ymd}' AND UZEIT = '${key.hhmmss}' AND MANDT = '${key.mandt}' AND MODNO = '${key.modno}'`
  )
}

/** SNAP 里 dump 明细分列（一个 dump 的分段散落在 FLIST/FLIST02..08） */
const FLIST_COLS = [
  "FLIST",
  "FLIST02",
  "FLIST03",
  "FLIST04",
  "FLIST05",
  "FLIST06",
  "FLIST07",
  "FLIST08",
] as const

export type DumpErrorDetail = {
  kernelErr?: string // KERNEL_ERRID 后面的错误标识（如 CONVT_NO_NUMBER）
  value?: string // VALUE 后面的实际触发值（最关键的“具体是哪个值”）
  varName?: string // 触发变量名（如 GS_UPLOAD-ZZYS）
  varValue?: string // 该变量的实际内容
  form?: string // 所在 FORM / 过程
  line?: string // 出错行
}

/** 从 dump 全部分列里抽取“真正的错误与触发值”，无需再让用户追问。 */
export function extractDumpErrorDetail(rows: SnapRawRow[]): DumpErrorDetail {
  // SNAP 把一条 dump 的 FLIST 按 200 字符拆到 FLIST/FLIST02..08，分段会被从中间截断。
  // 因此按“行”把各列顺序拼回连续流再解析，才能对齐出 KERNEL_ERRID / VALUE / 变量。
  const perRowSegs: Array<Array<{ k: string; v: string }>> = rows.map((r) => {
    let s = ""
    for (const c of FLIST_COLS) s += String(r[c] ?? "")
    return parseFlistSegments(s)
  })
  const blob = rows.map((r) => FLIST_COLS.map((c) => String(r[c] ?? "")).join("")).join("\u0000")

  // 1) 内核错误标识 KERNEL_ERRID 与所在过程 XE
  let kernelErr: string | undefined
  let form: string | undefined
  for (const segs of perRowSegs) {
    for (const s of segs) {
      if (s.k === "XA" && !kernelErr && /^KERNEL_ERRID\b/.test(s.v.trim())) {
        kernelErr = s.v.trim().replace(/^KERNEL_ERRID\s*/, "").trim()
      } else if (s.k === "XE" && s.v.trim()) {
        form = form || s.v.trim()
      }
    }
  }
  if (!kernelErr) {
    const me = blob.match(/KERNEL_ERRID\s+([A-Z0-9_]+)/)
    if (me) kernelErr = me[1]
  }

  // 2) 触发值 VALUE —— 只有存在 KERNEL_ERRID 时才可信，否则别处的 “VALUE” 会误报成垃圾
  let value: string | undefined
  if (kernelErr) {
    for (const segs of perRowSegs) {
      for (const s of segs) {
        if (s.k === "XA" && !value && /^VALUE\b/.test(s.v.trim())) {
          value = s.v.trim().replace(/^VALUE\s*/, "").trim()
        }
      }
      if (value) break
    }
    if (!value) {
      const mv = blob.match(/VALUE\s+(.+?)(?=[A-Z]{2}\d{3})/)
      if (mv) value = mv[1].trim()
    }
    // 合理性过滤：单值不应是很长的空白填充 / 表行片段
    if (value && (value.length > 80 || /\t/.test(value) || /\s{3,}/.test(value))) value = undefined
  }

  // 3) 相关变量（N0=变量名，V0=值；取“值等于触发值”的那个变量）
  let varName: string | undefined
  let varValue: string | undefined
  if (value) {
    outer: for (const segs of perRowSegs) {
      let name: string | undefined
      for (const s of segs) {
        if (s.k === "N0") name = s.v.trim()
        else if ((s.k === "V0" || s.k === "V1") && name && s.v.trim() === value) {
          varName = name
          varValue = s.v.trim()
          break outer
        }
      }
    }
    if (!varName) {
      const re = /N0(\d{3})/g
      let m: RegExpExecArray | null
      while ((m = re.exec(blob))) {
        const len = Number(m[1])
        if (!(len > 0 && len < 60)) continue
        const name = blob.slice(m.index + 5, m.index + 5 + len)
        if (!/^[A-Za-z][A-Za-z0-9_]*[-/][A-Za-z0-9_./-]+$/.test(name)) continue
        const afterName = m.index + 5 + len
        const vm = blob.slice(afterName, afterName + 120).match(/V0(\d{3})/)
        if (!vm || vm.index === undefined) continue
        const vstart = afterName + vm.index + vm[0].length
        const val = blob.slice(vstart, vstart + Number(vm[1]))
        if (val.trim() === value) {
          varName = name
          varValue = val.trim()
          break
        }
      }
    }
  }
  return { kernelErr, value, varName, varValue, form }
}

export async function querySnap(
  runQuery: RunQuery,
  sql: string,
  maxRows: number,
  timeoutMs: number,
): Promise<SnapRawRow[]> {
  let timer: NodeJS.Timeout | undefined
  try {
    const res = await Promise.race([
      runQuery(sql, maxRows),
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`SNAP 查询超时（${timeoutMs}ms）`)), timeoutMs)
      }),
    ])
    return Array.isArray(res?.values) ? res.values : []
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function windowLabel(window: DumpTimeWindow, offsetLabel: string): string {
  return `${window.fromLocal.replace("T", " ")} → ${window.toLocal.replace("T", " ")}（SAP ${offsetLabel}）`
}

export function formatSnapList(
  dumps: SnapDump[],
  opts: { windowLabel: string; offsetLabel: string; max: number; fetched: number },
): string {
  if (dumps.length === 0) {
    return [
      "指定时间窗内没有 ABAP dumps（SNAP）。",
      `时间窗: ${opts.windowLabel}`,
    ].join("\n")
  }
  const shown = dumps.slice(0, opts.max)
  const lines = [`找到 ${shown.length} 个 ABAP dumps（时间窗 ${opts.windowLabel}）:`, ""]
  for (const d of shown) {
    lines.push(`- ${d.datum} ${d.time}  用户 ${d.user || "?"}  客户端 ${d.mandt}  MODNO ${d.modno}`)
    lines.push(
      `  ${d.error || "?"}  ${d.program || "?"}:${d.line || "?"}${d.exception ? `  (${d.exception})` : ""}`,
    )
    lines.push(`  dumpId: ${encodeSnapId(d)}`)
  }
  if (opts.fetched > opts.max) {
    lines.push("", `说明：SNAP 共命中 ${opts.fetched} 个，按 maxResults=${opts.max} 只展示前 ${opts.max} 个；可收窄时间窗或加 user 过滤。`)
  }
  lines.push("", "用 analyze_dump + dumpId 查看某个 dump 的完整详情。")
  return lines.join("\n")
}

const TH_BOILERPLATE =
  /(hasRowId|statScnd|primKeyIsEmpty|rtmSelectNoOrderBy|mightBeShared|sharedWithShmTab|isShmLockId|isUsed|isCtfyAble|hasScndKeys|isRowId)/

export function formatSnapDetail(
  rawRows: SnapRawRow[],
  dump: SnapDump,
  opts: { offsetLabel: string },
): string {
  let rows = [...rawRows]
  // 同一 (时间,MODNO) 理论上唯一；若同名主机混入，按 dumpId 里的 AHOST 收窄
  if (dump.ahost) {
    const matched = rows.filter((r) => String(r.AHOST ?? "").trim() === dump.ahost)
    if (matched.length) rows = matched
  }
  rows.sort((a, b) => String(a.SEQNO).localeCompare(String(b.SEQNO)))
  const headerRow = rows.find((r) => String(r.SEQNO) === "000") ?? rows[0]
  const h = parseFlistHeader(String(headerRow?.FLIST ?? dump.flist))
  const detail = extractDumpErrorDetail(rawRows)

  const ths: string[] = []
  const cos: string[] = []
  for (const r of rows) {
    // 同样按行拼接各列，避免分段被 200 字符边界切断后解析丢失
    let joined = ""
    for (const c of FLIST_COLS) joined += String(r[c] ?? "")
    for (const seg of parseFlistSegments(joined)) {
      const v = seg.v.trim()
      if (!v) continue
      if (seg.k === "TH" && !TH_BOILERPLATE.test(v)) ths.push(v)
      else if (seg.k === "CO") cos.push(v)
    }
  }

  const lines = [
    "Dump 详情",
    "────────────────────────────────────────",
    `时间       ${dump.datum} ${dump.time}`,
    `用户       ${dump.user || "?"}    客户端 ${dump.mandt}    主机 ${dump.ahost || "-"}    MODNO ${dump.modno}`,
    `运行时错误 ${h.error || "?"}`,
    `异常类     ${h.exception || "（无，非异常型 dump）"}`,
    `位置       ${h.program || "?"}   (包含 ${h.include || "-"})   第 ${h.line || "?"} 行`,
    "────────────────────────────────────────",
  ]

  // 错误明细：直接把“具体触发值/变量”摆出来，不用再让用户追问
  const detailLines: string[] = []
  const effErr = detail.kernelErr || h.error
  if (detailErrText(effErr)) detailLines.push(`  • 内核错误: ${effErr}`)
  if (detail.value) detailLines.push(`  • 触发值: ${detail.value}`)
  if (detail.varName) {
    const shown = detail.varValue ?? detail.value ?? ""
    detailLines.push(`  • 相关变量: ${detail.varName}${shown ? " = " + shown : ""}`)
  }
  if (detail.form && detail.form !== (h.program || "")) detailLines.push(`  • 所在过程: ${detail.form}`)
  if (detailLines.length) {
    lines.push("错误明细:")
    lines.push(...detailLines)
    lines.push("────────────────────────────────────────")
  }

  if (ths.length) {
    // 优先展示能说明“哪个变量/表/上下文”的片段，其次才是零散字段值
    const pri = (v: string): number =>
      /PROGRAM=|DATA=|Table (reference|IT_)|^\s*[A-Z][A-Z0-9_]{2,}\s*=/.test(v) ? 0 : 1
    const ordered = [...new Set(ths)].sort((a, b) => pri(a) - pri(b))
    lines.push("关键上下文:")
    for (const v of ordered.slice(0, 6)) lines.push("  • " + v.replace(/\\/g, "  ").replace(/\s{3,}/g, " ").slice(0, 100))
  }
  const cos2 = [...new Set(cos.filter((c) => /SQLN|iclr|SELECT|UPDATE|INSERT|DELETE|MODIFY/i.test(c)))].slice(0, 5)
  if (cos2.length) {
    lines.push("相关语句:")
    for (const c of cos2) lines.push("  • " + c.replace(/\s{3,}/g, " "))
  }
  lines.push("", `（该 dump 共 ${rows.length} 段明细，含调用栈/程序环境，按需展开）`)
  return lines.join("\n")
}

function detailErrText(v: string | undefined): boolean {
  return Boolean(v && v.trim())
}


/**
 * 无单行源码时的附加线索：屏幕/程序信息（AD/ES 段）与异常/调用线索（含 => 的变量名）。
 * 用于 DYNP_* 屏幕字段类（行号为 0）和 CL_...CP 类池生成代码这类拿不到源码的 dump。
 */
export function extractExtraClues(rows: SnapRawRow[]): { screens: string[]; calls: string[] } {
  const screens: string[] = []
  const calls: string[] = []
  for (const r of rows) {
    let s = ""
    for (const c of FLIST_COLS) s += String(r[c] ?? "")
    for (const seg of parseFlistSegments(s)) {
      const v = seg.v.trim()
      if (!v) continue
      if ((seg.k === "AD" || seg.k === "ES") && v.length >= 4) {
        screens.push(v.replace(/\s{2,}/g, " ").slice(0, 60))
      } else if (seg.k === "N0" && /=>/.test(v) && !/^%/.test(v)) {
        calls.push(v.slice(0, 80))
      }
    }
  }
  return { screens: [...new Set(screens)].slice(0, 3), calls: [...new Set(calls)].slice(0, 3) }
}
