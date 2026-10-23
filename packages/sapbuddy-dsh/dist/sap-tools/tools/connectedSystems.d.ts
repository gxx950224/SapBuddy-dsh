/** 工具：列出可用 SAP 连接（相当于 abap_fs 的 get_connected_systems） */
import { z } from "zod";
export declare const connectedSystemsTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{}, z.core.$strip>;
    execute(): Promise<string>;
};
