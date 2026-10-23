/**
 * zod → DSH ParameterSchemaSpec 转换器
 *
 * 把 41 个工具声明用的 zod v4 schema 转换为 DeepSeek Harness 工具注册
 * （@deepseek-ai/dsh-tools 的 defineTool）接受的参数规格。
 *
 * 转换路径：zod v4 `z.toJSONSchema()` → JSON Schema → DSH spec。
 * 覆盖工具实际用到的子集：string/number/integer/boolean/enum/array/嵌套 object/describe。
 * DSH spec 无对应字段的约束（min/max/minLength 等）作为非校验注解安全丢弃；
 * 无法表达的结构退化 `{type:'json'}`（不丢工具，只丢参数提示）。
 */
import { z } from "zod";
/** DSH ParameterSchemaSpec 兼容形状（与 @deepseek-ai/dsh-tools 结构兼容） */
export interface SpecAnnotation {
    description?: string;
    title?: string;
}
export type SpecNode = (SpecAnnotation & {
    type: "string";
    enum?: readonly string[];
    const?: string;
}) | (SpecAnnotation & {
    type: "number";
    enum?: readonly number[];
    const?: number;
}) | (SpecAnnotation & {
    type: "integer";
    enum?: readonly number[];
    const?: number;
}) | (SpecAnnotation & {
    type: "boolean";
    enum?: readonly boolean[];
    const?: boolean;
}) | (SpecAnnotation & {
    type: "null";
}) | (SpecAnnotation & {
    type: "array";
    items?: SpecNode;
}) | (SpecAnnotation & {
    type: "object";
    properties?: Record<string, SpecNode & {
        required?: true;
    }>;
    additionalProperties: boolean;
}) | (SpecAnnotation & {
    type: "json";
}) | (SpecAnnotation & {
    type: "oneOf";
    oneOf: readonly [SpecNode, SpecNode, ...SpecNode[]];
});
/** 工具参数规格：对象属性表，必填以属性上的 `required?: true` 标注 */
export type ParameterSpec = Record<string, SpecNode & {
    required?: true;
}>;
/**
 * 把工具根 zod object 转成 DSH 参数规格。
 * 根必须是 z.object；非 object 根抛错（工具声明均为 object，抛错即编程错误）。
 */
export declare function zodToParameterSpec(schema: z.ZodType): ParameterSpec;
