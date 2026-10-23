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
import { isWriteTool, isWriteApproved, handleUserMessage, isReadOnly, namespaceViolation, approvalWindowMs, setWriteApprovalWindow } from "./register.js";
import { isConnectionDirty } from "./adtManager.js";
import { sapbuddyHome, sapbuddyPath } from "./sapbuddy-home.js";
/** 敏感配置文件清单（禁止 AI 读写；位置无关）。MCP 配置由 DSH 内置 dsh-mcp-client 管理（profile patch），不在本目录保护范围内。 */
const PROTECTED_CONFIG = ["connections.json", "auth.json", "settings.json", "models.json", "models-store.json"];
const READ_TOOLS = new Set(["read", "glob", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["write", "edit"]);
/** 配置目录内允许 AI 触碰的子树 */
const ALLOWED_SUBTREES = ["output", "skills", "sessions", "prompts", "uploads"];
function norm(s) {
    return String(s ?? "").toLowerCase().replace(/\\/g, "/");
}
/**
 * 配置目录保护（移植自 pi 版 installWriteGate 的敏感配置拦截）：
 * - bash 命令：涉及配置目录/敏感文件名的命令拦截（仅放行打开产物、读上传文件，且禁穿越/禁敏感文件名）
 * - 读工具（read/glob/grep/find/ls）：path 落在配置目录（output/skills/sessions/prompts/uploads 子树除外）拦截
 * - 写工具（write/edit）：敏感配置文件名任意位置拦截
 * 返回拒绝原因；undefined = 放行。
 */
export function configPathViolation(name, input) {
    const o = (input ?? {});
    const p = String(o.path ?? o.file ?? o.filePath ?? o.pattern ?? "");
    const lower = norm(p);
    const home = norm(sapbuddyHome()).replace(/\/+$/, "");
    const inHome = home.length > 0 && lower.includes(home);
    const refsProtected = PROTECTED_CONFIG.some((f) => lower.includes(f));
    if (name === "bash") {
        const cmd = norm(String(o.command ?? ""));
        if (!cmd.includes(home) && !PROTECTED_CONFIG.some((f) => cmd.includes(f)))
            return undefined;
        // bash 的敏感文件名检查作用于 command（path 字段为空）
        const cmdRefsProtected = PROTECTED_CONFIG.some((f) => cmd.includes(f));
        // 白名单：打开产物（start/explorer/open + <home>/output/）或读上传文件（<home>/uploads/ 子树）
        const isOpenArtifact = /^(start|explorer|open)(\s|$)/.test(cmd) && cmd.includes(`${home}/output/`);
        let uploadsOnly = cmd.includes(home);
        if (uploadsOnly) {
            let idx = cmd.indexOf(home);
            while (idx >= 0) {
                const tail = cmd.slice(idx + home.length).replace(/^[/\\]+/, "");
                if (!/^uploads([/\\]|[\s;&|]|$)/.test(tail)) {
                    uploadsOnly = false;
                    break;
                }
                idx = cmd.indexOf(home, idx + 1);
            }
        }
        const traversal = cmd.includes("..");
        const allowed = (isOpenArtifact || uploadsOnly) && !traversal && !cmdRefsProtected;
        if (!allowed) {
            return `⛔ 命令行操作被安全拦截（涉及敏感配置）：${String(o.command ?? "").slice(0, 120)}\n安全配置（连接凭据 / API 密钥 / 模型配置）仅限你本人手动查看配置目录。`;
        }
        return undefined;
    }
    // 目录级拦截：path 落在配置目录（白名单子树除外）
    if (READ_TOOLS.has(name) && inHome) {
        const rest = lower.slice(lower.indexOf(home) + home.length).replace(/^[/\\]+/, "");
        const allowed = ALLOWED_SUBTREES.some((s) => rest === s || rest.startsWith(s + "/"));
        if (!allowed) {
            return `⛔ 配置目录禁止由 AI 读取（已拦截）：${p}\n安全配置（连接凭据 / API 密钥 / 模型配置）仅限你本人手动查看配置目录。`;
        }
    }
    // 文件名级拦截（覆盖任何位置的配置副本）
    if (refsProtected) {
        if (READ_TOOLS.has(name)) {
            return `⛔ 敏感配置文件禁止由 AI 读取（已拦截）：${p}\n安全配置（连接凭据 / API 密钥 / 模型配置）仅限你本人手动查看配置目录。`;
        }
        if (WRITE_TOOLS.has(name)) {
            return `⛔ 配置文件禁止由 AI 直接修改（已拦截，未写入）：${p}\n安全配置（连接凭据 / API 密钥 / 只读开关 / 模型配置）只能由你在配置目录手动编辑，改完重启服务生效。`;
        }
    }
    return undefined;
}
/** 纯决策函数：硬规则优先 → 授权窗口 → ask */
export function decideWriteApproval(input) {
    if (input.readOnly) {
        return {
            kind: "deny",
            reason: `⛔ 只读模式，写操作被拒绝。\n` +
                `该连接未声明 security.readOnly=false（连接级优先，未声明则继承 connections.json 顶层的 readOnly）。\n` +
                `放行方式：在 ${sapbuddyPath("connections.json")} 中为该连接加 "security": { "readOnly": false }；` +
                `如需对该连接之外全部放行，改顶层 "security": { "readOnly": false }。\n` +
                `注意：放行后仍受开发客户端守卫（T000.CCCATEGORY）与人工确认约束。`,
        };
    }
    if (input.connectionDirty && input.toolName !== "get_connected_systems") {
        return { kind: "deny", reason: "⛔ SAP 连接配置已变更，必须先调用 get_connected_systems 确认当前连接，然后再重试本操作。" };
    }
    const ns = namespaceViolation(input.args);
    if (ns)
        return { kind: "deny", reason: `⛔ ${ns}` };
    if (input.windowApproved)
        return { kind: "allow" };
    return { kind: "ask", reason: "写操作需要人工确认：请回复“确认/批准”开启授权窗口，或在审批提示中批准本次操作。" };
}
/**
 * abap_wiki 知识库只读门禁：mcp__abap_wiki__ 写类工具（append/create/update/patch/delete/rename 等）
 * 一律直接拦截，不可人工确认放行（知识库只读）；其他 MCP 服务器（如 mcp__sap_mcp_dev__*）不受影响。
 * 工具命名遵循 DSH 的 mcp__<server>__<tool> 双下划线规范。
 */
const WIKI_WRITE_RE = /^mcp__abap_wiki__(append|create|update|patch|delete|rename|write|edit|move|remove|set)(_|$)/i;
export function wikiWriteViolation(name) {
    if (WIKI_WRITE_RE.test(name)) {
        return `⛔ 知识库为只读参考，已直接拦截（未执行）：${name}\n禁止向 abap_wiki 知识库做任何写入（创建/修改/删除笔记均不允许）。\n如需新增或修改知识库分析，请提示用户手动在 Obsidian 中编辑，不要再次尝试写入。`;
    }
    return undefined;
}
/** 从 UserMessage.content 提取文本（ContentBlock[] 中取 text 块） */
export function extractUserText(message) {
    const blocks = message?.content;
    if (!Array.isArray(blocks))
        return "";
    return blocks
        .filter((b) => Boolean(b && b.type === "text"))
        .map((b) => b.text)
        .join("\n");
}
/**
 * 写工具的目标连接 ID（仅取 connectionId 参数）。
 *
 * 必须把它透传给 isReadOnly：连接级只读就是以连接为粒度声明的，
 * 不透传会让「不传 connectionId」变成绕过连接级锁定的后门——未传时
 * isReadOnly 自行解析生效连接，而不是无脑回落到全局开关。
 */
function writeConnectionId(args) {
    const value = args?.connectionId;
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
const defaultDeps = {
    isReadOnly,
    isConnectionDirty,
    isWriteApproved,
    approvalWindowMs,
    setWriteApprovalWindow,
    handleUserMessage,
};
/**
 * 安装写门禁三层结构。
 * @param ctx 插件上下文（preset 作用域；需要 get/on/effect）
 * @param deps 可选依赖注入（测试用）
 * @returns 全部 disposer（由调用方统一挂到 ctx.effect）
 */
export function installWriteGate(ctx, deps = {}) {
    const d = { ...defaultDeps, ...deps };
    const disposers = [];
    const tools = ctx.get("tools");
    // 1) 同步单调硬规则 guard（配置保护对所有工具生效；写门禁仅对写工具）
    if (tools?.guard) {
        disposers.push(tools.guard((exec) => {
            // abap_wiki 知识库只读：对 MCP 写工具（含非 sapbuddy 工具）直接硬拦截
            const wv = wikiWriteViolation(exec.name);
            if (wv)
                return wv;
            const cv = configPathViolation(exec.name, exec.arguments);
            if (cv)
                return cv;
            if (!isWriteTool(exec.name, exec.arguments))
                return undefined;
            const decision = decideWriteApproval({
                toolName: exec.name,
                args: exec.arguments,
                readOnly: d.isReadOnly(writeConnectionId(exec.arguments)),
                connectionDirty: d.isConnectionDirty(),
                windowApproved: d.isWriteApproved(),
            });
            return decision.kind === "deny" ? decision.reason : undefined;
        }));
    }
    // 2) pre-execute ask 门：写工具 && 窗口未开 && 非硬拒绝 → ask（GUI 审批）
    disposers.push(ctx.on("tools/pre-execute", async (exec, next) => {
        if (!isWriteTool(exec.name, exec.arguments))
            return next();
        const decision = decideWriteApproval({
            toolName: exec.name,
            args: exec.arguments,
            readOnly: d.isReadOnly(writeConnectionId(exec.arguments)),
            connectionDirty: d.isConnectionDirty(),
            windowApproved: d.isWriteApproved(),
        });
        if (decision.kind === "ask")
            return { kind: "ask", reason: decision.reason };
        return next();
    }));
    // approval/asked、approval/decided 是日志记录；运行时审批通过 waterfall 返回结果。
    disposers.push(ctx.on("approval/request", async (request, next) => {
        const outcome = await next();
        if (isWriteTool(request.toolName) && outcome === "allowed-once")
            d.setWriteApprovalWindow(d.approvalWindowMs());
        return outcome;
    }));
    // 3) 用户消息 → 确认词/拒绝词 → 授权窗口（headless/CLI 回退）
    disposers.push(ctx.on("agent/inbox/claimed", (payload) => {
        d.handleUserMessage(extractUserText(payload?.message));
    }));
    return disposers;
}
