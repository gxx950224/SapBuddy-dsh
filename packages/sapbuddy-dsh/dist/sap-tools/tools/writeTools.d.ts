/** 工具组：对象管理/写操作（create_object_programmatically、abap_activate、replace_string_in_abap_object、get_abap_diagnostics、create_test_include） */
import { z } from "zod";
export type SaveVerifyResult = {
    ok: boolean;
    normalized?: boolean;
};
/**
 * 写入自检核对：保存后读回 vs 本次写入内容。
 * 服务器会把读回内容规范化（DDIC DSL 注解形式/字段大小写/空行，真机实测：结构 DSL 写入后读回被归一化），
 * 精确字符串比对会误报失败。三层核对：
 *   ① 精确包含；
 *   ② 空白归一化包含；
 *   ③ 关键内容回退：新内容里相对旧内容"新增"的标识符多数在读回里出现（写入成功即命中；失败读回仍是旧内容则缺失）。
 */
export declare function verifySavedContent(newContent: string, oldContent: string, readBack: string): SaveVerifyResult;
export declare const createObjectTool: {
    name: string;
    title: string;
    description: string;
    write: boolean;
    inputSchema: z.ZodObject<{
        objectType: z.ZodEnum<{
            "FUGR/FF": "FUGR/FF";
            "FUGR/I": "FUGR/I";
            "FUGR/F": "FUGR/F";
            "CLAS/OC": "CLAS/OC";
            "INTF/OI": "INTF/OI";
            "PROG/P": "PROG/P";
            "PROG/I": "PROG/I";
            "DDLS/DF": "DDLS/DF";
            "DDLX/EX": "DDLX/EX";
            "DDLA/ADF": "DDLA/ADF";
            "SRVD/SRV": "SRVD/SRV";
            "SRVB/SVB": "SRVB/SVB";
            "TABL/DT": "TABL/DT";
            "TABL/DS": "TABL/DS";
            "DTEL/DE": "DTEL/DE";
            "DOMA/DD": "DOMA/DD";
            "MSAG/N": "MSAG/N";
            "DEVC/K": "DEVC/K";
            AUTH: "AUTH";
            "SUSO/B": "SUSO/B";
        }>;
        name: z.ZodString;
        description: z.ZodString;
        packageName: z.ZodString;
        requestText: z.ZodOptional<z.ZodString>;
        requestNumber: z.ZodOptional<z.ZodString>;
        parentName: z.ZodOptional<z.ZodString>;
        domainName: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectType: string;
        name: string;
        description: string;
        packageName: string;
        requestText?: string;
        requestNumber?: string;
        parentName?: string;
        domainName?: string;
        connectionId?: string;
    }): Promise<string>;
};
/** 从主程序源码枚举 INCLUDE 语句名。行尾可带注释（"INCLUDE XXX.   "说明"），句点后即结束匹配 */
export declare function parseIncludeNames(source: string): string[];
export declare const activateTool: {
    name: string;
    title: string;
    description: string;
    write: boolean;
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
export declare const replaceStringTool: {
    name: string;
    title: string;
    description: string;
    write: boolean;
    inputSchema: z.ZodObject<{
        fileUri: z.ZodString;
        oldString: z.ZodOptional<z.ZodString>;
        newString: z.ZodOptional<z.ZodString>;
        fullSource: z.ZodOptional<z.ZodString>;
        requestText: z.ZodOptional<z.ZodString>;
        requestNumber: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        fileUri: string;
        oldString?: string;
        newString?: string;
        fullSource?: string;
        requestText?: string;
        requestNumber?: string;
        connectionId?: string;
    }): Promise<string>;
};
export declare const diagnosticsTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        fileUri: z.ZodString;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        fileUri: string;
        connectionId?: string;
    }): Promise<string>;
};
export declare const createTestIncludeTool: {
    name: string;
    title: string;
    description: string;
    write: boolean;
    inputSchema: z.ZodObject<{
        className: z.ZodString;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        className: string;
        connectionId?: string;
    }): Promise<string>;
};
export declare const updateDescriptionTool: {
    name: string;
    title: string;
    description: string;
    write: boolean;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        description: z.ZodString;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        description: string;
        connectionId?: string;
    }): Promise<string>;
};
