/**
 * sapbuddy-tools —— DeepSeek Harness 工具插件入口（DSH 底座版）
 *
 * 把 41 个 SAP 工具（tools/index.ts，zod schema + execute）注册进 DSH 工具注册表
 * （ctx.tools），替代原 pi 版 registerSapTools；并安装写门禁（gate.ts）。
 *
 * execute 包装保留 pi 版 registerSapTools 的全部权威校验：
 * 连接变更强制重确认 / 代码级规则扫描 / 开发客户端守卫 + 连接互斥 / 审计日志。
 */
import { defineTool } from "@deepseek-ai/dsh-tools"
import { tools, type ToolDef } from "./sap-tools/tools/index.js"
import { zodToParameterSpec } from "./sap-tools/zod-to-spec.js"
import { installWriteGate } from "./sap-tools/gate.js"
import { installPromptFiles } from "./sap-tools/prompt-files.js"
import { scanCodeViolations, extractObjectNames } from "./sap-tools/register.js"
import { isConnectionDirty, assertDevClient, runWriteWithRecovery } from "./sap-tools/adtManager.js"
import { resolveConnectionId } from "./sap-tools/tools/shared.js"
import { appendAudit } from "./sap-tools/auditLog.js"

/** 写工具清单（供门禁与工具列表使用；与 pi 版 WRITE_TOOL_NAMES 同源） */
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
          try {
            const p = (args ?? {}) as Record<string, unknown>
            // 连接变更强制重确认（guard 已前置拦截，此处保留纵深防御）：
            // 连接配置被修改后，除 get_connected_systems 外一律拒绝，直到确认清标记
            if (t.name !== "get_connected_systems" && isConnectionDirty()) {
              return "⛔ SAP 连接配置已变更，必须先调用 get_connected_systems 确认当前连接，然后再重试本操作。"
            }
            // 内容级强制规则：写入代码前硬校验（硬编码中文 / 裸内置类型）——纯本地检查，不触连接
            if (t.name === "replace_string_in_abap_object") {
              const code = p.newString ?? p.fullSource
              if (typeof code === "string") {
                const violations = scanCodeViolations(code)
                if (violations.length > 0) {
                  return `⛔ 代码级规则拦截（不依赖 AI 自觉，写前硬校验）：\n${violations.join("\n")}\n\n请修正后重试：硬编码中文 → 消息类/文本元素；自建结构/表字段裸内置类型 → DDIC 数据元素（找不到则创建 Z 元素 + 域）。`
                }
              }
            }
            // 写工具在连接互斥锁内执行（lock→改→存→激活 原子），并在写前刷新会话：
            // 连接切换/空闲过久后池里的 CSRF 令牌已失效，stateful 写不会被 SDK 自动重建，
            // 必须在进入写序列前重登录（见 adtManager.runWriteWithRecovery）。
            const connId = await resolveConnectionId(p.connectionId as string | undefined)
            const text = t.write
              ? await runWriteWithRecovery(connId, async () => {
                  // 写操作安全守卫：非开发客户端（T000.CCCATEGORY）拒绝一切代码修改
                  await assertDevClient(connId)
                  return t.execute(p)
                })
              : await t.execute(p)
            // 写操作成功执行 → 记审计（谁/何时/改了哪个对象）
            if (t.write) {
              appendAudit({ event: "executed", tool: t.name, objects: extractObjectNames(p), connectionId: connId })
            }
            return text
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (t.write) {
              appendAudit({
                event: "failed",
                tool: t.name,
                objects: extractObjectNames(args),
                connectionId: String((args as Record<string, unknown>)?.connectionId ?? "") || undefined,
                reason: msg.slice(0, 200),
              })
            }
            return `SAP 工具 ${t.name} 执行失败: ${msg}`
          }
        },
      }),
    )
    return disp
  } catch (e) {
    // 单工具注册失败不阻塞其余工具；错误信息进入宿主日志
    // eslint-disable-next-line no-console
    console.error(`[sapbuddy-tools] 注册工具 ${t.name} 失败: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

export function apply(ctx: { get: (name: string) => unknown; on: (name: string, listener: (...args: any[]) => unknown) => () => void; effect: (fn: () => () => void) => void }): void {
  const registry = ctx.get("tools")
  if (registry === undefined) return // tools 注册表未挂载（如组合缺口），跳过
  const disposers: Array<() => void> = []
  let registeredCount = 0
  for (const t of tools) {
    const disp = registerOne(registry as { register: (def: unknown) => () => void }, t)
    if (disp) { disposers.push(disp); registeredCount++ }
  }
  // 写门禁三层结构（guard + pre-execute ask + 确认词窗口）
  disposers.push(...installWriteGate(ctx))
  // 额外提示词注入（prompts/SYSTEM.md、AGENTS.md、prompts/Memory.md —— 每次会话实时读取）
  disposers.push(...installPromptFiles(ctx))
  // eslint-disable-next-line no-console
  console.log(`[sapbuddy-tools] 已注册 ${registeredCount} 个 SAP 工具 + 写门禁 + 提示词注入`)
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
