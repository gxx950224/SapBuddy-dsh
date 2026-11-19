/** 工具组：运行时分析（analyze_abap_dumps、analyze_abap_traces、get_version_history） */
import { z } from "zod";
export declare const dumpAnalysisTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        action: z.ZodEnum<{
            list_dumps: "list_dumps";
            analyze_dump: "analyze_dump";
        }>;
        dumpId: z.ZodOptional<z.ZodString>;
        maxResults: z.ZodOptional<z.ZodNumber>;
        user: z.ZodOptional<z.ZodString>;
        date: z.ZodOptional<z.ZodString>;
        fromTime: z.ZodOptional<z.ZodString>;
        toTime: z.ZodOptional<z.ZodString>;
        from: z.ZodOptional<z.ZodString>;
        to: z.ZodOptional<z.ZodString>;
        hoursBack: z.ZodOptional<z.ZodNumber>;
        sapTimeZoneOffset: z.ZodOptional<z.ZodString>;
        timeoutMs: z.ZodOptional<z.ZodNumber>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        action: string;
        dumpId?: string;
        maxResults?: number;
        user?: string;
        date?: string;
        fromTime?: string;
        toTime?: string;
        from?: string;
        to?: string;
        hoursBack?: number;
        sapTimeZoneOffset?: string;
        timeoutMs?: number;
        connectionId?: string;
    }): Promise<string>;
};
export declare const traceAnalysisTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        action: z.ZodEnum<{
            list_traces: "list_traces";
            analyze_trace: "analyze_trace";
            statements: "statements";
            db_access: "db_access";
            delete_trace: "delete_trace";
        }>;
        traceId: z.ZodOptional<z.ZodString>;
        maxResults: z.ZodOptional<z.ZodNumber>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        action: string;
        traceId?: string;
        maxResults?: number;
        connectionId?: string;
    }): Promise<string>;
};
export declare const versionHistoryTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        action: z.ZodEnum<{
            list_versions: "list_versions";
            get_version_source: "get_version_source";
            compare_versions: "compare_versions";
        }>;
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        versionNumber: z.ZodOptional<z.ZodNumber>;
        version1: z.ZodOptional<z.ZodNumber>;
        version2: z.ZodOptional<z.ZodNumber>;
        maxResults: z.ZodOptional<z.ZodNumber>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        action: string;
        objectName: string;
        objectType?: string;
        versionNumber?: number;
        version1?: number;
        version2?: number;
        maxResults?: number;
        connectionId?: string;
    }): Promise<string>;
};
