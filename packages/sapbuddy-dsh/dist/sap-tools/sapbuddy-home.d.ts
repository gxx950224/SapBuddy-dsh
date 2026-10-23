export declare function sapbuddyHome(): string;
/** 拼接配置根下的子路径 */
export declare function sapbuddyPath(...segs: string[]): string;
/**
 * 首次运行的目录与默认文件落盘（**仅补缺，绝不覆盖**）。
 *
 * seed-if-absent 是这里唯一安全的语义：`prompts/Memory.md` 是随会话累积的避坑记录，
 * 覆盖它会抹掉用户数据；用户改过的 SYSTEM.md / AGENTS.md 同理。
 *
 * **不创建 `connections.json`**：设置页的连接存储能处理文件缺失（`readRaw` 返回空集），
 * 而预置一份带占位主机/密码的文件只会让用户去连一个不存在的主机。让用户在
 * 「设置 → SAP 连接」里新建，或参照落盘的 `connections.example.json` 手工创建。
 *
 * @returns 本次实际落盘的文件（配置根内的相对路径，便于调用方记录与测试断言）
 */
export declare function ensureSapbuddyHome(): string[];
