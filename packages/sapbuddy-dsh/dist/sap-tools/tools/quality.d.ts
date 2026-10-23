/** 工具组：质量/测试/数据（run_unit_tests、run_atc_analysis、execute_data_query、get_abap_sql_syntax） */
import { z } from "zod";
export declare const runUnitTestsTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        connectionId?: string;
    }): Promise<string>;
};
export declare const atcTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
        maxResults: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        connectionId?: string;
        maxResults?: number;
    }): Promise<string>;
};
/** 从 SQL 提取涉及的表名（FROM + JOIN），去重，最多取 2 张，避免重试查询扩大成本 */
export declare function extractTablesFromSql(sql: string): string[];
export declare const dataQueryTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        sqlQuery: z.ZodString;
        limit: z.ZodOptional<z.ZodNumber>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        sqlQuery: string;
        limit?: number;
        connectionId?: string;
    }): Promise<string>;
};
export declare const sqlSyntaxTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{}, z.core.$strip>;
    execute(): Promise<string>;
};
