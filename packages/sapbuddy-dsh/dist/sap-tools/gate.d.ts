/**
 * 配置目录保护（移植自 pi 版 installWriteGate 的敏感配置拦截）：
 * - bash 命令：涉及配置目录/敏感文件名的命令拦截（仅放行打开产物、读上传文件，且禁穿越/禁敏感文件名）
 * - 读工具（read/glob/grep/find/ls）：path 落在配置目录（output/skills/sessions/prompts/uploads 子树除外）拦截
 * - 写工具（write/edit）：敏感配置文件名任意位置拦截
 * 返回拒绝原因；undefined = 放行。
 */
export declare function configPathViolation(name: string, input: unknown): string | undefined;
/** 一次写调用的门禁决策 */
export type WriteDecision = {
    kind: "deny";
    reason: string;
} | {
    kind: "ask";
    reason: string;
} | {
    kind: "allow";
};
export interface DecideInput {
    toolName: string;
    args: unknown;
    readOnly: boolean;
    connectionDirty: boolean;
    windowApproved: boolean;
}
/** 纯决策函数：硬规则优先 → 授权窗口 → ask */
export declare function decideWriteApproval(input: DecideInput): WriteDecision;
export declare function wikiWriteViolation(name: string): string | undefined;
/** 从 UserMessage.content 提取文本（ContentBlock[] 中取 text 块） */
export declare function extractUserText(message: {
    content?: unknown;
} | undefined): string;
/** 门禁依赖（可注入，便于测试；默认读真实配置） */
export interface GateDeps {
    /** 只读判定：传 connectionId 时按连接级开关判定，省略则按生效连接 */
    isReadOnly: (connectionId?: string) => boolean;
    isConnectionDirty: () => boolean;
    isWriteApproved: () => boolean;
    handleUserMessage: (text: string) => void;
}
/**
 * 安装写门禁三层结构。
 * @param ctx 插件上下文（preset 作用域；需要 get/on/effect）
 * @param deps 可选依赖注入（测试用）
 * @returns 全部 disposer（由调用方统一挂到 ctx.effect）
 */
export declare function installWriteGate(ctx: {
    get: (name: string) => unknown;
    on: (name: string, listener: (...args: any[]) => unknown) => () => void;
}, deps?: Partial<GateDeps>): Array<() => void>;
