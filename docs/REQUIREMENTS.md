# SapBuddy × DeepSeek Harness 重构需求（v1.0，已获批）

> 完整评审版见会话记录；本文是实施依据的精简固化版。

## 目标
新建独立仓库 sapbuddy-dsh，以 DeepSeek Harness 为底座替代 `@earendil-works/pi-coding-agent`：
41 个 SAP 工具 + 技能 + 写门禁以 **Cordis 工具插件（sapbuddy-tools）+ agent preset（sapbuddy）** 形态嵌入 DSH。
交互面 = DSH Web GUI（选 preset）+ headless 单次问答；放弃 TUI；MCP 由用户经 DSH 内置 dsh-mcp-client 配置。

## 已确认决策
| # | 决策 |
|---|---|
| D1 | 新建独立仓库；41 工具 vendored（保留 LICENSE/CREDITS），上游保持 canonical，定期同步 |
| D2 | Web GUI + headless；放弃 TUI |
| D3 | MCP：用户在 DSH 内置 dsh-mcp-client 配置（profile patch 加 insert 行），仓库不提供转换脚本 |
| D4 | 交付：npm 包 sapbuddy-tools + preset 目录 + 一键安装器 install.mjs |

## 架构
- **Host（不改）**：工具/技能/会话/模型路由/审批/沙箱/subagents/Web/agent-presets 注册表。
- **Preset（sapbuddy）**：persona（SYSTEM.md 铁律精简）、sapbuddy-tools 行、skills 挂载（customSkillDirs→preset skills/）、standard 继承组（plan/compaction/delegation）。
- **写门禁**：`ctx.tools.guard()` 硬规则（只读/连接变更/命名空间）→ `tools/pre-execute` ask 门（GUI 审批）→ 确认词授权窗口（headless 回退）；开发客户端守卫/内容扫描/审计留在 execute。
- **模型**：`llm-pi-ai` providers（settings.yaml）+ `~/.dsh/.credentials.yaml`（apiKeyEnv 引用）。
- **MCP**：用户在 `~/.dsh/profiles/web/cordis.patch.yml`（profile 层）加 dsh-mcp-client insert 行（streamable-http）；工具名 `mcp__<server>__<tool>`。
- **headless**：不走 preset → `--patch overlays/headless.sapbuddy.yml` 直接挂 persona + sapbuddy-tools + skills。

## 阶段（全部完成）
| 阶段 | 内容 | 结果 |
|---|---|---|
| 0 | 机制验证（动态插件注册/headless 物化/门禁契约） | ✅ 通过 |
| 1 | 仓库骨架 + 41 工具移植 + 原测试跑绿 | ✅ 186/186 |
| 2 | 注册适配层（zod→spec + ctx.tools.register） | ✅ 177 |
| 3 | 写门禁（guard + ask + 窗口）+ execute 包装 | ✅ 186 |
| 4 | sapbuddy preset + skills + standingKeyFor 校验 | ✅ mounted OK |
| 5 | 安装器 + 模型/凭据配置落盘 | ✅ |
| 6 | headless overlay + 文档 + 端到端验证 | ✅ headless 实测通过 |

## 验收清单
1. Web 侧边栏可选 `SapBuddy` preset（standingKeyFor 通过 + 用户实机确认）
2. 会话工具目录含 41 个 SAP 工具（若用户配置了 MCP 另有 `mcp__*` 工具），无重名
3. 写门禁：只读默认拒绝 / 开发客户端守卫 / 人工确认
4. 技能可见可加载（dev-write/translate-workflow 等）
5. 多模型（llm-pi-ai 8 provider）Web 模型页可切换
6. MCP 工具 `mcp__<server>__<tool>` 出现
7. headless 单次问答可用（已实测）
8. 全部单测通过；安装器幂等可重复

## 遗留（P2 可选）
- 配置收口后的**自身源码保护 / 产物路径规则**（pi 版遗留逻辑已随 pi 门禁移除，未移植；如需要可在 gate.ts 补 DSH fs guard）
- 旧会话迁移 scripts/migrate-sessions.mjs
- HTML 审查报告升级 DSH deliverables（当前产物写入 DSH 工作区）
- 升级器（版本配套检查、合并式升级不覆盖用户修改）

## 配置收口（2026-08 补充决策 D5）
SapBuddy 的一切配置自包含于 preset 目录（`~/.dsh/.agent-presets/sapbuddy/`）：
connections.json / settings.json / logs / output / uploads，随 preset 一起分发（MCP 服务器配置由 DSH 内置 dsh-mcp-client 在 profile patch 管理，不在 preset 内）。
工具层经 `sapbuddy-home.ts`（`SAPBUDDY_HOME` 可覆盖）解析；旧 `~/.SapBuddy` 仅由安装器一次性迁移。
敏感配置目录由 `gate.ts` 的 `configPathViolation` guard 保护（bash/读/写工具拦截）。

## SAP 连接设置页（2026-08 补充决策 D6）
DSH 设置界面新增 "SAP 连接" 页：多连接 CRUD + 切换启用 + 测试连接。
- 包拆分（官方"宿主服务/客户端 UI"分离模式，避免双端单包导致宿主行等待客户端服务）：
  - `sapbuddy-settings`（纯宿主）：`webServer` 路由 `/api/sapbuddy/connections*`，`inject:['webServer']`，
    写操作限 loopback，密码永不出响应；测试连接用 node:https 支持 ssl.allowSelfSigned
  - `sapbuddy-settings-ui`（纯客户端，宿主 apply 为空）：`settings.section` 槽注册，
    `exports["./client"]` + `dsh.client`，esbuild 打 `__ModuleLoader__` bundle
  - ⚠️ 客户端挂载用 **bundle 的 `exports.inject`，且必须写浏览器里的服务键**（如 `["slots"]`，
    与官方 models 一致）；写包名（`@deepseek-ai/dsh-client-runtime`）会导致浏览器侧
    `waiting for service` 启动失败（曾踩坑）
- 存储：`connections-store.ts`（preset 目录 connections.json，保存后失效缓存 + markConnectionDirty，
  工具层强制"切换后先 get_connected_systems 重确认"）
- 组合：两个行均位于 **web profile 的用户 patch 层**（`- insert:` 块；安装器追加），非 preset 内

## MCP（2026-08 决策 D7 撤回）
设置页 MCP 管理已移除（用户改由 DSH 内置方式配置）：
在 `~/.dsh/profiles/web/cordis.patch.yml`（profile 层）手写 `- insert:` 块，
重启后 MCP 工具以 `mcp__<server>__<tool>` 在任意会话可用。自签名证书需在启动环境
`export NODE_TLS_REJECT_UNAUTHORIZED=0`。技能里的旧命名（mcp_）已适配为 mcp__。
