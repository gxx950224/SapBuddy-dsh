/** 工具组：传输请求与文本元素（manage_transport_requests、manage_text_elements） */
import { z } from "zod";
export declare const transportTool: {
    name: string;
    title: string;
    write: boolean;
    description: string;
    inputSchema: z.ZodObject<{
        action: z.ZodEnum<{
            list_user_transports: "list_user_transports";
            get_transport_details: "get_transport_details";
            get_object_transport: "get_object_transport";
            update_description: "update_description";
            release: "release";
        }>;
        transportNumber: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        userName: z.ZodOptional<z.ZodString>;
        objectName: z.ZodOptional<z.ZodString>;
        objectType: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        action: string;
        transportNumber?: string;
        description?: string;
        userName?: string;
        objectName?: string;
        objectType?: string;
        connectionId?: string;
    }): Promise<string>;
};
export declare const textElementsTool: {
    name: string;
    write: boolean;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        action: z.ZodEnum<{
            read: "read";
            update: "update";
        }>;
        objectName: z.ZodString;
        objectType: z.ZodString;
        category: z.ZodOptional<z.ZodEnum<{
            symbols: "symbols";
            selections: "selections";
            headings: "headings";
        }>>;
        elements: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            text: z.ZodString;
        }, z.core.$strip>>>;
        transportNumber: z.ZodOptional<z.ZodString>;
        allowChinese: z.ZodOptional<z.ZodBoolean>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        action: string;
        objectName: string;
        objectType: string;
        category?: string;
        elements?: Array<{
            id: string;
            text: string;
        }>;
        transportNumber?: string;
        allowChinese?: boolean;
        connectionId?: string;
    }): Promise<string>;
};
