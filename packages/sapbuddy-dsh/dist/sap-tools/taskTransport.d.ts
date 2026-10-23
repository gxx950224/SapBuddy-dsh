/** 取本需求当前共享请求号（可能没有） */
export declare function getActiveRequest(connId: string, devClass: string): string | undefined;
/** 记住本需求共享请求号（用户指定或自动新建后调用） */
export declare function setActiveRequest(connId: string, devClass: string, requestNumber: string): void;
/** 新需求开始（用户批准写操作）或取消（拒绝）时重置 */
export declare function resetActiveRequests(): void;
