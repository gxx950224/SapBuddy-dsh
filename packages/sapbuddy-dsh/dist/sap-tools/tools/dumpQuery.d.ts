/** Dump 查询：时间窗 / FQL / 详情链接校验 / Atom 解析（纯逻辑，便于离线单测） */
export declare const DUMP_FEED_PAGE_HINT = 50;
export declare const DUMP_DEFAULT_HOURS_BACK = 2;
export declare const DUMP_MAX_WINDOW_HOURS = 48;
export declare const DUMP_DEFAULT_TIMEOUT_MS = 30000;
export declare const DUMP_MAX_TIMEOUT_MS = 60000;
export declare const DUMP_DEFAULT_MAX_RESULTS = 100;
export declare const DUMP_HARD_MAX_RESULTS = 100;
export type SapOffset = {
    offsetMinutes: number;
    label: string;
};
export type DumpTimeWindow = {
    /** SAP 系统本地墙钟，格式 YYYY-MM-DDTHH:mm:ss（尚无 Z） */
    fromLocal: string;
    toLocal: string;
    /** ADT FQL 用的字面量（墙钟 + 尾缀 Z；按系统本地解释，不是把 Mac/JST 当 UTC） */
    fromFql: string;
    toFql: string;
    hours: number;
    source: "default" | "hoursBack" | "date" | "range";
    crossedMidnight: boolean;
    offset: SapOffset;
};
export type DumpListArgs = {
    user?: string;
    date?: string;
    fromTime?: string;
    toTime?: string;
    from?: string;
    to?: string;
    hoursBack?: number;
    sapTimeZoneOffset?: string;
    maxResults?: number;
    timeoutMs?: number;
};
export type ParsedDump = {
    id: string;
    author?: string;
    text: string;
    type: string;
    links: Array<{
        rel?: string;
        href?: string;
        title?: string;
        type?: string;
    }>;
    categories: Array<{
        term?: string;
        label?: string;
    }>;
};
export type ParsedDumpsFeed = {
    title?: string;
    href?: string;
    dumps: ParsedDump[];
};
/** 解析 SAP 时区偏移：只接受显式数字偏移，不接受 IANA / 不默猜 +08。 */
export declare function parseSapTimeZoneOffset(raw: string | undefined | null): SapOffset;
/** UTC Date → SAP 本地墙钟部件 */
export declare function utcToSapLocalParts(utc: Date, offsetMinutes: number): {
    y: number;
    mo: number;
    d: number;
    h: number;
    mi: number;
    s: number;
};
export declare function formatSapLocal(parts: {
    y: number;
    mo: number;
    d: number;
    h: number;
    mi: number;
    s: number;
}): string;
export declare function toFqlDateTime(local: string): string;
export declare function resolveDumpTimeWindow(args: DumpListArgs, offset: SapOffset, nowUtc?: Date): DumpTimeWindow;
/** SAP 用户名校验：拒绝会破坏 FQL（逗号/分号/括号）的字符；不在值两侧加引号。 */
export declare function normalizeDumpUser(user: string | undefined): string | undefined;
export declare function buildDumpFql(window: DumpTimeWindow, user?: string): string;
export declare function clampDumpMaxResults(raw?: number): number;
export declare function clampDumpTimeoutMs(raw?: number): number;
/**
 * 校验 dump 详情链接：必须与连接同源，且路径落在 /sap/bc/adt/runtime/dump/ 下。
 * 返回可请求的 path（含 query），相对当前 ADT baseURL。
 */
export declare function validateDumpDetailUrl(href: string, connectionUrl: string): {
    ok: true;
    requestPath: string;
} | {
    ok: false;
    reason: string;
};
/** 从 dump entry 的 links 里挑可信详情链接（优先 formatted）。 */
export declare function pickDumpDetailHref(links: Array<{
    href?: string;
    rel?: string;
    title?: string;
}> | undefined): string | undefined;
export declare function truncationNote(fetchedCount: number, maxResults: number): string;
/** 轻量 Atom 解析（仅 dumps feed 所需字段）；不发网络请求。 */
export declare function parseDumpsAtom(body: string): ParsedDumpsFeed;
export declare function matchDumpById(dumps: ParsedDump[], dumpId: string): ParsedDump | undefined;
export type DumpHttpClient = {
    request: (path: string, config: Record<string, unknown>) => Promise<{
        body?: string;
        status?: number;
    }>;
};
/** 带超时的 dumps feed 请求；禁止空 query。走 httpClient 以复用会话自愈包装。 */
export declare function fetchDumpsFeed(http: DumpHttpClient, query: string, timeoutMs: number): Promise<ParsedDumpsFeed>;
/** 带超时的详情读取。 */
export declare function fetchDumpDetail(http: DumpHttpClient, requestPath: string, timeoutMs: number): Promise<string>;
