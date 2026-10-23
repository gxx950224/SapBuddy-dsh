/**
 * 代码导航工具组（只读）：
 * - find_code_definition：定位某个标识符（变量/方法/类/表）的定义处，并回读定义处代码
 * - get_class_hierarchy：查一个类的父类/子类继承结构
 * - get_abap_documentation：查询 ABAP 元素（关键字/类/方法等）的帮助文档
 *
 * ADT 位置型接口（findDefinition/typeHierarchy/abapDocumentation）用的是 1 基的行/列，
 * 且要求把对象当前源码作为请求体一起发给服务器。AI 读完源码后给"行号 + 标识符文字"
 * 即可，工具自己在那一行展开 token 计算起止列，避免 AI 手动数列号。
 */
import { z } from "zod";
export declare const findCodeDefinitionTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        line: z.ZodNumber;
        token: z.ZodOptional<z.ZodString>;
        column: z.ZodOptional<z.ZodNumber>;
        showSource: z.ZodOptional<z.ZodBoolean>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        line: number;
        token?: string;
        column?: number;
        showSource?: boolean;
        connectionId?: string;
    }): Promise<string>;
};
export declare const getClassHierarchyTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        superTypes: z.ZodOptional<z.ZodBoolean>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        superTypes?: boolean;
        connectionId?: string;
    }): Promise<string>;
};
export declare const getAbapDocumentationTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        objectName: z.ZodString;
        objectType: z.ZodOptional<z.ZodString>;
        line: z.ZodNumber;
        token: z.ZodOptional<z.ZodString>;
        column: z.ZodOptional<z.ZodNumber>;
        language: z.ZodOptional<z.ZodString>;
        connectionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    execute(args: {
        objectName: string;
        objectType?: string;
        line: number;
        token?: string;
        column?: number;
        language?: string;
        connectionId?: string;
    }): Promise<string>;
};
