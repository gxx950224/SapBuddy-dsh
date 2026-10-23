/** 工具：直接读取表内容（read_table_contents）——不用写 SQL，跟 SE16 查表一样，只读 */
import { z } from "zod";
export declare const readTableContentsTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        tableName: z.ZodString;
        filter: z.ZodOptional<z.ZodString>;
        rowLimit: z.ZodOptional<z.ZodNumber>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        tableName: string;
        filter?: string;
        rowLimit?: number;
        connectionId?: string;
    }): Promise<string>;
};
