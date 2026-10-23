/** 工具公共辅助：搜索结果格式化、错误处理 */
import { z } from "zod";
import { SearchResult } from "abap-adt-api";
import { getClient } from "../adtManager.js";
/** 默认搜索类型（与 abap_fs 保持一致） */
export declare const DEFAULT_SEARCH_TYPES: readonly ["FUNC", "CLAS", "TABL", "PROG", "INTF", "DTEL", "DDLS", "DOMA", "TTYP", "ENQU", "MSAG", "FUGR", "DEVC", "TRAN", "VIEW", "SICF", "WDYN", "SPRX", "XSLT", "TRANSFORMATIONS", "SUSH", "SUSC", "PINF", "ENHC", "ENHO", "ENHS", "BADI", "BADII", "SAMC", "SAPC", "SFSW", "SFBF", "SFBS", "JOBD", "NROB", "SUSO", "BDEF", "SRVB"];
export declare const connectionIdSchema: z.ZodOptional<z.ZodString>;
export declare const objectTypeSchema: z.ZodOptional<z.ZodString>;
export declare function formatSearchResult(r: SearchResult): string;
/** XML 属性值转义（顺序：先 & 后其它，避免把已转义的 &quot; 二次转义） */
export declare function escapeXmlAttr(s: string): string;
/** 截断并清洗 SAP/ADT 错误信息：剥离 <stack> 标签并限长，避免把服务器内部堆栈泄露给 AI/用户 */
export declare function sanitizeErrMsg(err: unknown, max?: number): string;
/** 格式化工具错误为 LLM 可读、可自愈的文本 */
export declare function toToolError(err: unknown): string;
/** 校验 connectionId 或取默认（当前启用连接，无标记则第一个） */
export declare function resolveConnectionId(connectionId?: string): Promise<string>;
/** 按名称+类型搜索对象，返回第一条结果的完整信息（含 URI）
 * opts.includeDirectRead=false 时跳过 include 通用通道直读回退（写操作专用：保持原函数组解析行为） */
export declare function findObject(connId: string, objectName: string, objectType?: string, searchTypes?: string[], opts?: {
    includeDirectRead?: boolean;
}): Promise<SearchResult | undefined>;
/** 函数组内部程序名识别：SAPL<FG> 主程序 → { fgName, isMain:true }；L<FG><后缀> include → { fgName, isMain:false } */
export declare function matchFunctionGroupProgram(name: string): {
    fgName: string;
    isMain: boolean;
} | undefined;
/** 函数组内部程序解析（ADT 架构：SAPL<FG>/L<FG>* 不是独立 PROGRAM 资源）：
 *  SAPL<FG> → FUGR/F（读 /source/main 得 include 骨架，即 SE38 中 SAPL<FG> 的内容）
 *  L<FG><后缀> → FUGR/I（读 /functions/groups/<fg>/includes/<include>/source/main 得完整源码）
 *  后缀不限于标准 3 字符：如 LCORU_SFD1（函数组 CORU）也能识别——从名字里试探候选函数组名，
 *  用 FUGR 搜索验证真实存在后命中，避免误判为独立程序（搜索找不到）。
 *  找不到对应函数组返回 undefined */
export declare function findFunctionGroupProgram(connId: string, objectName: string): Promise<SearchResult | undefined>;
/**
 * 函数组 include（L<FG><后缀>）写路径（lock+PUT）不认 /programs/includes/ 通用通道——只有读路径可用，
 * 写必须用 /functions/groups/<fg>/includes/<name>。把 /programs/includes/<name> 形式的 URI 改写为函数组通道。
 * 一律走 findFunctionGroupProgram（经 FUGR 搜索验证函数组真实存在），不用未验证的同步后缀猜测——
 * 否则 LCORU_SFD1（函数组 CORU）会被猜成 coru_sf，写错地址。非函数组 include（普通 INCLUDE 程序）返回 undefined。
 */
export declare function normalizeFunctionGroupIncludeUri(connId: string, adtUri: string): Promise<string | undefined>;
/** 按名称+类型搜索对象（找不到抛错，附带搜索建议） */
export declare function requireObject(connId: string, objectName: string, objectType?: string, opts?: {
    includeDirectRead?: boolean;
}): Promise<SearchResult>;
/** 根据对象类型返回最佳源码 URI（移植自 abap_fs getOptimalObjectURI） */
export declare function getOptimalObjectURI(objectType: string | undefined, baseUri: string): string;
/** 智能读源码：优先 optimal URI，失败回退对象 URI */
export declare function readSourceSmart(client: Awaited<ReturnType<typeof getClient>>, objectType: string | undefined, baseUri: string): Promise<string>;
/** 按 URI 读源码（对象主 URI 优化：class 的 source/main） */
export declare function readSourceByUri(client: Awaited<ReturnType<typeof getClient>>, uri: string, objectType?: string): Promise<string>;
/** 按行切片 */
export declare function sliceLines(source: string, startLine?: number, lineCount?: number): {
    header: string;
    content: string;
};
