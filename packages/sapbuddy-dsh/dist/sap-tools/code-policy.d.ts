/** 局部替换与完整覆盖互斥，空 newString 可用于删除文本。 */
export declare function validateSourceMode(args: {
    fullSource?: unknown;
    oldString?: unknown;
    newString?: unknown;
}): void;
/**
 * 扫描 ABAP 代码：硬编码中文文案是阻断项；结构/表字段的裸内置类型只提示。
 * 程序内局部变量/临时量（DATA、方法参数、函数接口等）不需要提示。
 */
export declare function scanCodeIssues(code: string): {
    violations: string[];
    warnings: string[];
};
/** 兼容已有调用者：只返回会阻断写入的规则。 */
export declare function scanCodeViolations(code: string): string[];
