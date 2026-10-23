export interface AuditEntry {
    ts: string;
    event: "write_request" | "blocked" | "approved" | "executed" | "failed";
    tool: string;
    objects: string[];
    connectionId?: string;
    reason?: string;
}
type AuditInput = Omit<AuditEntry, "ts">;
/** 追加一条审计记录（ts 由内部补当前时间戳；best-effort：写失败不抛、不阻塞调用方） */
export declare function appendAudit(entry: AuditInput): void;
export {};
