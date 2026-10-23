/** 工具：按名称模式搜索 ABAP 对象（对应 abap_fs 的 search_abap_objects） */
import { z } from "zod";
export declare const searchObjectsTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        pattern: z.ZodString;
        connectionId: z.ZodOptional<z.ZodString>;
        types: z.ZodOptional<z.ZodArray<z.ZodString>>;
        maxResults: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    execute(args: {
        pattern: string;
        connectionId?: string;
        types?: string[];
        maxResults?: number;
    }): Promise<string>;
};
