/**
 * 写门禁（DSH 版）——替代 pi 版 installWriteGate
 *
 * 三层结构（单一决策源 decideWriteApproval，测试友好）：
 * 1. ctx.tools.guard()：同步单调硬规则（只读 / 连接变更 / 命名空间）——不可被绕过
 * 2. tools/pre-execute：写工具且授权窗口未开、非硬拒绝 → {kind:'ask'}（经 ctx.approval，
 *    Web GUI 原生审批浮层；无审批器时自动降级为拒绝，fail-closed）
 * 3. agent/inbox/claimed：用户消息确认词/拒绝词 → 授权窗口（headless/CLI 回退路径，
 *    与 pi 版 CONFIRM_RE/REJECT_RE 规则一致）
 *
 * 权威校验（开发客户端守卫 assertDevClient、硬编码中文/裸类型扫描、审计）保留在
 * 工具 execute 路径（index.ts），与 pi 版 registerSapTools 包装一致。
 */
import { isWriteTool, isWriteApproved, handleUserMessage, isReadOnly, namespaceViolation } from "./register.js"
import { isConnectionDirty } from "./adtManager.js"

/** 一次写调用的门禁决策 */
export type WriteDecision =
  | { kind: "deny"; reason: string }
  | { kind: "ask"; reason: string }
  | { kind: "allow" }

export interface DecideInput {
  toolName: string
  args: unknown
  readOnly: boolean
  connectionDirty: boolean
  windowApproved: boolean
}

/** 纯决策函数：硬规则优先 → 授权窗口 → ask */
export function decideWriteApproval(input: DecideInput): WriteDecision {
  if (input.readOnly) {
    return { kind: "deny", reason: "⛔ 只读模式（security.readOnly 未显式关闭即生效），写操作被拒绝。如需写入请在 ~/.SapBuddy/connections.json 关闭 readOnly。" }
  }
  if (input.connectionDirty && input.toolName !== "get_connected_systems") {
    return { kind: "deny", reason: "⛔ SAP 连接配置已变更，必须先调用 get_connected_systems 确认当前连接，然后再重试本操作。" }
  }
  const ns = namespaceViolation(input.args)
  if (ns) return { kind: "deny", reason: `⛔ ${ns}` }
  if (input.windowApproved) return { kind: "allow" }
  return { kind: "ask", reason: "写操作需要人工确认：请回复“确认/批准”开启授权窗口，或在审批提示中批准本次操作。" }
}

/** 从 UserMessage.content 提取文本（ContentBlock[] 中取 text 块） */
export function extractUserText(message: { content?: unknown } | undefined): string {
  const blocks = message?.content
  if (!Array.isArray(blocks)) return ""
  return blocks
    .filter((b): b is { type: string; text: string } => Boolean(b && (b as { type?: string }).type === "text"))
    .map((b) => b.text)
    .join("\n")
}

interface ExecLike {
  name: string
  arguments: unknown
}

/** 门禁依赖（可注入，便于测试；默认读真实配置） */
export interface GateDeps {
  isReadOnly: () => boolean
  isConnectionDirty: () => boolean
  isWriteApproved: () => boolean
  handleUserMessage: (text: string) => void
}

const defaultDeps: GateDeps = {
  isReadOnly,
  isConnectionDirty,
  isWriteApproved,
  handleUserMessage,
}

/**
 * 安装写门禁三层结构。
 * @param ctx 插件上下文（preset 作用域；需要 get/on/effect）
 * @param deps 可选依赖注入（测试用）
 * @returns 全部 disposer（由调用方统一挂到 ctx.effect）
 */
export function installWriteGate(
  ctx: {
    get: (name: string) => unknown
    on: (name: string, listener: (...args: any[]) => unknown) => () => void
  },
  deps: Partial<GateDeps> = {},
): Array<() => void> {
  const d: GateDeps = { ...defaultDeps, ...deps }
  const disposers: Array<() => void> = []
  const tools = ctx.get("tools") as { guard?: (fn: (exec: ExecLike) => string | undefined) => () => void } | undefined

  // 1) 同步单调硬规则 guard
  if (tools?.guard) {
    disposers.push(
      tools.guard((exec: ExecLike) => {
        if (!isWriteTool(exec.name)) return undefined
        const decision = decideWriteApproval({
          toolName: exec.name,
          args: exec.arguments,
          readOnly: d.isReadOnly(),
          connectionDirty: d.isConnectionDirty(),
          windowApproved: d.isWriteApproved(),
        })
        return decision.kind === "deny" ? decision.reason : undefined
      }),
    )
  }

  // 2) pre-execute ask 门：写工具 && 窗口未开 && 非硬拒绝 → ask（GUI 审批）
  disposers.push(
    ctx.on("tools/pre-execute", async (exec: ExecLike, next: () => Promise<unknown>) => {
      if (!isWriteTool(exec.name)) return next()
      const decision = decideWriteApproval({
        toolName: exec.name,
        args: exec.arguments,
        readOnly: d.isReadOnly(),
        connectionDirty: d.isConnectionDirty(),
        windowApproved: d.isWriteApproved(),
      })
      if (decision.kind === "ask") return { kind: "ask", reason: decision.reason }
      return next()
    }),
  )

  // 3) 用户消息 → 确认词/拒绝词 → 授权窗口（headless/CLI 回退）
  disposers.push(
    ctx.on("agent/inbox/claimed", (payload: { message?: { content?: unknown } }) => {
      d.handleUserMessage(extractUserText(payload?.message))
    }),
  )

  return disposers
}
