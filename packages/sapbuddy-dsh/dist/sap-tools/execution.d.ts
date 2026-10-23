export interface ToolFailure {
    code: string;
    retryable: boolean;
    message: string;
}
export declare function executionSignal(): AbortSignal | undefined;
export declare function checkCancelled(): void;
/** Only for shared initialization, never for a running write or its lock ownership. */
export declare function waitForReady<T>(ready: Promise<T>): Promise<T>;
export declare function classifyFailure(error: unknown): ToolFailure;
export declare function recordFailure(error: unknown): ToolFailure;
/** One deadline across lock acquisition, login and all requests. Never detach a running write. */
export declare function runToolExecution<T>(signal: AbortSignal | undefined, fn: () => Promise<T>, timeoutMs?: number): Promise<{
    value: Awaited<T>;
    failures: ToolFailure[];
}>;
/** Unlock/logout cleanup has its own short deadline even after the user's cancellation. */
export declare function runCleanup<T>(fn: () => Promise<T>): Promise<T>;
