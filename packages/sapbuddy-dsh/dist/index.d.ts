/**
 * 注册设置页所需的 webServer 路由。
 *
 * @param ctx 插件上下文；`webServer` 缺失（headless 等）时返回空数组，不报错
 * @returns 卸载函数列表，由调用方并入自己的 disposers
 */
export declare function installSettingsRoutes(ctx: {
    get: (name: string) => unknown;
}): Array<() => void>;
/** 顶层行 `sapbuddy-dsh` 的插件入口（行名必须是裸包名——见文件头说明）。 */
export declare function apply(ctx: {
    inject: (deps: string[], callback: (ctx: any) => void) => unknown;
}): void;
declare const _default: {
    name: string;
    apply: typeof apply;
};
export default _default;
