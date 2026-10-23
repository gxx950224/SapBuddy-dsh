/**
 * sapbuddy-dsh/tools —— preset 内的插件入口（41 个 SAP 工具 + 写门禁 + 提示词）。
 *
 * 挂在 preset 行 `sapbuddy-dsh/tools` 下，`apply()` 负责该 preset 会话所需的：
 *
 *   1. 首次运行落盘（ensureSapbuddyHome：提示词与示例，仅补缺）
 *   2. 注册 41 个 SAP 工具（tools/index.ts，zod schema + execute）
 *   3. 写门禁（gate.ts：guard + pre-execute ask + 确认词窗口）
 *   4. 提示词注入（prompt-files.ts：SYSTEM.md / AGENTS.md / Memory.md）
 *
 * 为什么走子路径而不是主入口：主入口（`src/index.ts`）必须是顶层的设置页行，
 * 因为 `dsh-client-modules` 只认**精确包名**且只扫描**顶层** entries——承载
 * `dsh.client` 的那一行必须写作裸包名 `sapbuddy-dsh`。若把工具留在主入口，
 * 顶层行与 preset 行会各注册一次工具，提示词注入也会泄漏到所有 preset。
 * preset 内的行不被客户端扫描器看到，所以这里的子路径没有副作用。
 *
 * execute 包装保留 pi 版 registerSapTools 的全部权威校验：
 * 连接变更强制重确认 / 代码级规则扫描 / 开发客户端守卫 + 连接互斥 / 审计日志。
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import { tools } from "./sap-tools/tools/index.js";
import { zodToParameterSpec } from "./sap-tools/zod-to-spec.js";
import { installWriteGate } from "./sap-tools/gate.js";
import { installPromptFiles } from "./sap-tools/prompt-files.js";
import { ensureSapbuddyHome } from "./sap-tools/sapbuddy-home.js";
import { extractObjectNames } from "./sap-tools/register.js";
import { isConnectionDirty, assertDevClient, withConnMutex } from "./sap-tools/adtManager.js";
import { resolveConnectionId } from "./sap-tools/tools/shared.js";
import { appendAudit } from "./sap-tools/auditLog.js";
/** 写工具清单（供门禁与工具列表使用；与 pi 版 WRITE_TOOL_NAMES 同源） */
export function writeToolNames() {
    return new Set(tools.filter((t) => t.write).map((t) => t.name));
}
/** 工具列表（名称 + 是否写操作；供 CLI/安装器展示） */
export function listToolNames() {
    return tools.map((t) => ({ name: t.name, write: Boolean(t.write) }));
}
function registerOne(registry, t) {
    try {
        const parameters = zodToParameterSpec(t.inputSchema);
        const disp = registry.register(defineTool({
            name: t.name,
            description: t.description,
            parameters,
            output: {
                schema: { type: "string" },
                render(_args, value) {
                    return [{ type: "text", text: String(value ?? "") }];
                },
            },
            async execute(args) {
                try {
                    const p = (args ?? {});
                    // 连接变更强制重确认（guard 已前置拦截，此处保留纵深防御）：
                    // 连接配置被修改后，除 get_connected_systems 外一律拒绝，直到确认清标记
                    if (t.name !== "get_connected_systems" && isConnectionDirty()) {
                        return "⛔ SAP 连接配置已变更，必须先调用 get_connected_systems 确认当前连接，然后再重试本操作。";
                    }
                    // 写工具在连接互斥锁内执行（lock→改→存→激活 原子）；读工具直接执行
                    const connId = await resolveConnectionId(p.connectionId);
                    const text = t.write
                        ? await withConnMutex(connId, async () => {
                            // 写操作安全守卫：非开发客户端（T000.CCCATEGORY）拒绝一切代码修改
                            await assertDevClient(connId);
                            return t.execute(p);
                        })
                        : await t.execute(p);
                    // 写操作成功执行 → 记审计（谁/何时/改了哪个对象）
                    if (t.write) {
                        appendAudit({ event: "executed", tool: t.name, objects: extractObjectNames(p), connectionId: connId });
                    }
                    return text;
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (t.write) {
                        appendAudit({
                            event: "failed",
                            tool: t.name,
                            objects: extractObjectNames(args),
                            connectionId: String(args?.connectionId ?? "") || undefined,
                            reason: msg.slice(0, 200),
                        });
                    }
                    return `SAP 工具 ${t.name} 执行失败: ${msg}`;
                }
            },
        }));
        return disp;
    }
    catch (e) {
        // 单工具注册失败不阻塞其余工具；错误信息进入宿主日志
        // eslint-disable-next-line no-console
        console.error(`[sapbuddy-dsh] 注册工具 ${t.name} 失败: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
export function apply(ctx) {
    // 首次运行落盘：npm 安装的用户主目录里没有 preset 目录，而提示词只从那里读取。
    // 必须早于 installPromptFiles——它注册的是"每次会话实时读取"的 section，
    // 但文件不存在时读出来就是空提示词，没有任何报错（静默失效）。
    const seeded = ensureSapbuddyHome();
    const disposers = [];
    // 工具注册 + 写门禁：tools 注册表缺失（组合缺口）时跳过这一段，
    // 但不再整体 return——设置页与提示词注入不依赖它，不该被一起跳过。
    const registry = ctx.get("tools");
    let registeredCount = 0;
    if (registry !== undefined) {
        for (const t of tools) {
            const disp = registerOne(registry, t);
            if (disp) {
                disposers.push(disp);
                registeredCount++;
            }
        }
        // 写门禁三层结构（guard + pre-execute ask + 确认词窗口）
        disposers.push(...installWriteGate(ctx));
    }
    // 额外提示词注入（prompts/SYSTEM.md、AGENTS.md、prompts/Memory.md —— 每次会话实时读取）
    disposers.push(...installPromptFiles(ctx));
    // 设置页的宿主半（webServer 路由）**不在这里**：它挂在顶层行
    // `sapbuddy-dsh/settings` 上（见 settings-api.ts 的说明）——`dsh-client-modules`
    // 只扫描顶层 entries，而本包声明了 `dsh.client`，需要顶层行才能让浏览器半
    // 被登记进 __DSH_BOOT__。本行（preset 内）只负责 preset 会话侧的东西。
    // eslint-disable-next-line no-console
    console.log(`[sapbuddy-dsh] 已注册 ${registeredCount} 个 SAP 工具 + 写门禁 + 提示词注入` +
        (seeded.length > 0 ? `（首次运行已落盘: ${seeded.join(", ")}）` : ""));
    ctx.effect(() => () => {
        for (const d of disposers) {
            try {
                d();
            }
            catch { /* 卸载失败不影响其余 */ }
        }
    });
}
const plugin = {
    name: "sapbuddy-dsh/tools",
    apply,
};
export default plugin;
