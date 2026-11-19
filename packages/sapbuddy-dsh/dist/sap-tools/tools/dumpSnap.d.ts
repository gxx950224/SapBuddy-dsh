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
import type { DumpTimeWindow } from "./dumpQuery.js";
export type SnapRawRow = Record<string, unknown>;
export type SnapDump = {
    datum: string;
    ymd: string;
    time: string;
    hhmmss: string;
    user: string;
    mandt: string;
    modno: string;
    ahost: string;
    flist: string;
    error?: string;
    program?: string;
    include?: string;
    line?: string;
    exception?: string;
};
export type SnapKey = {
    mandt: string;
    ymd: string;
    hhmmss: string;
    modno: string;
    ahost: string;
};
export type RunQuery = (sql: string, maxRows: number) => Promise<{
    values?: SnapRawRow[];
}>;
/** 解析 FLIST 分段：<类别><子类><3位长度><值> 重复。遇到不合规即停止，不抛错。 */
export declare function parseFlistSegments(s: string): Array<{
    k: string;
    v: string;
}>;
/** 从 FLIST 头部提取错误类型/程序/包含/行号/异常类（FC/AP/AI/AL/XC）。 */
export declare function parseFlistHeader(flist: string): {
    error?: string;
    program?: string;
    include?: string;
    line?: string;
    exception?: string;
};
export declare function normalizeSnapDump(raw: SnapRawRow): SnapDump;
export declare function encodeSnapId(d: SnapDump): string;
export declare function decodeSnapId(id: string): SnapKey | null;
/** 生成 SNAP 的 WHERE 子句（含日期/时间/用户过滤）。SQL 运算符两侧必须有空格。 */
export declare function buildSnapWhere(window: DumpTimeWindow, user?: string, client?: string): string;
export declare function snapListSql(window: DumpTimeWindow, user?: string, client?: string): string;
export declare function snapDetailSql(key: SnapKey): string;
export type DumpErrorDetail = {
    kernelErr?: string;
    value?: string;
    varName?: string;
    varValue?: string;
    form?: string;
    line?: string;
};
/** 从 dump 全部分列里抽取“真正的错误与触发值”，无需再让用户追问。 */
export declare function extractDumpErrorDetail(rows: SnapRawRow[]): DumpErrorDetail;
export declare function querySnap(runQuery: RunQuery, sql: string, maxRows: number, timeoutMs: number): Promise<SnapRawRow[]>;
export declare function formatSnapList(dumps: SnapDump[], opts: {
    windowLabel: string;
    offsetLabel: string;
    max: number;
    fetched: number;
}): string;
export declare function formatSnapDetail(rawRows: SnapRawRow[], dump: SnapDump, opts: {
    offsetLabel: string;
}): string;
/**
 * 无单行源码时的附加线索：屏幕/程序信息（AD/ES 段）与异常/调用线索（含 => 的变量名）。
 * 用于 DYNP_* 屏幕字段类（行号为 0）和 CL_...CP 类池生成代码这类拿不到源码的 dump。
 */
export declare function extractExtraClues(rows: SnapRawRow[]): {
    screens: string[];
    calls: string[];
};
