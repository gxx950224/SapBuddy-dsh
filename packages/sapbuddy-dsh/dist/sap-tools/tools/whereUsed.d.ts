/** 工具：where-used 引用分析（对应 abap_fs 的 find_where_used） */
import { z } from "zod";
export declare const whereUsedTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
        maxResults: z.ZodOptional<z.ZodNumber>;
        includeSnippets: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        connectionId?: string;
        maxResults?: number;
        includeSnippets?: boolean;
    }): Promise<string>;
};
