/** 工具注册表：导出全部 41 个工具（直接作为 pi customTools 注册） */
import { z } from "zod";
export interface ToolDef {
    name: string;
    title: string;
    description: string;
    /** zod schema 实例 */
    inputSchema: z.ZodType;
    execute(args: Record<string, unknown>): Promise<string>;
    /** 写操作标记：只读模式下被拒绝 */
    write?: boolean;
}
export declare const tools: ToolDef[];
