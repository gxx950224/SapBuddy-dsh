/** 工具组：Mermaid 图表（create_mermaid_diagram、validate_mermaid_syntax、get_mermaid_documentation、detect_mermaid_diagram_type） */
import { z } from "zod";
export declare const createMermaidTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        diagramType: z.ZodEnum<{
            sequenceDiagram: "sequenceDiagram";
            flowchart: "flowchart";
            erDiagram: "erDiagram";
            classDiagram: "classDiagram";
        }>;
        title: z.ZodOptional<z.ZodString>;
        nodes: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        edges: z.ZodOptional<z.ZodArray<z.ZodObject<{
            from: z.ZodString;
            to: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        direction: z.ZodOptional<z.ZodEnum<{
            TD: "TD";
            LR: "LR";
            BT: "BT";
            RL: "RL";
        }>>;
    }, z.core.$strip>;
    execute(args: {
        diagramType: string;
        title?: string;
        nodes?: Array<{
            id: string;
            label?: string;
        }>;
        edges?: Array<{
            from: string;
            to: string;
            label?: string;
        }>;
        direction?: string;
    }): Promise<string>;
};
export declare const validateMermaidTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        code: z.ZodString;
    }, z.core.$strip>;
    execute(args: {
        code: string;
    }): Promise<string>;
};
export declare const mermaidDocTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        diagramType: z.ZodOptional<z.ZodEnum<{
            sequenceDiagram: "sequenceDiagram";
            flowchart: "flowchart";
            erDiagram: "erDiagram";
            classDiagram: "classDiagram";
        }>>;
    }, z.core.$strip>;
    execute(args: {
        diagramType?: string;
    }): Promise<string>;
};
export declare const detectMermaidTool: {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<{
        code: z.ZodString;
    }, z.core.$strip>;
    execute(args: {
        code: string;
    }): Promise<string>;
};
