/**
 * SAP 语言键解析
 *
 * 背景（真机验证）：部分语言的 SAP 键不是可见单字符。越南语 VI 的真实键在 T002 中是
 * 单字节特殊字符（本系统 = U+C069，界面显示为乱码"쁩"）；而 'V' 是瑞典语(SV)，不是越南语。
 * 若把乱码字符当字面量嵌进 ABAP 源码，跨编码传输会被搞坏（ADT 400 / 写入字符 ≠ VI 键）。
 * 解法：工具接受友好写法（ISO 代码/中文名），生成 ABAP 时用变量从 T002 按 ISO 反查真实键，
 * 写入与自检都用该变量 —— 语言键全程在 SAP 内部解析，不经过可能被破坏的文本传输。
 */
export declare const abapStr: (s: string) => string;
export type LangResolve = {
    kind: "literal";
    char: string;
} /** 标准可见单字符键（E/D/1/M…），可直接嵌入 */ | {
    kind: "iso";
    code: string;
} /** ISO 代码（VI/EN/ZH…），运行期从 T002 反查 */ | {
    kind: "raw";
    char: string;
}; /** 用户给了单个字符（可能是特殊键乱码），运行期回 T002 校验存在 */
/** 把用户/LLM 给的语言写法解析为生成 ABAP 用的解析指令；无法识别返回 null */
export declare function resolveLanguageSpec(input: string | undefined): LangResolve | null;
/** 生成 ABAP：把语言键解析结果赋值给变量 lv_var（类型 spras）；反查失败输出 LANG-NOTFOUND 并 RETURN */
export declare function emitLangResolution(varName: string, spec: LangResolve): string[];
/** 描述里用的语言键说明（两个翻译工具共用） */
export declare const LANG_KEY_HELP: string;
