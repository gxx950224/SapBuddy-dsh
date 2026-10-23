/**
 * SapBuddy 配置根目录（自包含解析）+ 首次运行落盘
 *
 * 所有配置（connections.json / settings.json / logs / output / uploads）
 * 统一收口到 DSH 的 agent preset 目录，随 preset 一起分发、一起升级，不再散落
 * 在 ~/.SapBuddy 多处。（MCP 服务器配置由 DSH 内置 dsh-mcp-client 在 profile patch
 * 管理，不在本目录内。）
 *
 * 解析顺序：
 *   1. SAPBUDDY_HOME 环境变量（显式指定，如便携部署）
 *   2. 默认 <$DSH_HOME|~/.dsh>/.agent-presets/sapbuddy
 *
 * 旧版 ~/.SapBuddy 仅由安装器（scripts/install.mjs）做一次性迁移，工具层不再读写。
 */
import os from "node:os";
import path from "node:path";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function sapbuddyHome() {
    if (process.env.SAPBUDDY_HOME)
        return process.env.SAPBUDDY_HOME;
    const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
    return path.join(dshHome, ".agent-presets", "sapbuddy");
}
/** 拼接配置根下的子路径 */
export function sapbuddyPath(...segs) {
    return path.join(sapbuddyHome(), ...segs);
}
/**
 * 随包分发的默认文件（`dist/sap-tools/` 往上两级即包根）。
 *
 * 提示词必须随包走：npm 用户的主目录里没有 preset 目录，而 `prompt-files.ts`
 * 只从 `sapbuddyHome()` 读取——不落盘就等于整套铁律静默缺失，且没有任何报错。
 */
const DEFAULTS_DIR = fileURLToPath(new URL("../../defaults/", import.meta.url));
/** 产物/日志/上传目录，缺失时工具写入会失败 */
const RUNTIME_DIRS = ["", "prompts", "logs", "output", "uploads"];
/** 需要落盘的默认文件：包内相对路径 → 配置根内相对路径 */
const SEED_FILES = [
    ["prompts/SYSTEM.md", "prompts/SYSTEM.md"],
    ["prompts/Memory.md", "prompts/Memory.md"],
    ["AGENTS.md", "AGENTS.md"],
    // 示例文件仅作参考，放到用户一眼能看到的位置
    ["connections.example.json", "connections.example.json"],
    ["settings.example.json", "settings.example.json"],
];
/**
 * 首次运行的目录与默认文件落盘（**仅补缺，绝不覆盖**）。
 *
 * seed-if-absent 是这里唯一安全的语义：`prompts/Memory.md` 是随会话累积的避坑记录，
 * 覆盖它会抹掉用户数据；用户改过的 SYSTEM.md / AGENTS.md 同理。
 *
 * **不创建 `connections.json`**：设置页的连接存储能处理文件缺失（`readRaw` 返回空集），
 * 而预置一份带占位主机/密码的文件只会让用户去连一个不存在的主机。让用户在
 * 「设置 → SAP 连接」里新建，或参照落盘的 `connections.example.json` 手工创建。
 *
 * @returns 本次实际落盘的文件（配置根内的相对路径，便于调用方记录与测试断言）
 */
export function ensureSapbuddyHome() {
    const home = sapbuddyHome();
    for (const dir of RUNTIME_DIRS)
        mkdirSync(path.join(home, dir), { recursive: true });
    const written = [];
    for (const [from, to] of SEED_FILES) {
        const src = path.join(DEFAULTS_DIR, from);
        const dst = path.join(home, to);
        if (existsSync(dst) || !existsSync(src))
            continue;
        copyFileSync(src, dst);
        written.push(to);
    }
    return written;
}
