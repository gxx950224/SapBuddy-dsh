/**
 * 消息类(SE91/T100)按语言翻译工具
 *
 * 背景：SAP ADT 写接口无法写入非原始语言的翻译文本（同 DDIC 文本的限制）。
 * 消息类每条消息的短文本存在表 T100（ARBGB=消息类, MSGNR=消息号, SPRSL=语言键, TEXT=短文本, 最长 72 字符）。
 * 本工具生成可执行类在 SAP 内直接 INSERT/MODIFY T100，支持任意目标语言：
 *  - copy 模式：把源语言消息文本复制为指定目标语言（messageClass 可带 % 通配批量）
 *  - set 模式：按 [{msgNumber, text}] 直接写入指定语言的翻译文本
 * 写入后自检：重读目标语言行核对文本，对不上报错回滚，不假装成功。
 */
import { z } from "zod";
/** 消息号归一化：1~3 位数字补零为 3 位（SE91 消息号 000~999），非法返回 null */
export declare const normalizeMsgNumber: (n: string) => string | null;
/** 消息类名校验：ARBGB 最长 20 字符，大写字母/数字/下划线；copy 模式允许 % _ 通配 */
export declare const isValidMsgClass: (n: string, wildcard?: boolean) => boolean;
/** 生成可执行类源码 */
export declare function generateClassSource(className: string, mode: "copy" | "set", opts: {
    messageClass: string;
    srcLang?: string;
    tgtLang: string;
    texts?: Array<{
        msgNumber: string;
        text: string;
    }>;
}): string;
export declare const translateMessageClassTool: {
    name: string;
    write: boolean;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        messageClass: z.ZodString;
        mode: z.ZodEnum<{
            set: "set";
            copy: "copy";
        }>;
        targetLanguage: z.ZodString;
        sourceLanguage: z.ZodOptional<z.ZodString>;
        messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
            msgNumber: z.ZodString;
            text: z.ZodString;
        }, z.core.$strip>>>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        messageClass: string;
        mode: string;
        targetLanguage: string;
        sourceLanguage?: string;
        messages?: Array<{
            msgNumber: string;
            text: string;
        }>;
        connectionId?: string;
    }): Promise<string>;
};
