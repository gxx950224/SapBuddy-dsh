# AGENTS.md — sapbuddy-dsh 项目指南（面向 AI 编码代理与贡献者）

> 原始版（pi 时代，面向 SapBuddy 原仓库）已归档 `docs/original-prompts/AGENTS.md`；
> 本文件为 DSH 底座版的适配版，描述本仓库架构与安全规则的**代码位置映射**。
> 随 sapbuddy preset 每次会话注入上下文，保证 AI 编码代理遵循同一套强控规则。

## 项目简介

SapBuddy × DeepSeek Harness：SAP ABAP AI 全能助手，面向开发顾问与业务顾问。
以 **DSH（Cordis 工具插件 + agent preset）** 为运行时，41 个 SAP 工具 + 技能 + 写门禁
以 `sapbuddy-dsh` 插件形态嵌入 DSH；Web GUI（选 preset）+ headless 单次问答双模式。

## 核心架构

```
packages/sapbuddy-dsh/          # 41 个 SAP 工具插件（纯 TS，zod schema + execute）
  ├── src/index.ts                # 入口：首次运行 seed → ctx.tools.register（41 工具）+ 写门禁 + 提示词注入
  ├── src/sap-tools/
  │    ├── tools/*.ts             # 工具实现（按主题分组，tools/index.ts 汇总注册）
  │    ├── adtManager.ts          # SAP 连接池（basic/OAuth2）+ assertDevClient 开发客户端守卫
  │    ├── config.ts              # 连接配置加载 + resolveReadOnly（连接级只读唯一出处）
  │    ├── sapbuddy-home.ts       # 配置根解析 + ensureSapbuddyHome（首次运行 seed-if-absent）
  │    ├── connections-store.ts   # 连接配置存储（导出 ./store，设置页复用）
  │    ├── code-policy.ts         # 代码规则扫描（scanCodeIssues / validateSourceMode）
  │    ├── register.ts            # 纯逻辑：授权窗口 / namespaceViolation / isReadOnly
  │    ├── gate.ts                # 写门禁三层（guard → pre-execute ask → 确认词窗口）
  │    ├── auditLog.ts            # 写操作审计
  │    └── prompt-files.ts        # 提示词注入（SYSTEM.md / AGENTS.md / Memory.md）
  ├── skills/                     # 8 个 ABAP 技能（随包分发，preset 经 createRequire 解析）
  ├── defaults/                   # 首次运行 seed 到 preset 目录的默认文件（绝不覆盖已有）
  └── cordis.patch.yml            # dsh.bundle.patch：preset-sapbuddy 行（preset 唯一注册途径）
scripts/install.mjs               # 安装器（校验 dsh.bundle.patch + dsh plugin add）
```

- **注册**：DSH 原生 `ctx.tools.register(defineTool(...))`（index.ts），不依赖任何 MCP 框架；
- **preset 注册**：0.2.0-rc.2 **不扫描** `~/.dsh/.agent-presets/`。preset 是 `cordis.patch.yml`
  里的一条 `@deepseek-ai/dsh-agent-preset` 行，靠 `package.json` 的 `dsh.bundle.patch` 生效。
  没有 `dsh.bundle` 的包会被 `dsh plugin add` 装成普通依赖，配置一行都不生效。
- **提示词注入**：`prompt-files.ts` 把配置根里的 `prompts/SYSTEM.md`、`AGENTS.md`、
  `prompts/Memory.md` 注册为 systemPrompt section，**每次会话组装时实时读取文件**，
  Memory.md 即改即生效（避坑沉淀随会话累积）。这些文件由 `ensureSapbuddyHome()` 在插件
  加载时从包内 `defaults/` **仅补缺**落盘——覆盖会抹掉用户的 Memory.md 与自定义提示词。

## 安全拦截层（★ 代码级强制，不依赖 LLM 自觉）

```
写工具调用
   │
   ├─ ① gate.ts guard（同步硬规则，所有工具）
   │    ├─ wikiWriteViolation     → mcp__abap_wiki__ 写工具一律硬拦截（知识库只读）
   │    ├─ configPathViolation    → 敏感配置目录/文件名禁止 AI 读写（output/skills/prompts/uploads 子树除外）
   │    ├─ 只读模式               → 连接级 readOnly 优先、顶层兜底（resolveReadOnly）
   │    ├─ 连接变更               → 连接配置被改后必须先 get_connected_systems
   │    └─ namespaceViolation     → 只写 Z*/Y*（函数组内部程序按所属函数组判断）
   │
   ├─ ② tools/pre-execute ask 门 → 写工具且窗口未开 → {kind:'ask'}（Web 审批浮层，fail-closed）
   │
   ├─ ③ agent/inbox/claimed      → 用户确认词/拒绝词 → 授权窗口（headless/CLI 回退）
   │
   └─ ④ index.ts execute 路径（每个写工具，纵深防御）
        ├─ isConnectionDirty      → 连接变更强制重确认
        ├─ scanCodeIssues     → 自建结构字段裸内置类型仅提示
        └─ assertDevClient        → 非开发客户端（T000.CCCATEGORY 非 C）拒绝写
```

**规则唯一出处**：gate.ts / register.ts / index.ts；设置页（sapbuddy-dsh）与 preset 只做挂载，不重复实现 → 行为一致。

## 开发命令

```bash
pnpm install            # 安装依赖
pnpm -r build           # 编译三个包（tsc/esbuild → dist/，build 前清空 dist）
pnpm -r test            # sapbuddy-dsh：172 用例（门禁/转换器/插件加载/连接存储）
node scripts/install.mjs --profile desktop --from-source  # link: 装到本地 profile
node scripts/install.mjs --profile desktop --dry-run      # 预览命令
```

## 代码规范

- 工具代码（TS）：严格模式、NodeNext、无分号、双引号（见 tsconfig.json）
- 新增 SAP 工具：在 `packages/sapbuddy-dsh/src/sap-tools/tools/` 新建文件，导出
  `{ name, title, description, inputSchema(zod), execute() }`，并在 `tools/index.ts` 注册；
  写操作必须标记 `write: true`
- 工具遵循"读优先、写需显式授权"；提示词/技能文件改动遵守 `docs/original-prompts/` 归档口径

### 强制规则 → 代码位置映射

| 规则 | 位置 | 层 |
|---|---|---|
| 写工具名单 / 授权窗口 / 只读模式 / 命名空间 | `register.ts`（isWriteTool/handleUserMessage/isReadOnly/namespaceViolation）+ `gate.ts` decideWriteApproval | 硬强制 |
| 写操作拦截（确认/知识库只读/配置保护） | `gate.ts` installWriteGate（guard + pre-execute + inbox） | 硬强制 |
| abap_wiki 知识库写工具拦截（`mcp__abap_wiki__*`，一律硬拦、不可放行） | `gate.ts` wikiWriteViolation | 硬强制 |
| 敏感配置禁止 AI 读写（connections/auth/settings/models；bash 命令含敏感路径/文件名也拦；preset 目录 output/skills/sessions/prompts/uploads 子树除外） | `gate.ts` configPathViolation | 硬强制 |
| 代码规则扫描（自建表结构字段裸内置类型仅提示；程序内局部变量放行） | `code-policy.ts` scanCodeIssues + `index.ts` execute | 裸类型非阻断；中文按规范建议处理 |
| 开发客户端守卫（T000 类别） | `adtManager.ts` assertDevClient + `index.ts` execute | 硬强制 |
| 创建：包名/描述必填、$TMP 提示、requestText 建请求 | `tools/writeTools.ts` create_object_programmatically | 硬强制 |
| 修改：自动沿用/创建请求、请求描述格式 | `tools/writeTools.ts` replace_string_in_abap_object | 硬强制 |
| 传输请求：状态码中文、底表 E070/E071、只读放行 | `tools/transportText.ts` manage_transport_requests | 硬强制 |
| 创建/修改流程、避坑记录（Memory.md）、请求描述格式（行为层） | 配置根 `prompts/SYSTEM.md` 铁律 6b / 输出约定 | 提示层（AI 执行，工具已兜底） |

## 安全

- `connections.json`（SAP 凭据）不入库、不提交；由设置页或用户写入 `~/.dsh/.agent-presets/sapbuddy/`
- **默认只读**：只读判定为**连接级优先、顶层兜底**（`resolveReadOnly`）——连接声明 `security.readOnly`
  则以它为准，未声明则继承顶层 `security.readOnly`，两者都缺失即为只读（fail-closed）。
  连接级判定不会被"不传 connectionId"绕过：省略时按 active → 第一个 解析生效连接。
- 写操作另有双层保护：**人工确认**（拦截 → 用户批准/输入"确认"放行）+ **开发客户端守卫**（非 C 类拒绝）
- MCP 服务器配置由用户在 DSH 内置 dsh-mcp-client 管理（profile patch），仓库不提供程序化写配置

## 提交

- 提交前 `pnpm -r build` 确保编译通过；`pnpm -r test` 全绿
- 不提交：`node_modules/`、`dist/`、`connections.json`、`.DS_Store`、`output/`、日志
- 提交信息简洁中文或英文均可
