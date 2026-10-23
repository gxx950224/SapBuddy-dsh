/** 工具组：搜索/导航扩展（search_abap_object_lines、get_batch_lines、get_object_by_uri、get_abap_object_workspace_uri、get_abap_object_url） */
import { z } from "zod";
export declare const searchObjectLinesTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        searchTerm: z.ZodString;
        contextLines: z.ZodOptional<z.ZodNumber>;
        isRegexp: z.ZodOptional<z.ZodBoolean>;
        maxMatches: z.ZodOptional<z.ZodNumber>;
        objectType: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        searchTerm: string;
        contextLines?: number;
        isRegexp?: boolean;
        maxMatches?: number;
        objectType?: string;
        connectionId?: string;
    }): Promise<string>;
};
export declare const getBatchLinesTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        requests: z.ZodArray<z.ZodObject<{
            objectName: z.ZodString;
            objectType: z.ZodOptional<z.ZodString>;
            startLine: z.ZodOptional<z.ZodNumber>;
            lineCount: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        requests: Array<{
            objectName: string;
            objectType?: string;
            startLine?: number;
            lineCount?: number;
        }>;
        connectionId?: string;
    }): Promise<string>;
};
export declare const getObjectByUriTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        uri: z.ZodString;
        startLine: z.ZodOptional<z.ZodNumber>;
        lineCount: z.ZodOptional<z.ZodNumber>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        uri: string;
        startLine?: number;
        lineCount?: number;
        connectionId?: string;
    }): Promise<string>;
};
export declare const getWorkspaceUriTool: {
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
export declare const getObjectUrlTool: {
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
