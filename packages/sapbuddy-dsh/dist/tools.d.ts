/** 写工具清单（供门禁与工具列表使用；与 pi 版 WRITE_TOOL_NAMES 同源） */
export declare function writeToolNames(): Set<string>;
/** 工具列表（名称 + 是否写操作；供 CLI/安装器展示） */
export declare function listToolNames(): Array<{
    name: string;
    write: boolean;
}>;
export declare function apply(ctx: {
    get: (name: string) => unknown;
    on: (name: string, listener: (...args: any[]) => unknown) => () => void;
    effect: (fn: () => () => void) => void;
}): void;
declare const plugin: {
    name: string;
    apply: typeof apply;
};
export default plugin;
