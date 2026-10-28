/**
 * ADT 客户端池：按连接 ID 懒创建 ADTClient，复用连接，统一错误处理
 * 认证：basic（用户名/密码）| oauth（S/4HANA OAuth client credentials）
 */
import { ADTClient } from "abap-adt-api";
import { ConnectionConfig } from "./config.js";
/** 独占执行（写）：同一连接 id 上的操作排他，同时阻止该连接的并发读。 */
export declare function withConnMutex<T>(connId: string, fn: () => Promise<T>): Promise<T>;
/** 并发执行（读）：同连接最多 READ_CONCURRENCY 个同时进行；写锁内调用直接放行。 */
export declare function withReadLock<T>(connId: string, fn: () => Promise<T>): Promise<T>;
/** 全连接独占执行：同时持有所有已配置连接的写锁，运行期间任何连接的读/写都被阻塞。
 *  用于 get_connected_systems —— 连接切换后必须单独执行，其他请求不能与它并行。
 *  注意：按 id 字典序加锁避免 ABBA 死锁；顺序逐个获取，中途失败释放已持有的锁。 */
export declare function withAllConnMutex<T>(fn: () => Promise<T>): Promise<T>;
/**
 * 标记连接为不健康：从池中移除缓存（客户端 + 类别），下次调用自动重新 login。
 * 会话自愈的核心——连接级故障（401/5xx/网络错误）不保留坏会话，宁可重连。
 */
export declare function markConnectionUnhealthy(connId: string): void;
/** 判断是否连接级故障（会话失效/网络断了/CSRF 令牌失效），而非业务错误 */
export declare function isConnectionError(err: unknown): boolean;
/** 是否 CSRF 令牌校验失败（SDK 的 AdtCsrfException 是裸 Error，没有 status，需单独识别） */
export declare function isCsrfError(err: unknown): boolean;
/** 写序列前确保会话新鲜：残留 stateful 压回 stateless，会话超过 maxAgeMs 未确认可用就重新 login */
export declare function ensureFreshSession(connId: string, maxAgeMs?: number): Promise<ADTClient>;
/** 连接配置变更后立刻作废所有池化会话（同步、不联网），下次调用重新登录 */
export declare function resetClients(): void;
/** 写操作统一入口：独占锁 + 会话保鲜 + CSRF/会话失效时自动重建一次 */
export declare function runWriteWithRecovery<T>(connId: string, run: () => Promise<T>): Promise<T>;
/**
 * 获取客户端类别（T000.CCCATEGORY），按连接缓存
 * 查询失败时抛出（fail-closed）
 */
export declare function getClientCategory(connId: string): Promise<string>;
/** T000.CCCATEGORY 官方角色标签 */
export declare const CLIENT_CATEGORY_LABELS: Record<string, string>;
/**
 * 写操作安全守卫：只允许在开发类客户端上修改代码。
 * SAP 官方角色中仅 C（定制/客户开发）允许开发；
 * 测试（T）/生产（P）/演示（D）/培训（E）/SAP参考（S）一律拦截。
 * 默认 developmentCategories=["C"]，可用连接配置调整。
 * 无法确认类别时 fail-closed（拒绝）。
 * 连接配置 security.requireDevClient=false 可显式放行（不推荐）。
 */
export declare function assertDevClient(connId: string): Promise<void>;
/** 测试专用：注入假客户端工厂（仅单测验证错误路径用，生产勿调） */
export declare function __setClientFactoryForTest(fn: ((conf: ConnectionConfig) => ADTClient) | null): void;
/** 测试专用：伪造连接会话"最近确认可用"的时间戳（验证会话保鲜窗口，生产勿调） */
export declare function __setSessionFreshAtForTest(connId: string, timestamp: number): void;
export declare function getConnection(id: string): ConnectionConfig;
/** 获取（并懒初始化）ADTClient，自动 login */
export declare function getClient(connId: string): Promise<ADTClient>;
/** 释放指定连接（用于测试/连接重置） */
export declare function dropClient(connId: string): Promise<void>;
/** 释放所有连接 */
export declare function dropAllClients(): Promise<void>;
/** 连接配置已变更：强制下一次先 get_connected_systems 再允许其他 SAP 工具 */
export declare function markConnectionDirty(): void;
/** get_connected_systems 成功执行后清除 */
export declare function clearConnectionDirty(): void;
export declare function isConnectionDirty(): boolean;
export declare function connectedIds(): string[];
