/** Dump 查询：时间窗 / FQL / 详情链接校验 / Atom 解析（纯逻辑，便于离线单测） */
export const DUMP_FEED_PAGE_HINT = 50;
export const DUMP_DEFAULT_HOURS_BACK = 2;
export const DUMP_MAX_WINDOW_HOURS = 48;
export const DUMP_DEFAULT_TIMEOUT_MS = 30_000;
export const DUMP_MAX_TIMEOUT_MS = 60_000;
export const DUMP_DEFAULT_MAX_RESULTS = 100;
export const DUMP_HARD_MAX_RESULTS = 100;
/** 解析 SAP 时区偏移：只接受显式数字偏移，不接受 IANA / 不默猜 +08。 */
export function parseSapTimeZoneOffset(raw) {
    if (raw == null || String(raw).trim() === "") {
        throw new Error("缺少 SAP 系统时区偏移（sapTimeZoneOffset）。" +
            "Dump 时间按 SAP 系统本地时间解释，不能用本机/JST 冒充。" +
            "请在工具参数或连接配置 connections[].sapTimeZoneOffset 填写，例如 \"+08:00\"、\"UTC+8\"、\"-05:30\"。");
    }
    const s = String(raw).trim();
    const m = s.match(/^UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i) ||
        s.match(/^([+-])\s*(\d{1,2})(?::(\d{2}))?$/);
    if (!m) {
        throw new Error(`无法解析 sapTimeZoneOffset="${s}"。请用显式偏移如 "+08:00" / "UTC+8" / "-05:30"（不支持 Asia/Shanghai 等 IANA 名，也不默认 +08）。`);
    }
    const sign = m[1] === "-" ? -1 : 1;
    const hh = Number(m[2]);
    const mm = Number(m[3] ?? "0");
    if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh > 14 || mm > 59) {
        throw new Error(`sapTimeZoneOffset 数值非法: "${s}"`);
    }
    const offsetMinutes = sign * (hh * 60 + mm);
    if (Math.abs(offsetMinutes) > 14 * 60) {
        throw new Error(`sapTimeZoneOffset 超出合理范围: "${s}"`);
    }
    const label = `${sign < 0 ? "-" : "+"}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    return { offsetMinutes, label };
}
function pad2(n) {
    return String(n).padStart(2, "0");
}
function pad4(n) {
    return String(n).padStart(4, "0");
}
/** UTC Date → SAP 本地墙钟部件 */
export function utcToSapLocalParts(utc, offsetMinutes) {
    const shifted = new Date(utc.getTime() + offsetMinutes * 60_000);
    return {
        y: shifted.getUTCFullYear(),
        mo: shifted.getUTCMonth() + 1,
        d: shifted.getUTCDate(),
        h: shifted.getUTCHours(),
        mi: shifted.getUTCMinutes(),
        s: shifted.getUTCSeconds(),
    };
}
export function formatSapLocal(parts) {
    return `${pad4(parts.y)}-${pad2(parts.mo)}-${pad2(parts.d)}T${pad2(parts.h)}:${pad2(parts.mi)}:${pad2(parts.s)}`;
}
export function toFqlDateTime(local) {
    // ADT dump FQL 约定：尾缀 Z，但数值按系统本地墙钟填写（不是把本机时区当 UTC 换算）
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local)) {
        throw new Error(`内部时间格式错误: ${local}`);
    }
    return `${local}Z`;
}
function parseLocalDateTime(raw, label) {
    const s = raw.trim().replace(" ", "T");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) {
        throw new Error(`${label} 格式应为 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm[:ss]，收到: "${raw}"`);
    }
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const h = Number(m[4] ?? "0"), mi = Number(m[5] ?? "0"), sec = Number(m[6] ?? "0");
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) {
        throw new Error(`${label} 数值非法: "${raw}"`);
    }
    // 用 UTC 日历做合法性粗检
    const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
    if (probe.getUTCFullYear() !== y ||
        probe.getUTCMonth() + 1 !== mo ||
        probe.getUTCDate() !== d) {
        throw new Error(`${label} 不是有效日历日: "${raw}"`);
    }
    return { y, mo, d, h, mi, s: sec };
}
function parseTimeOfDay(raw, label) {
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m)
        throw new Error(`${label} 格式应为 HH:mm 或 HH:mm:ss，收到: "${raw}"`);
    const h = Number(m[1]), mi = Number(m[2]), s = Number(m[3] ?? "0");
    if (h > 23 || mi > 59 || s > 59)
        throw new Error(`${label} 数值非法: "${raw}"`);
    return { h, mi, s };
}
function partsToUtcMs(parts, offsetMinutes) {
    // 把"SAP 本地墙钟"当成 (UTC - offset) 的绝对时刻
    return Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s) - offsetMinutes * 60_000;
}
function addSecondsToParts(parts, seconds) {
    const ms = Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s) + seconds * 1000;
    const d = new Date(ms);
    return {
        y: d.getUTCFullYear(),
        mo: d.getUTCMonth() + 1,
        d: d.getUTCDate(),
        h: d.getUTCHours(),
        mi: d.getUTCMinutes(),
        s: d.getUTCSeconds(),
    };
}
export function resolveDumpTimeWindow(args, offset, nowUtc = new Date()) {
    const hasRange = args.from != null || args.to != null;
    const hasDate = args.date != null || args.fromTime != null || args.toTime != null;
    const hasHours = args.hoursBack != null;
    if (hasRange && (hasDate || hasHours)) {
        throw new Error("请不要同时使用 from/to 与 date/fromTime/toTime/hoursBack");
    }
    if (hasDate && hasHours) {
        throw new Error("请不要同时使用 date/fromTime/toTime 与 hoursBack");
    }
    if ((args.from && !args.to) || (!args.from && args.to)) {
        throw new Error("from 与 to 必须成对提供（SAP 系统本地时间）");
    }
    if ((args.fromTime || args.toTime) && !args.date) {
        throw new Error("使用 fromTime/toTime 时必须同时提供 date（SAP 系统本地日期）");
    }
    let fromParts;
    let toParts;
    let source;
    let crossedMidnight = false;
    if (args.from && args.to) {
        fromParts = parseLocalDateTime(args.from, "from");
        toParts = parseLocalDateTime(args.to, "to");
        source = "range";
    }
    else if (args.date) {
        const day = parseLocalDateTime(args.date, "date");
        const fromT = args.fromTime ? parseTimeOfDay(args.fromTime, "fromTime") : { h: 0, mi: 0, s: 0 };
        const toT = args.toTime ? parseTimeOfDay(args.toTime, "toTime") : { h: 23, mi: 59, s: 59 };
        fromParts = { y: day.y, mo: day.mo, d: day.d, ...fromT };
        toParts = { y: day.y, mo: day.mo, d: day.d, ...toT };
        const fromSec = fromT.h * 3600 + fromT.mi * 60 + fromT.s;
        const toSec = toT.h * 3600 + toT.mi * 60 + toT.s;
        if (toSec < fromSec) {
            // 跨午夜：结束落到次日
            toParts = addSecondsToParts({ y: day.y, mo: day.mo, d: day.d, h: 0, mi: 0, s: 0 }, 24 * 3600 + toSec);
            crossedMidnight = true;
        }
        source = "date";
    }
    else {
        const hoursBack = args.hoursBack ?? DUMP_DEFAULT_HOURS_BACK;
        if (!Number.isFinite(hoursBack) || hoursBack <= 0) {
            throw new Error(`hoursBack 必须为正数，收到: ${String(args.hoursBack)}`);
        }
        if (hoursBack > DUMP_MAX_WINDOW_HOURS) {
            throw new Error(`hoursBack 过大（>${DUMP_MAX_WINDOW_HOURS} 小时）。请缩小窗口或改用 from/to。`);
        }
        const toLocalParts = utcToSapLocalParts(nowUtc, offset.offsetMinutes);
        const fromLocalParts = utcToSapLocalParts(new Date(nowUtc.getTime() - hoursBack * 3600_000), offset.offsetMinutes);
        fromParts = fromLocalParts;
        toParts = toLocalParts;
        source = args.hoursBack != null ? "hoursBack" : "default";
    }
    const fromMs = partsToUtcMs(fromParts, offset.offsetMinutes);
    const toMs = partsToUtcMs(toParts, offset.offsetMinutes);
    if (!(toMs > fromMs)) {
        throw new Error(`时间范围无效（结束必须晚于开始）: ${formatSapLocal(fromParts)} → ${formatSapLocal(toParts)}（SAP 偏移 ${offset.label}）`);
    }
    const hours = (toMs - fromMs) / 3600_000;
    if (hours > DUMP_MAX_WINDOW_HOURS) {
        throw new Error(`时间窗口过大（${hours.toFixed(1)} 小时 > ${DUMP_MAX_WINDOW_HOURS} 小时上限）。请缩小范围，避免 ADT dumps 无界慢查询。`);
    }
    const fromLocal = formatSapLocal(fromParts);
    const toLocal = formatSapLocal(toParts);
    return {
        fromLocal,
        toLocal,
        fromFql: toFqlDateTime(fromLocal),
        toFql: toFqlDateTime(toLocal),
        hours,
        source,
        crossedMidnight,
        offset,
    };
}
/** SAP 用户名校验：拒绝会破坏 FQL（逗号/分号/括号）的字符；不在值两侧加引号。 */
export function normalizeDumpUser(user) {
    if (user == null || user === "")
        return undefined;
    const u = user.trim();
    if (u.length > 12)
        throw new Error(`user 过长（SAP 用户名最长 12）: "${u.slice(0, 20)}…"`);
    if (!/^[A-Za-z0-9_./-]+$/.test(u)) {
        throw new Error(`user 含非法字符（仅允许字母数字 _ . / -，禁止逗号/分号/括号/空白）: "${u}"`);
    }
    if (/[;,()]/.test(u)) {
        throw new Error(`user 含 FQL 危险字符: "${u}"`);
    }
    return u;
}
export function buildDumpFql(window, user) {
    // ADT 运行错误 feed 的 FQL 算子名：只有 greater/greaterOrEquals/less/lessOrEquals/between 等，
    // 没有 "lessThan"（实测会 HTTP 400「Data is invalid and could not be converted」）。上界用 less。
    const parts = [
        `greaterOrEquals(datetime,${window.fromFql})`,
        `less(datetime,${window.toFql})`,
    ];
    const u = normalizeDumpUser(user);
    if (u)
        parts.unshift(`equals(user,${u})`);
    // 单条件时仍包 and(...)，保证永远不是空 query；多条件用逗号分隔（分号会 500）
    if (parts.length === 1)
        return parts[0];
    return `and( ${parts.join(", ")} )`;
}
export function clampDumpMaxResults(raw) {
    const n = raw ?? DUMP_DEFAULT_MAX_RESULTS;
    if (!Number.isInteger(n) || n < 1)
        throw new Error(`maxResults 必须是正整数，收到: ${String(raw)}`);
    return Math.min(n, DUMP_HARD_MAX_RESULTS);
}
export function clampDumpTimeoutMs(raw) {
    const n = raw ?? DUMP_DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(n) || n < 1_000)
        throw new Error(`timeoutMs 过小或非法（最少 1000），收到: ${String(raw)}`);
    return Math.min(n, DUMP_MAX_TIMEOUT_MS);
}
/**
 * 校验 dump 详情链接：必须与连接同源，且路径落在 /sap/bc/adt/runtime/dump/ 下。
 * 返回可请求的 path（含 query），相对当前 ADT baseURL。
 */
export function validateDumpDetailUrl(href, connectionUrl) {
    if (!href || typeof href !== "string")
        return { ok: false, reason: "空链接" };
    const trimmed = href.trim();
    if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
        return { ok: false, reason: `拒绝危险协议: ${trimmed.slice(0, 40)}` };
    }
    let base;
    try {
        base = new URL(connectionUrl);
    }
    catch {
        return { ok: false, reason: `连接 URL 非法: ${connectionUrl}` };
    }
    let target;
    try {
        target = new URL(trimmed, base);
    }
    catch {
        return { ok: false, reason: `无法解析链接: ${trimmed.slice(0, 80)}` };
    }
    if (target.username || target.password) {
        return { ok: false, reason: "拒绝带用户信息的链接" };
    }
    if (target.protocol !== base.protocol || target.hostname !== base.hostname || target.port !== base.port) {
        return {
            ok: false,
            reason: `拒绝跨源链接（期望 ${base.origin}，实际 ${target.origin}）`,
        };
    }
    const path = target.pathname || "";
    if (!path.startsWith("/sap/bc/adt/runtime/dump/")) {
        return { ok: false, reason: `路径不在 dump 详情命名空间: ${path}` };
    }
    if (path.includes("..")) {
        return { ok: false, reason: "拒绝路径穿越" };
    }
    return { ok: true, requestPath: path + target.search + target.hash };
}
/** 从 dump entry 的 links 里挑可信详情链接（优先 formatted）。 */
export function pickDumpDetailHref(links) {
    if (!links?.length)
        return undefined;
    const scored = links
        .filter((l) => typeof l.href === "string" && l.href.length > 0)
        .map((l) => {
        const href = l.href;
        const meta = `${l.rel ?? ""} ${l.title ?? ""} ${href}`.toLowerCase();
        let score = 0;
        if (href.includes("/sap/bc/adt/runtime/dump/"))
            score += 10;
        if (meta.includes("formatted"))
            score += 5;
        if (meta.includes("dump"))
            score += 1;
        return { href, score };
    })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
    return scored[0]?.href;
}
export function truncationNote(fetchedCount, maxResults) {
    const lines = [
        `说明：maxResults=${maxResults} 只是客户端截取，不是服务端 LIMIT；ADT dumps feed 通常只解析/返回第一页（约 ${DUMP_FEED_PAGE_HINT} 条），不会遍历全库。`,
    ];
    if (fetchedCount >= maxResults) {
        lines.push(`本页已按 maxResults 截断（服务端本页返回 ${fetchedCount} 条，展示 ${maxResults} 条）。`);
    }
    if (fetchedCount >= DUMP_FEED_PAGE_HINT) {
        lines.push(`返回条数达到 feed 分页量级（≥${DUMP_FEED_PAGE_HINT}），后面可能还有，请收窄时间窗或加 user 过滤。`);
    }
    return lines.join("\n");
}
function decodeBasicEntities(s) {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}
function attr(tag, name) {
    const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))
        ?? tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
    return m?.[1];
}
/** 轻量 Atom 解析（仅 dumps feed 所需字段）；不发网络请求。 */
export function parseDumpsAtom(body) {
    if (!body || !body.trim())
        return { dumps: [] };
    const feedHref = body.match(/<feed[\s\S]*?<link\b([^>]*)>/i)?.[1];
    const href = feedHref ? attr(feedHref, "href") : undefined;
    const title = body.match(/<feed[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const dumps = [];
    const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    let em;
    while ((em = entryRe.exec(body))) {
        const block = em[1] ?? "";
        const id = (block.match(/<id[^>]*>([\s\S]*?)<\/id>/i)?.[1] ?? "").trim();
        const author = (block.match(/<author[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>/i)?.[1] ?? "").trim() || undefined;
        const summaryTag = block.match(/<summary\b([^>]*)>([\s\S]*?)<\/summary>/i);
        const type = summaryTag ? (attr(summaryTag[1] ?? "", "type") ?? "text") : "text";
        const text = decodeBasicEntities((summaryTag?.[2] ?? "").trim());
        const links = [];
        const linkRe = /<link\b([^>]*)\/?>/gi;
        let lm;
        while ((lm = linkRe.exec(block))) {
            const a = lm[1] ?? "";
            links.push({
                rel: attr(a, "rel"),
                href: attr(a, "href"),
                title: attr(a, "title"),
                type: attr(a, "type"),
            });
        }
        const categories = [];
        const catRe = /<category\b([^>]*)\/?>/gi;
        let cm;
        while ((cm = catRe.exec(block))) {
            const a = cm[1] ?? "";
            categories.push({ term: attr(a, "term"), label: attr(a, "label") });
        }
        if (id)
            dumps.push({ id, author, text, type, links, categories });
    }
    return { href, title, dumps };
}
export function matchDumpById(dumps, dumpId) {
    const rawId = dumpId;
    return (dumps.find((d) => d.id === rawId) ??
        dumps.find((d) => d.id.endsWith(rawId)) ??
        dumps.find((d) => d.id.replace(/\s/g, "").endsWith(rawId.replace(/\s/g, ""))) ??
        dumps.find((d) => rawId.length >= 24 && d.id.includes(rawId.slice(-24))));
}
/** 带超时的 dumps feed 请求；禁止空 query。走 httpClient 以复用会话自愈包装。 */
export async function fetchDumpsFeed(http, query, timeoutMs) {
    if (!query || !query.trim()) {
        throw new Error("内部错误：禁止无条件 / 空 query 的 dumps 请求");
    }
    const response = await http.request("/sap/bc/adt/runtime/dumps", {
        method: "GET",
        qs: { $query: query },
        headers: { Accept: "application/atom+xml;type=feed" },
        timeout: timeoutMs,
    });
    return parseDumpsAtom(String(response?.body ?? ""));
}
/** 带超时的详情读取。 */
export async function fetchDumpDetail(http, requestPath, timeoutMs) {
    const response = await http.request(requestPath, {
        method: "GET",
        headers: { Accept: "text/html, text/plain, */*" },
        timeout: timeoutMs,
    });
    return String(response?.body ?? "");
}
