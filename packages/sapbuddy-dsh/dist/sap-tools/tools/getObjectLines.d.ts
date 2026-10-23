/** 工具：读取 ABAP 对象源码（对应 abap_fs 的 get_abap_object_lines） */
import { z } from "zod";
export declare const getObjectLinesTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
        methodName: z.ZodOptional<z.ZodString>;
        startLine: z.ZodOptional<z.ZodNumber>;
        lineCount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        connectionId?: string;
        methodName?: string;
        startLine?: number;
        lineCount?: number;
    }): Promise<string>;
};
