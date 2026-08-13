# SapBuddy × DeepSeek Harness

SapBuddy 的 DSH 底座版：以 **DeepSeek Harness**（DSH）为 Agent 运行时，替代原
`@earendil-works/pi-coding-agent`（pi）。41 个 SAP 工具、技能集、写门禁等核心价值
以 **Cordis 工具插件 + agent preset** 的形态嵌入 DSH。

> 需求与实施路径见 `docs/`（需求文档 v1.0 已获批）。

## 仓库结构

```
sapbuddy-dsh/
├── packages/
│   └── sapbuddy-tools/        # 41 个 SAP 工具（vendored from SapBuddy）+ DSH 注册层 + 写门禁
│       ├── src/sap-tools/     # 业务实现（tools/、adtManager、config、taskTransport、auditLog、register、gate…）
│       └── test/              # 工具层 + 转换器 + 插件加载 + 门禁单测（186 用例全绿）
├── preset/                    # sapbuddy agent preset 模板（agent.cordis.yml + preset.yml + skills/）
├── overlays/
│   └── headless.sapbuddy.yml  # headless 单次问答 overlay
├── scripts/
│   ├── install.mjs            # 一键安装器（插件/preset/模型/凭据/MCP）
│   └── mcp2dsh.mjs            # ~/.SapBuddy/mcp.json → dsh-mcp-client 配置行
├── docs/
│   ├── REQUIREMENTS.md        # 需求文档 v1.0（已获批）
│   └── SYNC.md                # 与上游 SapBuddy 的同步工作流
└── test/                      # (后续) 集成测试
```

## 阶段进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 0 | 机制验证（动态插件 + headless 物化） | ✅ 通过 |
| 1 | 仓库骨架 + 工具源码移植 + 原测试跑绿 | ✅ 168/168 |
| 2 | 注册适配层（zod→spec + ctx.tools.register） | ✅ 177/177 |
| 3 | 写门禁（guard + ask 门 + 授权窗口） | ✅ 186/186 |
| 4 | agent preset（persona + skills 挂载 + standingKeyFor） | ✅ mounted OK |
| 5 | 模型/凭据/MCP 配置 + 安装器 | ✅ |
| 6 | headless overlay + 文档 + 端到端验证 | ✅ headless 实测通过 |

## 开发

```bash
pnpm install --store-dir /tmp/pnpm-store   # 沙箱内需本地 store；正常环境直接 pnpm install
# dev 依赖解析：@deepseek-ai/dsh-tools / @deepseek-ai/cordis 取自本地 DSH 安装（npm 版本过旧）
#   （node_modules 中为 symlink，不入库；npm 发布正确版本后改为普通 devDependency）
pnpm -r build
pnpm -r test
```
