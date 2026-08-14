/**
 * 写门禁纯逻辑（DSH 底座版）：自 pi 版 register.ts 移植的全部纯函数
 * （授权窗口 / namespaceViolation / scanCodeViolations / 对象名提取），
 * 不依赖 pi 运行时。pi 耦合的 installWriteGate / registerSapTools 已移除——
 * 写门禁由 gate.ts（ctx.tools.guard + tools/pre-execute + inbox 确认词）承担，
 * 工具注册由 index.ts（ctx.tools.register）承担。
 *
 * 代码级强制规则（不依赖 LLM 遵守，写工具内容写入前硬校验）：
 * 1. 开发客户端守卫：非开发类客户端拒绝一切写操作（assertDevClient，见 index.ts execute 路径）
 * 2. 硬编码中文扫描：写入代码含用户可见中文字面量 → 拒绝（必须走消息类/文本元素）
 * 3. 裸内置类型扫描：自建结构/表（TYPES 定义、DDIC DSL 字段）用 string/i/char1 等 → 拒绝（程序内局部变量允许裸类型）
 */
import { readFileSync } from "node:fs"
import { sapbuddyPath } from "./sapbuddy-home.js"
import { tools } from "./tools/index.js"
import { resetActiveRequests } from "./taskTransport.js"

// ── 写操作人工确认（human-in-the-loop）──
// 所有写工具执行前必须获得用户确认：Web 审批浮层（tools/pre-execute ask）或
// 对话确认词开启授权窗口（agent/inbox/claimed）。批准后有一个时间窗口
// （默认 15 分钟，可配置 approvalWindowMinutes），窗口内放行全部写操作，
// 让 AI 一轮内连续完成多个写操作（create→replace→activate）无需逐次确认。
let writeApprovalUntil = 0
const WRITE_TOOL_NAMES = new Set(
  tools.filter((t) => t.write).map((t) => t.name),
)
export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.has(name)
}
export function setWriteApprovalWindow(ms = 60_000): void {
  writeApprovalUntil = Date.now() + ms
  // 新需求开始 → 共享传输请求重置，让本需求的对象用新请求（同需求内复用）
  resetActiveRequests()
}
export function isWriteApproved(): boolean {
  return Date.now() < writeApprovalUntil
}
export function clearWriteApproval(): void {
  writeApprovalUntil = 0
  // 需求取消/拒绝 → 共享请求一并清掉，避免残留影响下次
  resetActiveRequests()
}

/** 从写工具参数中提取对象名（统一大写；fileUri 取末段并去 /source/main 等子路径后缀）。
 * 除常规对象名外，也收集翻译工具的写目标（messageClass=消息类、prefix=DDIC 文本前缀、texts[].name=逐条对象名），
 * 保证审计日志能记录这类"写表"工具的改动范围。 */
export function extractObjectNames(input: unknown): string[] {
  const o = (input ?? {}) as Record<string, unknown>
  const out = new Set<string>()
  for (const key of ["name", "objectName", "className", "parentName"] as const) {
    const v = o[key]
    if (typeof v === "string" && v.trim()) out.add(v.trim().toUpperCase())
  }
  for (const key of ["messageClass", "prefix"] as const) {
    const v = o[key]
    if (typeof v === "string" && v.trim()) out.add(v.trim().toUpperCase())
  }
  const texts = o.texts
  if (Array.isArray(texts)) {
    for (const t of texts) {
      const n = (t as Record<string, unknown>)?.name
      if (typeof n === "string" && n.trim()) out.add(n.trim().toUpperCase())
    }
  }
  const uri = String(o.fileUri ?? "")
  if (uri) {
    const seg = uri.split("/").filter(Boolean).pop()
    if (seg) out.add(seg.replace(/\.\w+$/, "").toUpperCase())
  }
  return [...out]
}

// ── 用户消息处理（确认词/拒绝词 → 授权窗口；CLI 与 Web 共用同一套规则）──
// 只认明确批准词（确认/同意/批准…），避免日常应答（好的/可以/ok/行）无意中打开写授权窗口
const CONFIRM_RE = /确认|同意|允许|批准|就这么办|执行|继续|go ahead/i
const REJECT_RE = /拒绝|不要|取消|算了|不干|停止|换个方案|重新来|推翻|改回|不用了|撤回|不执行|不能执行|先别|暂不|先不做|别急|别继续/i

/** 授权窗口毫秒数：读配置目录 settings.json 的 approvalWindowMinutes（默认 15 分钟） */
function approvalWindowMs(): number {
  try {
    const cfg = JSON.parse(readFileSync(sapbuddyPath("settings.json"), "utf8").toString())
    const m = Number(cfg.approvalWindowMinutes)
    if (m > 0 && Number.isFinite(m)) return m * 60 * 1000
  } catch { /* 默认 */ }
  return 15 * 60 * 1000
}

export function handleUserMessage(text: string): void {
  const t = String(text || "").trim()
  if (REJECT_RE.test(t)) {
    clearWriteApproval()
  } else if (CONFIRM_RE.test(t)) {
    // 授权窗口时长可配置（settings.approvalWindowMinutes，默认 15 分钟）
    setWriteApprovalWindow(approvalWindowMs())
  }
  // 中性/继续类消息不清除窗口，避免同一需求反复授权
}

/** 只读模式开关：connections.json 的 security.readOnly 未明确为 false 即只读
 * （与网页端默认显示"已锁定"一致：没写该项 = 只读保护开启） */
export function isReadOnly(): boolean {
  try {
    const cfg = JSON.parse(readFileSync(sapbuddyPath("connections.json"), "utf8").toString())
    return cfg.security?.readOnly !== false
  } catch { return true } // 读取/解析失败时保守只读（fail-closed，与 config.ts 的 readOnly ?? true 一致）
}

/** 函数组内部程序是否属于客户命名空间：SAPL<FG>/L<FG><后缀>，所属函数组（FG）为 Z/Y 开头即为客户对象（SE38 可直接编辑） */
function isCustomerFunctionGroupProgram(name: string): boolean {
  return /^(SAPL|L)[ZY]/i.test(name)
}

/** 从 ADT 对象 URI（/sap/bc/adt/... 或 adt://host/...）提取对象名：
 * 从右往左跳过资源子路径段（source/main/includes/fmodules/subcomponents 等），取第一个名字段。 */
function objectNameFromUri(uri: string): string {
  let path = uri.trim()
  if (/^adt:\/\//i.test(path)) {
    try { path = new URL(path).pathname } catch { return "" }
  }
  const segs = path.split("/").filter(Boolean)
  const SKIP = new Set(["source", "main", "includes", "fmodules", "subcomponents", "fragments", "texts", "lines", "methods", "attributes", "events", "types"])
  while (segs.length && SKIP.has(segs[segs.length - 1].toLowerCase())) segs.pop()
  const name = segs.pop()
  return name ? name.toUpperCase() : ""
}

/** 命名空间强制：写操作对象名必须以 Z 或 Y 开头（SAP 标准对象只读不写）。
 * 函数组内部程序（SAPL<FG>/L<FG>*）按所属函数组判断：函数组为 Z/Y 开头时放行。
 * 只检查明确的"对象名"字段（name/objectName/className/parentName），传输请求号等不参与。
 * 返回违规说明；空串 = 通过。 */
export function namespaceViolation(input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>
  for (const key of ["name", "objectName", "className", "parentName"] as const) {
    const v = o[key]
    if (typeof v !== "string" || !v.trim()) continue
    const n = v.trim()
    if (/^[A-Za-z0-9_/-]+$/.test(n) && !/^[ZY]/i.test(n)) {
      // 函数组内部程序（SAPL<FG>/L<FG><后缀>）：所属函数组为 Z*/Y* 即为客户对象，放行
      if (isCustomerFunctionGroupProgram(n)) continue
      return `对象名 "${n}" 不是 Z*/Y* 开头（SAP 标准对象只读不写）。请确认对象名，或改用只读工具查询。`
    }
  }
  // 工具特定写目标：fix_ddic_text 的 prefix（copy 模式批量对象范围）、translate_message_class 的
  // messageClass（消息类，copy 可带 % 通配）——同样限定 Z*/Y*，否则 prefix="%" 可批量改全系统文本、
  // 消息类可写标准类（如 00）。去掉尾部通配符（ZE_% / Z*）后的字面部分必须 Z*/Y* 开头；全通配（%）视为违规。
  for (const key of ["prefix", "messageClass"] as const) {
    const v = o[key]
    if (typeof v !== "string" || !v.trim()) continue
    const n = v.trim()
    const literal = n.replace(/[%*]+$/, "").trim()
    if (!literal || (/^[A-Za-z0-9_/-]+$/.test(literal) && !/^[ZY]/i.test(literal))) {
      return `对象范围 "${n}" 不是 Z*/Y* 开头（SAP 标准对象只读不写）。请确认对象名，或改用只读工具查询。`
    }
  }
  // fileUri：按文件地址定位对象的写工具（如 replace_string_in_abap_object）只有 URI、没有上面的对象名字段，
  // 从 URI 提取对象名后同样做 Z*/Y* 校验，堵住"改标准对象不被命名空间卡"的口子。
  const fileUri = String(o.fileUri ?? "")
  if (fileUri) {
    const n = objectNameFromUri(fileUri)
    if (n && /^[A-Za-z0-9_/-]+$/.test(n) && !/^[ZY]/i.test(n) && !isCustomerFunctionGroupProgram(n)) {
      return `对象 "${n}"（来自 fileUri ${fileUri.slice(0, 60)}）不是 Z*/Y* 开头（SAP 标准对象只读不写）。请确认对象名，或改用只读工具查询。`
    }
  }
  return ""
}

/**
 * 扫描 ABAP 代码：硬编码中文文案 + 结构/表定义中的裸内置类型
 * 裸内置类型仅限制「自建表/结构」：ABAP TYPES 定义（含 BEGIN OF 块）与 DDIC DSL define structure/table 的字段；
 * 程序内局部变量/临时量（DATA、方法参数、函数接口等）允许裸类型（Clean ABAP 对技术临时量本就允许）
 * @returns 违规列表（空 = 通过）
 */
export function scanCodeViolations(code: string): string[] {
  const violations: string[] = []
  if (!code) return violations
  const lines = code.split(/\r?\n/)

  const banned = new Set([
    "c", "n", "i", "p", "string", "xstring", "d", "t", "decfloat16", "decfloat34",
    "int1", "int2", "int4", "int8", "char1", "char2", "char3", "char4",
    "char10", "char12", "char20", "char30", "char40", "char50", "char60",
    "char80", "char100", "char120", "char132", "char133", "char200", "char255",
    "numc2", "numc3", "numc4", "numc5", "numc6", "numc8", "numc10",
    "dats", "tims", "tstmp", "raw", "rawstring", "unit", "curr", "quan",
  ])
  let typeDefDepth = 0 // TYPES: BEGIN OF ... END OF 嵌套深度
  let inDefineBlock = false // define structure/table { ... } DDIC DSL 块内

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    // 去掉 ABAP 注释（" 之后到行尾），避免误报注释中的中文/类型
    const noComment = raw.split('"')[0]
    // CDS 注解行（@EndUserText.label / @AbapCatalog.* 等）：值是 DDIC 元数据文本（视图描述），
    // 不是运行时用户可见文案，且 CDS 源码无 DATA 声明 → 两类扫描都豁免
    const isAnnotationLine = noComment.trim().startsWith("@")
    if (isAnnotationLine) continue

    // 1) 硬编码中文：单引号字符串字面量含中文（MESSAGE WITH '中文'、VALUE #( message = '中文' ) 等）
    //    + ABAP 反引号文本字面量（`中文`，不限长字符串）也属于用户可见文案，一并扫描
    const cnMatches = noComment.match(/'([^']*[一-龥][^']*)'/g) || []
    const btMatches = noComment.match(/`([^`]*[一-龥][^`]*)`/g) || []
    const allCn = [...cnMatches, ...btMatches]
    if (allCn.length) {
      for (const m of allCn) {
        const text = m.slice(1, -1)
        // 允许中文变量名/字段名等非常规场景极少，一律视为文案违规（规范要求走消息类/文本元素）
        violations.push(`第 ${i + 1} 行：硬编码中文文案 ${text.length > 20 ? text.slice(0, 20) + "…" : text}（必须改为消息类 MESSAGE e001(zxxx) 或文本元素 TEXT-xxx）`)
      }
    }

    // 2) 结构/表类型定义中的裸内置类型：TYPES 声明（含 BEGIN OF 块）属"自建表/结构" → 必须用 DDIC 类型；
    //    程序内 DATA/方法参数/函数接口等 → 放行裸类型
    const hasTypesKw = /\bTYPES\b/i.test(noComment)
    if (/\bBEGIN\s+OF\b/i.test(noComment) && hasTypesKw) typeDefDepth++
    if (/\bEND\s+OF\b/i.test(noComment)) typeDefDepth = Math.max(0, typeDefDepth - 1)
    if (hasTypesKw || typeDefDepth > 0) {
      // 一行内可能有多个 TYPE（如 a TYPE i, b TYPE string.）→ 全部检查
      const typeTokens = noComment.matchAll(/TYPE\s+([a-z]\w*)/gi)
      for (const m of typeTokens) {
        const t = m[1].toLowerCase()
        if (banned.has(t)) {
          violations.push(`第 ${i + 1} 行：自建结构/表类型字段用裸内置类型 TYPE ${t.toUpperCase()}（结构字段必须用 DDIC 数据元素/结构，找不到标准元素时创建 Z 数据元素 + 域；程序内局部变量不受限）`)
        }
      }
    }

    // 3) DDIC DSL 结构字段：define structure/table 内直接 `字段 : abap.<内置类型>;` 属裸类型
    //    （abap.clnt / abap.cust 是客户端键特殊标记，放行；数据元素按名字引用、reference to 均不在此列）
    const defineKw = /\bdefine\s+(?:append\s+)?(structure|table)\b/i.test(noComment)
    if (defineKw) inDefineBlock = true
    const dslField = noComment.match(/^\s*(?:key\s+)?[A-Za-z_][\w]*\s*:\s*abap\.([A-Za-z0-9_]+)/)
    if (dslField && (inDefineBlock || defineKw)) {
      const at = dslField[1].toLowerCase()
      if (at !== "clnt" && at !== "cust") {
        violations.push(`第 ${i + 1} 行：DDIC 结构字段用裸内置类型 abap.${at.toUpperCase()}（结构字段必须用 DDIC 数据元素，如 matnr/bukrs/dmbtr；找不到标准元素时创建 Z 数据元素 + 域）`)
      }
    }
    if (noComment.includes("}")) inDefineBlock = false
  }
  return violations
}

/** 工具清单（供 CLI/安装器展示） */
export function listToolNames(): Array<{ name: string; write: boolean }> {
  return tools.map((t) => ({ name: t.name, write: !!t.write }))
}
