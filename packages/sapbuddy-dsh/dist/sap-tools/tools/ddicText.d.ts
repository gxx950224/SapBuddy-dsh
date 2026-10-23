/**
 * 通用 DDIC 文本写入工具：数据元素(DD04T)/域(DD01T) 的描述+标签写入指定语言
 *
 * 背景：SAP ADT 的 setDataElementProperties/setDomainProperties 只能写语言 E 条目（SAP 端 SBD 限制）。
 * 本工具通过生成可执行类 + ADT runClass 在 SAP 内直接 INSERT/MODIFY 文本表，支持任意语言。
 *
 * 两种模式：
 *  1. copy 模式：把源语言(默认 E)的文本复制为指定目标语言（prefix 指定对象范围）
 *  2. set 模式：直接指定 [{name, text}] 写入指定语言的描述+标签
 */
import { z } from "zod";
export declare const fixDdicTextTool: {
    name: string;
    write: boolean;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        mode: z.ZodEnum<{
            set: "set";
            copy: "copy";
        }>;
        targetLanguage: z.ZodString;
        sourceLanguage: z.ZodOptional<z.ZodString>;
        prefix: z.ZodOptional<z.ZodString>;
        texts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            text: z.ZodString;
        }, z.core.$strip>>>;
        types: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            data_element: "data_element";
            domain: "domain";
        }>>>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        mode: string;
        targetLanguage: string;
        sourceLanguage?: string;
        prefix?: string;
        texts?: Array<{
            name: string;
            text: string;
        }>;
        types?: Array<"data_element" | "domain">;
        connectionId?: string;
    }): Promise<string>;
};
