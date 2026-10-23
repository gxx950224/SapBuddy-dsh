/** 写工具判定。`input` 可选：传入本次调用的参数后，只读的 action
 * （如 `manage_text_elements` 的 read、`manage_transport_requests` 的查询类 action）
 * 不再被当成写工具，避免纯读操作触发审批浮层。 */
export declare function isWriteTool(name: string, input?: unknown): boolean;
export declare function setWriteApprovalWindow(ms?: number): void;
export declare function isWriteApproved(): boolean;
export declare function clearWriteApproval(): void;
/** 从写工具参数中提取对象名（统一大写；fileUri 取末段并去 /source/main 等子路径后缀）。
 * 除常规对象名外，也收集翻译工具的写目标（messageClass=消息类、prefix=DDIC 文本前缀、texts[].name=逐条对象名），
 * 保证审计日志能记录这类"写表"工具的改动范围。 */
export declare function extractObjectNames(input: unknown): string[];
export declare function handleUserMessage(text: string): void;
/**
 * 只读模式开关：**连接级优先，全局兜底**（规则见 config.resolveReadOnly）。
 *
 * - 连接自身声明 `security.readOnly` → 以它为准（可单独放行开发系统，或单独锁死生产/QAS）
 * - 未声明 → 回落到 connections.json 顶层 `security.readOnly`
 * - 两者都缺失、或读取/解析失败 → 只读（fail-closed）
 *
 * 这里**每次读文件**（而不是用 config 的缓存），保证用户手工改 connections.json 后
 * 立刻生效；连接级判定也不会被"不传 connectionId"绕过——省略时按
 * active=true → 第一个 的顺序解析生效连接。
 *
 * @param connectionId 目标连接 ID；省略时按生效连接解析
 * @returns true = 只读（拒绝写）
 */
export declare function isReadOnly(connectionId?: string): boolean;
/** 命名空间强制：写操作对象名必须以 Z 或 Y 开头（SAP 标准对象只读不写）。
 * 函数组内部程序（SAPL<FG>/L<FG>*）按所属函数组判断：函数组为 Z/Y 开头时放行。
 * 只检查明确的"对象名"字段（name/objectName/className/parentName），传输请求号等不参与。
 * 返回违规说明；空串 = 通过。 */
export declare function namespaceViolation(input: unknown): string;
/**
 * 扫描 ABAP 代码：硬编码中文文案 + 结构/表定义中的裸内置类型。
 *
 * 实现已上移到 `code-policy.ts`（与上游同源），此处保留同名导出，
 * 供 gate.ts / index.ts 及测试继续按原路径引用。
 * - `scanCodeViolations` 返回阻断项（硬编码中文）
 * - `scanCodeIssues` 返回 `{violations, warnings}`，裸内置类型降级为提示
 */
export { scanCodeViolations, scanCodeIssues, validateSourceMode } from "./code-policy.js";
/** 工具清单（供 CLI/安装器展示） */
export declare function listToolNames(): Array<{
    name: string;
    write: boolean;
}>;

/** Configured approval window in milliseconds; defaults to fifteen minutes. */
export declare function approvalWindowMs(): number;
