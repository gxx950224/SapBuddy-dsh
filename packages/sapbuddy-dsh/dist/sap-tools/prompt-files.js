/**
 * 额外提示词注入：把 preset 目录里的原始项目提示词注册为 systemPrompt section，
 * 每次会话组装时**实时读取文件**（Memory.md 即改即生效，避坑沉淀随会话累积）。
 *
 * 注入三段（order 为负，在 persona（0）之前渲染）：
 *   - prompts/SYSTEM.md  → 原始 SYSTEM.md 的 DSH 适配版（身份/铁律/知识库/输出约定）
 *   - AGENTS.md          → 项目开发指南（规则→代码位置映射、开发命令）
 *   - prompts/Memory.md  → 避坑记录（使用过程沉淀，每次会话注入）
 *
 * 文件缺失时返回空文本（不阻塞），适配"preset 未装全"的场景。
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sapbuddyHome } from "./sapbuddy-home.js";
/** 三段提示词：name 唯一（重复注册会抛错）、order 为负（persona 之前）、文件相对 preset 根 */
const PROMPT_FILES = [
    { name: "sapbuddy.prompts.system", order: -90, file: join("prompts", "SYSTEM.md") },
    { name: "sapbuddy.prompts.agents", order: -80, file: "AGENTS.md" },
    { name: "sapbuddy.prompts.memory", order: -70, file: join("prompts", "Memory.md") },
];
function readPresetFile(baseDir, rel) {
    try {
        const p = join(baseDir, rel);
        if (!existsSync(p))
            return "";
        return readFileSync(p, "utf8");
    }
    catch {
        return "";
    }
}
/**
 * 注册三段提示词注入。
 * @param ctx 插件上下文（需要 get 以读取 systemPrompt 服务）
 * @param baseDir 预设目录（默认 sapbuddyHome()；测试可注入临时目录）
 * @returns 全部 disposer（由调用方统一挂 ctx.effect）
 */
export function installPromptFiles(ctx, baseDir = sapbuddyHome()) {
    const sp = ctx.get("systemPrompt");
    if (sp?.section === undefined)
        return [];
    const disposers = [];
    for (const pf of PROMPT_FILES) {
        disposers.push(sp.section({
            name: pf.name,
            order: pf.order,
            text: () => readPresetFile(baseDir, pf.file),
        }));
    }
    return disposers;
}
