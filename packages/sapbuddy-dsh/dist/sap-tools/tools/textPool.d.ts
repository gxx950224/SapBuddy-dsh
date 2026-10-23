/**
 * 程序文本元素(text pool)按语言翻译工具
 *
 * SAP text pool 通过 READ TEXTPOOL / INSERT TEXTPOOL 语句按语言读写。
 * 本工具生成可执行类在 SAP 内执行：
 *  - list 模式：读取目标语言现有 text pool（输出 ID|KEY|文本，供核对真实 key/文本）
 *  - copy 模式：把源语言 text pool 复制为指定目标语言
 *  - set 模式：按 [{key,text}] 写入目标语言（key: T=标题/描述, I=文本符号 TEXT-xxx, S=选择文本）
 *  - delete 模式：按 deleteKeys 删除条目
 * 程序描述(SE38标题)即 text pool 的 KEY='T' 条目。
 */
import { z } from "zod";
/** 文本符号键：1~3 位字母/数字（如 001、E01、TXT）都是文本符号（ID='I'）；
 *  其余（含下划线的选择参数名、更长标识等）视为选择文本（ID='S'）。
 *  ⚠️ 曾只认 3 位纯数字（/^\d{3}$/），导致 E01/S01/I01 这类带字母的符号被误写成选择文本（ID='S'）。 */
export declare const isTextSymbolKey: (key: string) => boolean;
/** 生成可执行类源码 */
export declare function generateClassSource(className: string, mode: "copy" | "set" | "delete" | "list", opts: {
    prog: string;
    srcLang?: string;
    tgtLang: string;
    texts?: Array<{
        key: string;
        text: string;
    }>;
    deleteKeys?: string[];
}): string;
export declare const translateTextPoolTool: {
    name: string;
    write: boolean;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        mode: z.ZodEnum<{
            delete: "delete";
            set: "set";
            list: "list";
            copy: "copy";
        }>;
        targetLanguage: z.ZodString;
        sourceLanguage: z.ZodOptional<z.ZodString>;
        texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            text: z.ZodString;
        }, z.core.$strip>>>;
        deleteKeys: z.ZodOptional<z.ZodArray<z.ZodString>>;
        transportNumber: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        mode: string;
        targetLanguage: string;
        sourceLanguage?: string;
        texts?: Array<{
            key: string;
            text: string;
        }>;
        deleteKeys?: string[];
        transportNumber?: string;
        connectionId?: string;
    }): Promise<string>;
};
