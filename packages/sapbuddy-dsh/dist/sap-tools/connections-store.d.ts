export interface ConnectionInput {
    id: string;
    name?: string;
    url: string;
    client?: string;
    username: string;
    password?: string;
    language?: string;
    authMethod?: string;
    description?: string;
    ssl?: {
        allowSelfSigned?: boolean;
        customCA?: string;
    };
    security?: {
        requireDevClient?: boolean;
        developmentCategories?: string[];
        readOnly?: boolean;
    };
    active?: boolean;
}
/** 脱敏视图（密码永不出现在响应中） */
export interface ConnectionView extends Omit<ConnectionInput, "password"> {
    hasPassword: boolean;
}
/** 全部连接（脱敏视图） */
export declare function listConnections(): ConnectionView[];
/** 新建或更新连接；更新时密码为空/'***' 保持原密码。返回 {ok} 或 {ok:false,error} */
export declare function saveConnection(input: ConnectionInput): {
    ok: true;
    id: string;
} | {
    ok: false;
    error: string;
};
/** 删除连接；被删的是启用连接时，启用剩余第一个 */
export declare function deleteConnection(id: string): {
    ok: true;
} | {
    ok: false;
    error: string;
};
/** 切换启用连接（其余全部置为非启用） */
export declare function activateConnection(id: string): {
    ok: true;
} | {
    ok: false;
    error: string;
};
/** 读取某连接的完整配置（含明文密码，仅宿主内部/测试连接用，绝不返回给客户端） */
export declare function getConnectionSecret(id: string): ConnectionInput | undefined;
