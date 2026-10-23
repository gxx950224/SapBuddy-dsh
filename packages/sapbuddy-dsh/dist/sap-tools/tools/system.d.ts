/** 工具组：系统信息与扩展（get_sap_system_info、adt_discovery_export、abap_fs_documentation、调试工具降级） */
import { z } from "zod";
export declare const sapSystemInfoTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        connectionId?: string;
    }): Promise<string>;
};
export declare const adtDiscoveryTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        connectionId: z.ZodOptional<z.ZodString>;
        maxResults: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    execute(args: {
        connectionId?: string;
        maxResults?: number;
    }): Promise<string>;
};
export declare const documentationTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        topic: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        topic?: string;
    }): Promise<string>;
};
