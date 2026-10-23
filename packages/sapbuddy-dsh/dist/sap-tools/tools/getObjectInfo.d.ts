/** 工具：获取对象元数据/结构信息（对应 abap_fs 的 get_abap_object_info） */
import { z } from "zod";
export declare const getObjectInfoTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
        includeStructure: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        connectionId?: string;
        includeStructure?: boolean;
    }): Promise<string>;
};
