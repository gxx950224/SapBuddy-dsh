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
import { z } from "zod"

/** JSON Schema 节点（转换器需要的最小视图） */
interface JsNode {
  type?: string
  description?: string
  enum?: unknown[]
  const?: unknown
  items?: JsNode
  properties?: Record<string, JsNode>
  required?: string[]
  additionalProperties?: boolean
  oneOf?: JsNode[]
  anyOf?: JsNode[]
}

/** DSH ParameterSchemaSpec 兼容形状（与 @deepseek-ai/dsh-tools 结构兼容） */
export interface SpecAnnotation {
  description?: string
  title?: string
}
export type SpecNode =
  | (SpecAnnotation & { type: "string"; enum?: readonly string[]; const?: string })
  | (SpecAnnotation & { type: "number"; enum?: readonly number[]; const?: number })
  | (SpecAnnotation & { type: "integer"; enum?: readonly number[]; const?: number })
  | (SpecAnnotation & { type: "boolean"; enum?: readonly boolean[]; const?: boolean })
  | (SpecAnnotation & { type: "null" })
  | (SpecAnnotation & { type: "array"; items?: SpecNode })
  | (SpecAnnotation & { type: "object"; properties?: Record<string, SpecNode & { required?: true }>; additionalProperties: boolean })
  | (SpecAnnotation & { type: "json" })
  | (SpecAnnotation & { type: "oneOf"; oneOf: readonly [SpecNode, SpecNode, ...SpecNode[]] })

/** 工具参数规格：对象属性表，必填以属性上的 `required?: true` 标注 */
export type ParameterSpec = Record<string, SpecNode & { required?: true }>

/** 单值节点转 DSH spec；isRequired 决定是否在对象属性上打 required 标记 */
function convertValue(node: JsNode | undefined, isRequired: boolean, path: string): SpecNode & { required?: true } {
  const annotation: SpecAnnotation = {}
  if (typeof node?.description === "string") annotation.description = node.description
  if (node === undefined) return { ...annotation, type: "json", ...(isRequired ? { required: true as const } : {}) }

  // 枚举值推断类型（zod enum 可能只给 enum 不给 type）
  const inferEnumType = (values: unknown[]): string | undefined => {
    if (values.length === 0) return undefined
    const all = (t: string) => values.every((v) => typeof v === t)
    if (all("string")) return "string"
    if (all("number")) return "number"
    if (all("boolean")) return "boolean"
    return undefined
  }

  // oneOf/anyOf：≥2 分支 → oneOf；单分支（如 nullable 包装）→ 展开；含 null → 取非 null 分支
  const unions = node.oneOf ?? node.anyOf
  if (unions !== undefined && unions.length > 0) {
    const nonNull = unions.filter((u) => u.type !== "null")
    const effective = nonNull.length >= 2 ? { oneOf: nonNull } : { ...nonNull[0] }
    const required = isRequired ? { required: true as const } : {}
    if (nonNull.length >= 2) {
      const branches = nonNull.map((b) => convertValue(b, false, `${path}[]`))
      return { ...annotation, type: "oneOf", oneOf: branches as [SpecNode, SpecNode, ...SpecNode[]], ...required }
    }
    return convertValue(effective as JsNode, isRequired, path)
  }

  const required = isRequired ? { required: true as const } : {}
  switch (node.type) {
    case "string": {
      const out: SpecNode & { required?: true } = { ...annotation, type: "string", ...required }
      if (Array.isArray(node.enum) && node.enum.every((v) => typeof v === "string")) out.enum = node.enum as string[]
      if (typeof node.const === "string") out.const = node.const
      return out
    }
    case "number": {
      const out: SpecNode & { required?: true } = { ...annotation, type: "number", ...required }
      if (Array.isArray(node.enum) && node.enum.every((v) => typeof v === "number")) out.enum = node.enum as number[]
      if (typeof node.const === "number") out.const = node.const
      return out
    }
    case "integer": {
      const out: SpecNode & { required?: true } = { ...annotation, type: "integer", ...required }
      if (Array.isArray(node.enum) && node.enum.every((v) => typeof v === "number")) out.enum = node.enum as number[]
      if (typeof node.const === "number") out.const = node.const
      return out
    }
    case "boolean": {
      const out: SpecNode & { required?: true } = { ...annotation, type: "boolean", ...required }
      if (Array.isArray(node.enum) && node.enum.every((v) => typeof v === "boolean")) out.enum = node.enum as boolean[]
      if (typeof node.const === "boolean") out.const = node.const
      return out
    }
    case "null":
      return { ...annotation, type: "null", ...required }
    case "array":
      return { ...annotation, type: "array", ...(node.items ? { items: convertValue(node.items, false, `${path}[]`) } : {}), ...required }
    case "object": {
      const props: Record<string, SpecNode & { required?: true }> = {}
      const requiredSet = new Set(node.required ?? [])
      for (const [key, sub] of Object.entries(node.properties ?? {})) {
        props[key] = convertValue(sub, requiredSet.has(key), `${path}.${key}`)
      }
      return {
        ...annotation,
        type: "object",
        properties: props,
        additionalProperties: node.additionalProperties ?? true,
        ...required,
      }
    }
    default: {
      // enum 只有值没有 type → 推断类型
      if (Array.isArray(node.enum)) {
        const t = inferEnumType(node.enum)
        if (t === "string" || t === "number" || t === "boolean") {
          return convertValue({ ...node, type: t }, isRequired, path)
        }
      }
      return { ...annotation, type: "json", ...required }
    }
  }
}

/**
 * 把工具根 zod object 转成 DSH 参数规格。
 * 根必须是 z.object；非 object 根抛错（工具声明均为 object，抛错即编程错误）。
 */
export function zodToParameterSpec(schema: z.ZodType): ParameterSpec {
  const json = z.toJSONSchema(schema) as JsNode
  if (json.type !== "object" || json.properties === undefined) {
    throw new Error(`zodToParameterSpec: 根 schema 必须是 z.object（实际: ${json.type ?? "未知"}）`)
  }
  const requiredSet = new Set(json.required ?? [])
  const out: ParameterSpec = {}
  for (const [key, sub] of Object.entries(json.properties)) {
    out[key] = convertValue(sub, requiredSet.has(key), key)
  }
  return out
}
