/**
 * 函数模块接口参数强控：检测源码里写入的参数段，规范化为服务器接受的格式。
 *
 * 关键事实（真机实测）：ADT 服务器会从 /source/main 的源码 PUT 里自动提取函数模块的
 * IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS 参数，持久化进接口元数据（FUPARAREF），
 * 不需要也不该改 fmodule 对象 XML（其元数据不含 interface，且 PUT 走 v3 Content-Type schema）。
 * 但服务器对参数写法有硬性约束：
 *  - OPTIONAL 任意段可用；
 *  - DEFAULT 仅 IMPORTING/CHANGING 可用，EXPORTING 用 DEFAULT 报 "Parameter DEFAULT declares no type"；
 *  - DEFAULT 与 OPTIONAL 不能同时用于同一参数；
 *  - TABLES 参数不能内联 "TYPE ... TABLE OF ..."，须引用已存在类型（如 STRING_TABLE）或 LIKE 已有内表。
 *
 * 本模块把 LLM 可能写出的非法格式自动修正（EXPORTING 段 DEFAULT 移除 / DEFAULT 与 OPTIONAL 冲突时
 * 保留 DEFAULT 移除 OPTIONAL），无法修正的（TABLES 内联表类型）放进 errors 让调用方中止并提示。
 */
export type FmKind = "importing" | "exporting" | "changing" | "tables" | "exceptions";
export declare const FM_KINDS: FmKind[];
export interface FmParam {
    name: string;
    /** 类型表达式（大写），如 STRING / CHAR10 / TABLE OF STRING / ZDATA_ELEMENT */
    type: string;
    typeKind: "TYPE" | "LIKE";
    optional: boolean;
    defaultValue: string;
}
export interface FmParseResult {
    /** 是否识别到"函数模块源码里写了参数段" */
    matched: boolean;
    moduleName: string;
    /** 按段分组的参数；只含实际出现的段 */
    groups: Partial<Record<FmKind, FmParam[]>>;
    /** 源码里显式声明了哪些段（空段 = 清空该段接口） */
    presentKinds: FmKind[];
    /** 剥离参数段后的干净源码（FUNCTION <name>. + 主体） */
    cleanSource: string;
}
export interface FmNormalizeResult {
    matched: boolean;
    /** 规范化后的完整源码（参数块保留），可直接 PUT；无修正时等于原 source */
    normalized: string;
    /** 自动修正的说明（人类可读，写入成功信息里回显给用户） */
    notes: string[];
    /** 无法自动修正的错误，非空时调用方应中止写入 */
    errors: string[];
    groups: Partial<Record<FmKind, FmParam[]>>;
    presentKinds: FmKind[];
}
/** 判断编辑通道是否为函数模块自身源码（否则接口参数段写进去 SAP 报 IMPORTING is not expected 且不提取） */
export declare function isFmoduleSourceChannel(sourceUri: string): boolean;
/** 检测源码里是否用 *" 注释行写了函数模块接口参数（错误写法）。
 *  函数模块自身的 /source/main 通道合法内容永远不会出现 *"（有参数时显示真实声明，无参数时显示模板注释），
 *  出现 *" + 参数段关键字 / VALUE( 说明 LLM 想用注释代替真实声明——注释不会被服务器提取进接口，必须拦截引导。 */
export declare function detectCommentParamBlock(source: string): boolean;
/**
 * 从源码识别"函数模块参数段写进了源码"并拆出参数。
 * 兼容两种错误写法：
 *   FUNCTION ZFM_X\n  IMPORTING ... \n  ... .            （函数名后无句点，段尾句点收束）
 *   FUNCTION ZFM_X.  + 独立 IMPORTING ... 段             （函数名带句点，段跟在后面）
 * 返回 matched=true 时，cleanSource 已剥离参数段（只留 FUNCTION <name>. + 主体）。
 */
export declare function parseFunctionModuleParams(source: string): FmParseResult;
/**
 * 检测源码里的函数模块参数段，并把服务器不接受的写法规范化：
 *  - EXPORTING 段参数的 DEFAULT 移除（DEFAULT 只允许 IMPORTING/CHANGING）
 *  - 同一参数的 DEFAULT 与 OPTIONAL 冲突 → 保留 DEFAULT 移除 OPTIONAL
 *  - TABLES 参数内联 "TYPE ... TABLE OF ..." → 无法自动修正，进 errors
 * 其余行原样保留。参数段随源码保留并放行写入，由服务器提取进接口元数据。
 */
export declare function normalizeFunctionModuleParams(source: string): FmNormalizeResult;
/** FORM 参数内联表类型 → 自动修正。
 *  真机实测：FORM 参数段（TABLES/USING/CHANGING）写 `CT_X TYPE STANDARD TABLE OF <表>` 会被 SAP
 *  当成 6 个形式参数展开，PERFORM 侧对不上报 "Different number of parameters in FORM and PERFORM
 *  (formal: 6, actual: 4)"（内联表类型按结构字段展开，一列变成一个形式参数）。
 *  正确写法：先在 include 里定义表类型 `TYPES: tt_<表> TYPE STANDARD TABLE OF <表>.`，
 *  FORM 参数引用 `TYPE tt_<表>`。本函数自动把 FORM 参数段的内联表类型改写为对 tt_<表> 的引用，
 *  并在 include 顶部补类型定义（尚未定义时）。只处理 FORM 参数行；函数体里合法的
 *  `DATA x TYPE STANDARD TABLE OF mard` 不受影响。 */
export declare function normalizeFormIncludeSource(source: string): {
    source: string;
    changed: boolean;
    notes: string[];
};
/**
 * Open SQL 里引用接口参数必须加 @ 前缀（ABAP 7.40+ 主机变量转义，真机实测：`INTO TABLE et_mard`
 * 报 "ET_MARD is invalid here (due to grammar)"；`WHERE matnr = iv_matnr` 报
 * "The variable IV_MATNR must be escaped using @"）。
 * 自动给 Open SQL 语句窗口内（SELECT/INSERT/UPDATE/MODIFY/DELETE/WITH/MERGE 起、行尾句点止）的接口参数加 @，
 * 避免 LLM 写裸参数名导致激活前语法错误。普通 ABAP（赋值/条件/方法调用/CLEAR 等）不受影响。
 * 结构化位置 `INTO [TABLE] <变量>` 对任意标识符也补 @（该位置必然是主机变量，含局部变量/行内声明）。
 */
export declare function escapeOpenSqlHostVars(source: string, groups: Partial<Record<FmKind, FmParam[]>>): {
    source: string;
    changed: boolean;
    names: string[];
};
