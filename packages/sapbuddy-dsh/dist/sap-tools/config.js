/**
 * 连接配置加载：支持多 SAP 系统、${ENV} 环境变量展开（secret manager 友好）
 *
 * 配置文件示例见 connections.example.json
 * 可通过环境变量 ABAP_MCP_CONFIG 指定配置文件路径（历史命名，兼容保留），
 * 默认读取 preset 配置目录 connections.json（<DSH_HOME|~/.dsh>/.agent-presets/sapbuddy/connections.json）
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { sapbuddyPath } from "./sapbuddy-home.js";
/**
 * 只读判定规则（唯一出处，纯函数、无 IO）：**连接级优先，全局兜底**。
 *
 * - 连接声明了 `security.readOnly` → 以它为准（可单独放行开发系统）
 * - 未声明 → 回落到顶层 `security.readOnly`
 * - 两者都缺失 → 只读（fail-closed）
 *
 * 门禁（register.isReadOnly，读文件保证改配置即刻生效）与展示
 * （connectedSystems）共用本函数，避免两处判断出现分歧。
 */
export function resolveReadOnly(connection, globalReadOnly) {
    const perConnection = connection?.security?.readOnly;
    if (perConnection !== undefined)
        return perConnection !== false;
    return globalReadOnly !== false;
}
/** 展开 ${ENV_VAR} 占位符 */
function expandEnv(value) {
    return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name) => {
        const env = process.env[name];
        if (env === undefined) {
            throw new Error(`环境变量 ${name} 未设置（配置项引用了 ${value}）`);
        }
        return env;
    });
}
function resolveConfigPath() {
    if (process.env.ABAP_MCP_CONFIG)
        return resolve(process.env.ABAP_MCP_CONFIG);
    // 自包含：配置文件位于 DSH preset 目录（~/.dsh/.agent-presets/sapbuddy/）
    const home = resolve(sapbuddyPath("connections.json"));
    if (existsSync(home))
        return home;
    return home; // 缺失时返回该路径，loadConfig 给出明确报错
}
export function loadConfig() {
    const path = resolveConfigPath();
    if (!existsSync(path)) {
        throw new Error(`尚未配置 SAP 连接（未找到 ${path}）。\n` +
            `推荐：在 DSH「设置 → SAP 连接」里新建一个连接（会写入该文件）。\n` +
            `手工方式：参照 ${sapbuddyPath("connections.example.json")} 创建 connections.json，` +
            `或用环境变量 ABAP_MCP_CONFIG 指定其他路径。`);
    }
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (!Array.isArray(raw.connections) || raw.connections.length === 0) {
        throw new Error(`配置文件 ${path} 中没有可用的 SAP 连接。\n` +
            `请在 DSH「设置 → SAP 连接」里新建一个连接（需要 ADT 地址、客户端号、用户名、密码；` +
            `SAP 侧需在 SICF 激活 /sap/bc/adt）。`);
    }
    const connections = raw.connections.map((c) => {
        const id = c.id.toLowerCase();
        return {
            ...c,
            id,
            language: c.language ?? "EN",
            authMethod: c.authMethod ?? "basic",
            username: expandEnv(c.username),
            password: expandEnv(c.password),
            oauth: c.oauth
                ? {
                    ...c.oauth,
                    clientSecret: expandEnv(c.oauth.clientSecret),
                }
                : undefined,
            apiKey: undefined,
        };
    });
    const ids = new Set(connections.map((c) => c.id));
    if (ids.size !== connections.length) {
        throw new Error(`配置文件中有重复的连接 ID: ${[...ids].join(", ")}`);
    }
    return {
        connections,
        security: {
            readOnly: raw.security?.readOnly ?? true,
            apiKey: raw.security?.apiKey !== undefined ? expandEnv(raw.security.apiKey) : undefined,
        },
    };
}
/** 供 tools 获取当前配置（避免每次重新读文件） */
let cached;
let configOverride = null;
/** 测试钩子：注入连接配置，避免测试依赖真实 connections.json（CI 无配置文件） */
export function __setConfigForTest(cfg) {
    configOverride = cfg;
    cached = cfg ?? undefined;
}
export function getConfig() {
    if (configOverride)
        return configOverride;
    if (!cached)
        cached = loadConfig();
    return cached;
}
export function reloadConfig() {
    cached = loadConfig();
    return cached;
}
/** 当前启用（默认）连接 ID：显式 active=true 的连接；没有则用第一个。无连接时抛错。 */
export function activeConnectionId() {
    const conns = getConfig().connections;
    if (conns.length === 0)
        throw new Error("未配置任何 SAP 连接");
    const active = conns.find((c) => c.active === true);
    return active ? active.id : conns[0].id;
}
