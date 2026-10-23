/**
 * 注册三段提示词注入。
 * @param ctx 插件上下文（需要 get 以读取 systemPrompt 服务）
 * @param baseDir 预设目录（默认 sapbuddyHome()；测试可注入临时目录）
 * @returns 全部 disposer（由调用方统一挂 ctx.effect）
 */
export declare function installPromptFiles(ctx: {
    get: (name: string) => unknown;
}, baseDir?: string): Array<() => void>;
