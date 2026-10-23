export interface ConnectionConfig {
    /** 连接 ID，工具调用时用 connectionId 指定，如 "dev" */
    id: string;
    /** 显示名称（如"开发"/"测试"/"正式"），未配置时回退用 id */
    name?: string;
    /** 是否为当前启用（默认）连接：工具省略 connectionId 时用它；无标记则用第一个 */
    active?: boolean;
    /** SAP 系统地址，如 https://sap-dev.example.com:443 */
    url: string;
    /** SAP 客户端，如 100 */
    client: string;
    username: string;
    password: string;
    /** 登录语言，默认 EN */
    language?: string;
    /** 认证方式：basic | oauth（oauth 需配置 oauth 段） */
    authMethod?: "basic" | "oauth";
    /** OAuth2 client credentials（用于 S/4HANA OAuth 场景） */
    oauth?: {
        tokenUrl: string;
        clientId: string;
        clientSecret: string;
        scope?: string;
    };
    ssl?: {
        /** 允许自签名证书（内网 SAP 常用），默认 false */
        allowSelfSigned?: boolean;
        /** 自定义 CA 证书路径 */
        customCA?: string;
    };
    /**
     * 安全策略
     * requireDevClient: 默认 true——仅允许在开发类客户端上写操作；设为 false 可显式放行（不推荐）
     * developmentCategories: 视为开发机的 T000.CCCATEGORY 列表，默认 ["C"]（SAP 角色：C=定制/客户开发）
     *   P=生产、T=测试、C=定制(开发)、D=演示、E=培训/教育、S=SAP参考
     * readOnly: 连接级只读开关，**优先于顶层 security.readOnly**。
     *   显式 false = 放行本连接的写操作（仍受 requireDevClient 与人工确认约束）；
     *   显式 true = 锁死本连接，即使顶层已放开；省略 = 继承顶层开关。
     */
    security?: {
        requireDevClient?: boolean;
        developmentCategories?: string[];
        readOnly?: boolean;
    };
    description?: string;
}
export interface ServerSecurity {
    /** HTTP 模式下校验 Bearer token（企业网关场景建议启用） */
    apiKey?: string;
    /**
     * 顶层只读默认值：为 true 时拒绝写工具调用（企业治理推荐默认开启）
     * 连接可用自身 security.readOnly 覆盖它。
     */
    readOnly?: boolean;
}
export interface ServerConfig {
    connections: ConnectionConfig[];
    security?: ServerSecurity;
}
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
export declare function resolveReadOnly(connection: {
    security?: {
        readOnly?: boolean;
    };
} | undefined, globalReadOnly: boolean | undefined): boolean;
export declare function loadConfig(): ServerConfig;
/** 测试钩子：注入连接配置，避免测试依赖真实 connections.json（CI 无配置文件） */
export declare function __setConfigForTest(cfg: ServerConfig | null): void;
export declare function getConfig(): ServerConfig;
export declare function reloadConfig(): ServerConfig;
/** 当前启用（默认）连接 ID：显式 active=true 的连接；没有则用第一个。无连接时抛错。 */
export declare function activeConnectionId(): string;
