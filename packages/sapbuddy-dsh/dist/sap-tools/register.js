/**
 * 写门禁纯逻辑（DSH 底座版）：自 pi 版 register.ts 移植的全部纯函数
 * （授权窗口 / namespaceViolation / scanCodeViolations / 对象名提取），
 * 不依赖 pi 运行时。pi 耦合的 installWriteGate / registerSapTools 已移除——
 * 写门禁由 gate.ts（ctx.tools.guard + tools/pre-execute + inbox 确认词）承担，
 * 工具注册由 index.ts（ctx.tools.register）承担。
 *
 * 代码级强制规则（不依赖 LLM 遵守，写工具内容写入前硬校验）：
 * 1. 开发客户端守卫：非开发类客户端拒绝一切写操作（assertDevClient，见 index.ts execute 路径）
 * 2. 源码规则提示：自建结构/表字段的裸内置类型仅提示，不阻断写入
 * 3. 中文文案由消息类/文本元素作为维护建议，不在工具层硬拦截
 */
import { readFileSync } from "node:fs";
import { sapbuddyPath } from "./sapbuddy-home.js";
import { resolveReadOnly } from "./config.js";
import { tools } from "./tools/index.js";
import { resetActiveRequests } from "./taskTransport.js";
// ── 写操作人工确认（human-in-the-loop）──
// 所有写工具执行前必须获得用户确认：Web 审批浮层（tools/pre-execute ask）或
// 对话确认词开启授权窗口（agent/inbox/claimed）。批准后有一个时间窗口
// （默认 15 分钟，可配置 approvalWindowMinutes），窗口内放行全部写操作，
// 让 AI 一轮内连续完成多个写操作（create→replace→activate）无需逐次确认。
let writeApprovalUntil = 0;
const WRITE_TOOL_NAMES = new Set(tools.filter((t) => t.write).map((t) => t.name));
/** `manage_transport_requests` 中只读、不应触发审批的 action */
const READ_ONLY_TRANSPORT_ACTIONS = new Set([
    "list_user_transports",
    "get_transport_details",
    "get_object_transport",
]);
/** 写工具判定。`input` 可选：传入本次调用的参数后，只读的 action
 * （如 `manage_text_elements` 的 read、`manage_transport_requests` 的查询类 action）
 * 不再被当成写工具，避免纯读操作触发审批浮层。 */
export function isWriteTool(name, input) {
    if (!WRITE_TOOL_NAMES.has(name))
        return false;
    if (input !== undefined && typeof input === "object" && input !== null) {
        const action = input.action;
        if (action === "read")
            return false;
        if (name === "manage_transport_requests" && typeof action === "string") {
            if (READ_ONLY_TRANSPORT_ACTIONS.has(action))
                return false;
        }
    }
    return true;
}
export function setWriteApprovalWindow(ms = 60_000) {
    writeApprovalUntil = Date.now() + ms;
    // 新需求开始 → 共享传输请求重置，让本需求的对象用新请求（同需求内复用）
    resetActiveRequests();
}
export function isWriteApproved() {
    return Date.now() < writeApprovalUntil;
}
export function clearWriteApproval() {
    writeApprovalUntil = 0;
    // 需求取消/拒绝 → 共享请求一并清掉，避免残留影响下次
    resetActiveRequests();
}
/** 从写工具参数中提取对象名（统一大写；fileUri 取末段并去 /source/main 等子路径后缀）。
 * 除常规对象名外，也收集翻译工具的写目标（messageClass=消息类、prefix=DDIC 文本前缀、texts[].name=逐条对象名），
 * 保证审计日志能记录这类"写表"工具的改动范围。 */
export function extractObjectNames(input) {
    const o = (input ?? {});
    const out = new Set();
    for (const key of ["name", "objectName", "className", "parentName"]) {
        const v = o[key];
        if (typeof v === "string" && v.trim())
            out.add(v.trim().toUpperCase());
    }
    for (const key of ["messageClass", "prefix"]) {
        const v = o[key];
        if (typeof v === "string" && v.trim())
            out.add(v.trim().toUpperCase());
    }
    const texts = o.texts;
    if (Array.isArray(texts)) {
        for (const t of texts) {
            const n = t?.name;
            if (typeof n === "string" && n.trim())
                out.add(n.trim().toUpperCase());
        }
    }
    const uri = String(o.fileUri ?? "");
    if (uri) {
        const seg = uri.split("/").filter(Boolean).pop();
        if (seg)
            out.add(seg.replace(/\.\w+$/, "").toUpperCase());
    }
    return [...out];
}
// ── 用户消息处理（确认词/拒绝词 → 授权窗口；CLI 与 Web 共用同一套规则）──
// 只认句首的明确批准词，且必须由词边界/标点收尾——避免「继续分析这段代码」
// 这类日常消息在句中被误判为批准，从而打开 15 分钟写授权窗口。
const CONFIRM_RE = /^(?:确认|同意|允许|批准|就这么办|执行|继续执行|go ahead)(?=$|[\s，,。.!！:：；;])/i;
const REJECT_RE = /拒绝|不要|取消|算了|不干|停止|换个方案|重新来|推翻|改回|不用了|撤回|不执行|不能执行|先别|暂不|先不做|别急|别继续/i;
/** 授权窗口毫秒数：读配置目录 settings.json 的 approvalWindowMinutes（默认 15 分钟） */
export function approvalWindowMs() {
    try {
        const cfg = JSON.parse(readFileSync(sapbuddyPath("settings.json"), "utf8").toString());
        const m = Number(cfg.approvalWindowMinutes);
        if (m > 0 && Number.isFinite(m))
            return m * 60 * 1000;
    }
    catch { /* 默认 */ }
    return 15 * 60 * 1000;
}
export function handleUserMessage(text) {
    const t = String(text || "").trim();
    if (REJECT_RE.test(t)) {
        clearWriteApproval();
    }
    else if (CONFIRM_RE.test(t)) {
        // 授权窗口时长可配置（settings.approvalWindowMinutes，默认 15 分钟）
        setWriteApprovalWindow(approvalWindowMs());
    }
    // 中性/继续类消息不清除窗口，避免同一需求反复授权
}
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
export function isReadOnly(connectionId) {
    try {
        const cfg = JSON.parse(readFileSync(sapbuddyPath("connections.json"), "utf8").toString());
        const conns = Array.isArray(cfg.connections) ? cfg.connections : [];
        const wanted = connectionId?.toLowerCase();
        const conn = wanted !== undefined && wanted !== ""
            ? conns.find((c) => String(c.id ?? "").toLowerCase() === wanted)
            : conns.find((c) => c.active === true) ?? conns[0];
        return resolveReadOnly(conn, cfg.security?.readOnly);
    }
    catch {
        return true;
    }
}
/** 函数组内部程序是否属于客户命名空间：SAPL<FG>/L<FG><后缀>，所属函数组（FG）为 Z/Y 开头即为客户对象（SE38 可直接编辑） */
function isCustomerFunctionGroupProgram(name) {
    return /^(SAPL|L)[ZY]/i.test(name);
}
/** 从 ADT 对象 URI（/sap/bc/adt/... 或 adt://host/...）提取对象名：
 * 从右往左跳过资源子路径段（source/main/includes/fmodules/subcomponents 等），取第一个名字段。 */
function objectNameFromUri(uri) {
    let path = uri.trim();
    if (/^adt:\/\//i.test(path)) {
        try {
            path = new URL(path).pathname;
        }
        catch {
            return "";
        }
    }
    const segs = path.split("/").filter(Boolean);
    const SKIP = new Set(["source", "main", "includes", "fmodules", "subcomponents", "fragments", "texts", "lines", "methods", "attributes", "events", "types"]);
    while (segs.length && SKIP.has(segs[segs.length - 1].toLowerCase()))
        segs.pop();
    const name = segs.pop();
    return name ? name.toUpperCase() : "";
}
/** 命名空间强制：写操作对象名必须以 Z 或 Y 开头（SAP 标准对象只读不写）。
 * 函数组内部程序（SAPL<FG>/L<FG>*）按所属函数组判断：函数组为 Z/Y 开头时放行。
 * 只检查明确的"对象名"字段（name/objectName/className/parentName），传输请求号等不参与。
 * 返回违规说明；空串 = 通过。 */
export function namespaceViolation(input) {
    const o = (input ?? {});
    for (const key of ["name", "objectName", "className", "parentName"]) {
        const v = o[key];
        if (typeof v !== "string" || !v.trim())
            continue;
        const n = v.trim();
        if (/^[A-Za-z0-9_/-]+$/.test(n) && !/^[ZY]/i.test(n)) {
            // 函数组内部程序（SAPL<FG>/L<FG><后缀>）：所属函数组为 Z*/Y* 即为客户对象，放行
            if (isCustomerFunctionGroupProgram(n))
                continue;
            return `对象名 "${n}" 不是 Z*/Y* 开头（SAP 标准对象只读不写）。请确认对象名，或改用只读工具查询。`;
        }
    }
    // 工具特定写目标：fix_ddic_text 的 prefix（copy 模式批量对象范围）、translate_message_class 的
    // messageClass（消息类，copy 可带 % 通配）——同样限定 Z*/Y*，否则 prefix="%" 可批量改全系统文本、
    // 消息类可写标准类（如 00）。去掉尾部通配符（ZE_% / Z*）后的字面部分必须 Z*/Y* 开头；全通配（%）视为违规。
    for (const key of ["prefix", "messageClass"]) {
        const v = o[key];
        if (typeof v !== "string" || !v.trim())
            continue;
        const n = v.trim();
        const literal = n.replace(/[%*]+$/, "").trim();
        if (!literal || (/^[A-Za-z0-9_/-]+$/.test(literal) && !/^[ZY]/i.test(literal))) {
            return `对象范围 "${n}" 不是 Z*/Y* 开头（SAP 标准对象只读不写）。请确认对象名，或改用只读工具查询。`;
        }
    }
    // fileUri：按文件地址定位对象的写工具（如 replace_string_in_abap_object）只有 URI、没有上面的对象名字段，
    // 从 URI 提取对象名后同样做 Z*/Y* 校验，堵住"改标准对象不被命名空间卡"的口子。
    const fileUri = String(o.fileUri ?? "");
    if (fileUri) {
        const n = objectNameFromUri(fileUri);
        if (n && /^[A-Za-z0-9_/-]+$/.test(n) && !/^[ZY]/i.test(n) && !isCustomerFunctionGroupProgram(n)) {
            return `对象 "${n}"（来自 fileUri ${fileUri.slice(0, 60)}）不是 Z*/Y* 开头（SAP 标准对象只读不写）。请确认对象名，或改用只读工具查询。`;
        }
    }
    return "";
}
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
export function listToolNames() {
    return tools.map((t) => ({ name: t.name, write: !!t.write }));
}
