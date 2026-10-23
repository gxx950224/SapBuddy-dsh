/**
 * 屏幕文字多语言翻译工具
 *
 * 背景：SAP 屏幕文字（屏幕标题/字段标签）没有 ADT 写接口，需直接改系统表：
 *  - D020S 屏幕定义（PROG,DNUM 等）
 *  - D020T 屏幕标题翻译（PROG,DYNR,LANG,DTXT，DTXT 最长 60 字符）
 *  - D021T 屏幕字段/元素文本翻译（PROG,DYNR,LANG,FLDN,DTXT，DTXT 最长 132 字符）
 * 这些表客户端无关（跨客户端）；语言键 1=中文简体 M=繁体 等，越南语 VI 的特殊键从 T002 反查。
 * 注意：直接改系统表不会自动创建传输请求条目，如需进传输请手工插入（同 SAPLZBCG014 的处理）。
 * 本工具生成可执行类在 SAP 内解析语言键 + MODIFY D021T/D020T，写入后自检：重读目标语言行核对，
 * 对不上报错回滚，不假装成功。
 * 模式：
 *  - list：列出程序全部屏幕的标题(D020T)与字段(D021T)文本（供定位 dynr/fldn，可指定语言）
 *  - set：按 fields[{dynr,fldn,text}]（字段标签）与/或 titles[{dynr,text}]（屏幕标题）写入翻译
 */
import { z } from "zod";
/** 生成 list 模式类源码：列出全部屏幕标题(D020T)与字段(D021T) */
export declare function buildListSource(className: string, cand1: string, cand2: string, lang: string): string;
/** 生成 set 模式类源码：写入 D021T 字段标签 + D020T 屏幕标题，写入后自检 */
export declare function buildSetSource(className: string, cand1: string, cand2: string, tgtLang: string, fields: Array<{
    dynr: string;
    fldn: string;
    text: string;
}>, titles: Array<{
    dynr: string;
    text: string;
}>): string;
export declare const translateScreenTextTool: {
    name: string;
    write: boolean;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        mode: z.ZodEnum<{
            set: "set";
            list: "list";
        }>;
        objectName: z.ZodString;
        targetLanguage: z.ZodString;
        fields: z.ZodOptional<z.ZodArray<z.ZodObject<{
            dynr: z.ZodString;
            fldn: z.ZodString;
            text: z.ZodString;
        }, z.core.$strip>>>;
        titles: z.ZodOptional<z.ZodArray<z.ZodObject<{
            dynr: z.ZodString;
            text: z.ZodString;
        }, z.core.$strip>>>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        mode: string;
        objectName: string;
        targetLanguage: string;
        fields?: Array<{
            dynr: string;
            fldn: string;
            text: string;
        }>;
        titles?: Array<{
            dynr: string;
            text: string;
        }>;
        connectionId?: string;
    }): Promise<string>;
};
