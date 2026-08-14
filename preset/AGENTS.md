# AGENTS.md — sapbuddy-dsh 项目指南（面向 AI 编码代理与贡献者）

> 原始版（pi 时代，面向 SapBuddy 原仓库）已归档 `docs/original-prompts/AGENTS.md`；
> 本文件为 DSH 底座版的适配版，描述本仓库架构与安全规则的**代码位置映射**。
> 随 sapbuddy preset 每次会话注入上下文，保证 AI 编码代理遵循同一套强控规则。

## 项目简介

SapBuddy × DeepSeek Harness：SAP ABAP AI 全能助手，面向开发顾问与业务顾问。
以 **DSH（Cordis 工具插件 + agent preset）** 为运行时，41 个 SAP 工具 + 技能 + 写门禁
以 `sapbuddy-tools` 插件形态嵌入 DSH；Web GUI（选 preset）+ headless 单次问答双模式。

## 核心架构

```
packages/sapbuddy-tools/          # 41 个 SAP 工具插件（纯 TS，zod schema + execute）
  ├── src/index.ts                # 入口：ctx.tools.register（41 工具）+ 写门禁 + 提示词注入
  └── src/sap-tools/
       ├── tools/*.ts             # 工具实现（按主题分组，tools/index.ts 汇总注册）
       ├── adtManager.ts          # SAP 连接池（basic/OAuth2）+ assertDevClient 开发客户端守卫
       ├── config.ts              # 连接配置加载（sapbuddyPath）
       ├── connections-store.ts   # 连接配置存储（导出 ./store，设置页复用）
       ├── register.ts            # 纯逻辑：授权窗口 / namespaceViolation / scanCodeViolations
       ├── gate.ts                # 写门禁三层（guard → pre-execute ask → 确认词窗口）
       ├── auditLog.ts            # 写操作审计
       └── prompt-files.ts        # 原始提示词注入（SYSTEM.md / AGENTS.md / Memory.md）
preset/                           # sapbuddy agent preset（agent.cordis.yml + skills/ + prompts/）
scripts/install.mjs               # 一键安装器（构建/插件/preset/模型/凭据）
```

- **注册**：DSH 原生 `ctx.tools.register(defineTool(...))`（index.ts），不依赖任何 MCP 框架；
- **提示词注入**：`prompt-files.ts` 把 `preset/prompts/SYSTEM.md`、`preset/AGENTS.md`、
  `preset/prompts/Memory.md` 注册为 systemPrompt section，**每次会话组装时实时读取文件**，
  Memory.md 即改即生效（避坑沉淀随会话累积）。

## 安全拦截层（★ 代码级强制，不依赖 LLM 自觉）

```
写工具调用
   │
   ├─ ① gate.ts guard（同步硬规则，所有工具）
   │    ├─ wikiWriteViolation     → mcp__abap_wiki__ 写工具一律硬拦截（知识库只读）
   │    ├─ configPathViolation    → 敏感配置目录/文件名禁止 AI 读写（output/skills/prompts/uploads 子树除外）
   │    ├─ 只读模式               → connections.json security.readOnly 未显式 false 即拒写
   │    ├─ 连接变更               → 连接配置被改后必须先 get_connected_systems
   │    └─ namespaceViolation     → 只写 Z*/Y*（函数组内部程序按所属函数组判断）
   │
   ├─ ② tools/pre-execute ask 门 → 写工具且窗口未开 → {kind:'ask'}（Web 审批浮层，fail-closed）
   │
   ├─ ③ agent/inbox/claimed      → 用户确认词/拒绝词 → 授权窗口（headless/CLI 回退）
   │
   └─ ④ index.ts execute 路径（每个写工具，纵深防御）
        ├─ isConnectionDirty      → 连接变更强制重确认
        ├─ scanCodeViolations     → 硬编码中文 / 自建结构字段裸内置类型
        └─ assertDevClient        → 非开发客户端（T000.CCCATEGORY 非 C）拒绝写
```

**规则唯一出处**：gate.ts / register.ts / index.ts；设置页（sapbuddy-settings）与 preset 只做挂载，不重复实现 → 行为一致。

## 开发命令

```bash
pnpm install            # 安装依赖
pnpm -r build           # 编译三个包（tsc/esbuild → dist/，build 前清空 dist）
pnpm -r test            # sapbuddy-tools：170 用例（门禁/转换器/插件加载/连接存储）
node scripts/install.mjs          # 装到本机 DSH web profile（file: 安装）
node scripts/install.mjs --dry-run  # 预览
```

## 代码规范

- 工具代码（TS）：严格模式、NodeNext、无分号、双引号（见 tsconfig.json）
- 新增 SAP 工具：在 `packages/sapbuddy-tools/src/sap-tools/tools/` 新建文件，导出
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
| 代码规则扫描（硬编码中文（含反引号字面量）/自建表结构字段裸内置类型；程序内局部变量放行） | `register.ts` scanCodeViolations + `index.ts` execute | 硬强制 |
| 开发客户端守卫（T000 类别） | `adtManager.ts` assertDevClient + `index.ts` execute | 硬强制 |
| 创建：包名/描述必填、$TMP 提示、requestText 建请求 | `tools/writeTools.ts` create_object_programmatically | 硬强制 |
| 修改：自动沿用/创建请求、请求描述格式 | `tools/writeTools.ts` replace_string_in_abap_object | 硬强制 |
| 传输请求：状态码中文、底表 E070/E071、只读放行 | `tools/transportText.ts` manage_transport_requests | 硬强制 |
| 创建/修改流程、避坑记录（Memory.md）、请求描述格式（行为层） | `preset/prompts/SYSTEM.md` 铁律 6b / 输出约定 | 提示层（AI 执行，工具已兜底） |

## 安全

- `connections.json`（SAP 凭据）不入库、不提交；安装器/设置页写入 `~/.dsh/.agent-presets/sapbuddy/`
- **默认只读**：connections.json 未显式设置 `security.readOnly: false` 即视为只读（所有写工具拒绝）
- 写操作另有双层保护：**人工确认**（拦截 → 用户批准/输入"确认"放行）+ **开发客户端守卫**（非 C 类拒绝）
- MCP 服务器配置由用户在 DSH 内置 dsh-mcp-client 管理（profile patch），仓库不提供程序化写配置

## 提交

- 提交前 `pnpm -r build` 确保编译通过；`pnpm -r test` 全绿
- 不提交：`node_modules/`、`dist/`、`connections.json`、`.DS_Store`、`output/`、日志
- 提交信息简洁中文或英文均可
