/**
 * sapbuddy-tools —— DeepSeek Harness 工具插件入口（DSH 底座版）
 *
 * 把 41 个 SAP 工具（tools/index.ts，zod schema + execute）注册进 DSH 工具注册表
 * （ctx.tools），替代原 pi 版 registerSapTools。阶段 3 在此追加写门禁
 * （ctx.tools.guard + tools/pre-execute ask 门）。
 */
import { defineTool } from "@deepseek-ai/dsh-tools"
import { tools, type ToolDef } from "./sap-tools/tools/index.js"
import { zodToParameterSpec } from "./sap-tools/zod-to-spec.js"

/** 写工具清单（供阶段3门禁与工具列表使用；与 pi 版 WRITE_TOOL_NAMES 同源） */
export function writeToolNames(): Set<string> {
  return new Set(tools.filter((t) => t.write).map((t) => t.name))
}

/** 工具列表（名称 + 是否写操作；供 CLI/安装器展示） */
export function listToolNames(): Array<{ name: string; write: boolean }> {
  return tools.map((t) => ({ name: t.name, write: Boolean(t.write) }))
}

function registerOne(registry: { register: (def: unknown) => () => void }, t: ToolDef): (() => void) | null {
  try {
    const parameters = zodToParameterSpec(t.inputSchema)
    const disp = registry.register(
      defineTool({
        name: t.name,
        description: t.description,
        parameters,
        output: {
          schema: { type: "string" },
          render(_args: unknown, value: unknown) {
            return [{ type: "text", text: String(value ?? "") }]
          },
        },
        async execute(args: Record<string, unknown>) {
          return String(await t.execute(args))
        },
      }),
    )
    return disp
  } catch (e) {
    // 单工具注册失败不阻塞其余 40 个；错误信息进入宿主日志
    // eslint-disable-next-line no-console
    console.error(`[sapbuddy-tools] 注册工具 ${t.name} 失败: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

export function apply(ctx: { get: (name: string) => unknown; effect: (fn: () => () => void) => void }): void {
  const registry = ctx.get("tools")
  if (registry === undefined) return // tools 注册表未挂载（如 headless 前的组合缺口），跳过
  const disposers: Array<() => void> = []
  for (const t of tools) {
    const disp = registerOne(registry as { register: (def: unknown) => () => void }, t)
    if (disp) disposers.push(disp)
  }
  // eslint-disable-next-line no-console
  console.log(`[sapbuddy-tools] 已注册 ${disposers.length} 个 SAP 工具`)
  ctx.effect(() => () => {
    for (const d of disposers) {
      try { d() } catch { /* 卸载失败不影响其余 */ }
    }
  })
}

const plugin = {
  name: "sapbuddy-tools",
  apply,
}

export default plugin
