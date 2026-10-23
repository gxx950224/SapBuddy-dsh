/**
 * 域属性更新工具：修改域的符号(sign)、区分大小写(lowercase)、转换例程、输出长度等
 * 通过 getDomainProperties 读现有属性 → 合并修改 → setDomainProperties → 激活
 */
import { z } from "zod";
export declare const updateDomainTool: {
    name: string;
    write: boolean;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        domainName: z.ZodString;
        sign: z.ZodOptional<z.ZodBoolean>;
        lowercase: z.ZodOptional<z.ZodBoolean>;
        conversionExit: z.ZodOptional<z.ZodString>;
        outputLength: z.ZodOptional<z.ZodNumber>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        domainName: string;
        sign?: boolean;
        lowercase?: boolean;
        conversionExit?: string;
        outputLength?: number;
        connectionId?: string;
    }): Promise<string>;
};
