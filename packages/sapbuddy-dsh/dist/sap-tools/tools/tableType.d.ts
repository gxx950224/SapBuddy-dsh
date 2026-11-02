export declare const TTYP_CONTENT_TYPE = "application/vnd.sap.adt.tabletype.v1+xml";
export declare const TTYP_NAMESPACE = "http://www.sap.com/dictionary/tabletype";
export declare const TTYP_ROW_KINDS: readonly ["dictionaryType", "predefinedAbapType", "refToDictionaryType", "refToClassOrInterfaceType"];
export declare const TTYP_ACCESS_TYPES: readonly ["standard", "sorted", "hashed"];
export declare const TTYP_KEY_DEFINITIONS: readonly ["standard", "rowType", "keyComponents", "empty"];
export declare const TTYP_KEY_KINDS: readonly ["nonUnique", "unique"];
export type TtypRowKind = (typeof TTYP_ROW_KINDS)[number];
export type TtypAccessType = (typeof TTYP_ACCESS_TYPES)[number];
export type TtypKeyDefinition = (typeof TTYP_KEY_DEFINITIONS)[number];
export type TtypKeyKind = (typeof TTYP_KEY_KINDS)[number];
export interface TableTypeDefinition {
    rowType: string;
    rowTypeKind?: TtypRowKind;
    /** 内置类型长度（C/N/X/P 等需要） */
    length?: number;
    decimals?: number;
    accessType?: TtypAccessType;
    keyDefinition?: TtypKeyDefinition;
    keyKind?: TtypKeyKind;
    keyComponents?: string[];
}
export interface NormalizedTableTypeDefinition {
    rowType: string;
    rowTypeKind: TtypRowKind;
    length: number;
    decimals: number;
    accessType: TtypAccessType;
    keyDefinition: TtypKeyDefinition;
    keyKind: TtypKeyKind;
    keyComponents: string[];
}
/** 内置 ABAP 类型（仅用于 rowTypeKind 自动判断，显式 rowTypeKind 以调用方为准） */
export declare const TTYP_BUILTIN_ROW_TYPES: Set<string>;
/** 校验并规范化表类型定义；有错误时返回 { errors } */
export declare function normalizeTableTypeDefinition(def: TableTypeDefinition): {
    ok: true;
    value: NormalizedTableTypeDefinition;
} | {
    ok: false;
    errors: string[];
};
export declare function buildRowTypeXml(d: NormalizedTableTypeDefinition): string;
export declare function buildPrimaryKeyXml(d: NormalizedTableTypeDefinition): string;
/** 完整 <ttyp:tableType> 文档（GET 读回失败时的兜底 / 单测用） */
export declare function buildTableTypeXml(meta: {
    name: string;
    description: string;
    packageName: string;
    language?: string;
    responsible?: string;
}, d: NormalizedTableTypeDefinition): string;
/** 在服务器读回的 XML 上替换行类型/访问类别/主键，其余（元数据、二级键、atom 链接）原样保留；去掉只读的 valueHelps */
export declare function applyTableTypeDefinition(currentXml: string, d: NormalizedTableTypeDefinition): string;
type TtypClient = {
    stateful: unknown;
    httpClient: {
        request: (url: string, cfg: Record<string, unknown>) => Promise<{
            body: string;
        }>;
    };
    lock: (url: string) => Promise<{
        LOCK_HANDLE: string;
        CORRNR?: string;
        IS_LOCAL?: string;
    }>;
    unLock: (url: string, handle: string) => Promise<unknown>;
};
export declare function tableTypeUrl(name: string): string;
/** lock → GET 当前定义 → 合并 → PUT → unlock（不激活） */
export declare function writeTableTypeDefinition(client: TtypClient, name: string, d: NormalizedTableTypeDefinition, transport?: string): Promise<string>;
/**
 * 创建表类型壳：POST /sap/bc/adt/ddic/tabletypes（工作区 abap-adt-api 8.4.x 的 createObject 未登记 TTYP/DA，
 * 这里直接按 ADT 协议发送完整 <ttyp:tableType>；服务器可能只落默认 CHAR 壳，随后 writeTableTypeDefinition 再 PUT 定义）
 */
export declare function createTableTypeObject(client: {
    httpClient: TtypClient["httpClient"];
}, meta: {
    name: string;
    description: string;
    packageName: string;
    language?: string;
    responsible?: string;
}, d: NormalizedTableTypeDefinition, transport?: string): Promise<string>;
export {};
