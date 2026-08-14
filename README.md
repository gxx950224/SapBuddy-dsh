# SapBuddy × DeepSeek Harness

SapBuddy 的 **DeepSeek Harness（DSH）** 底座版：41 个 SAP 工具、技能集、写门禁等核心价值
以 **Cordis 工具插件 + agent preset** 的形态嵌入 DSH，通过 Web GUI 与 headless 单次问答使用。

> 需求与实施路径见 `docs/`。

## 仓库结构

```
sapbuddy-dsh/
├── packages/
│   ├── sapbuddy-tools/        # 41 个 SAP 工具（vendored from SapBuddy）+ DSH 注册层 + 写门禁 + 连接存储 + 提示词注入
│   │   ├── src/sap-tools/     # 业务实现（tools/、adtManager、config、taskTransport、auditLog、register、gate…）
│   │   └── test/              # 工具层 + 转换器 + 插件加载 + 门禁 + 连接存储 + 提示词注入单测（172 用例全绿）
│   ├── sapbuddy-settings/     # DSH 设置宿主 API：webServer 路由（SAP 连接管理）
│   │   └── src/index.ts       #   （list/upsert/activate/delete/test，inject:['webServer']）
│   └── sapbuddy-settings-ui/  # DSH 设置界面 "SAP 连接" 页（客户端 settings.section）
│       └── client/index.ts    # 浏览器：SAP 连接管理页（esbuild → dist/client.js）
├── preset/                    # sapbuddy agent preset 模板（agent.cordis.yml + preset.yml + skills/ + prompts/ + AGENTS.md + 配置示例）
├── overlays/
│   └── headless.sapbuddy.yml  # headless 单次问答 overlay
├── scripts/
│   ├── install.mjs            # 一键安装器（构建/插件/preset/配置收口；模型复用 DSH）
│   └── recover.mjs            # 恢复脚本（仅移除 sapbuddy 设置行，保留用户其他自定义行）
├── docs/
│   ├── REQUIREMENTS.md        # 需求文档 v1.0
│   └── SYNC.md                # 与上游 SapBuddy 的同步工作流
└── test/                      # (后续) 集成测试
```

> **配置自包含**：SapBuddy 的一切配置（connections/settings/logs/output/uploads）与提示词（prompts/SYSTEM.md、AGENTS.md、prompts/Memory.md，随会话注入）收口在
> 已安装 preset 目录 `~/.dsh/.agent-presets/sapbuddy/`，随 preset 一起分发/升级；工具层经
> `sapbuddy-home.ts`（`SAPBUDDY_HOME` 可覆盖）解析，不再使用 `~/.SapBuddy`（安装器负责一次性迁移）。

## 安装（快速开始）

```bash
git clone https://github.com/gxx950224/sapbuddy-dsh.git && cd sapbuddy-dsh
pnpm install && pnpm -r build          # 全新 clone 需要先构建（dist 不入库）
node scripts/install.mjs               # 安装插件到 web profile、复制 preset（模型走 DSH 模型页）
```

安装器会：把 `sapbuddy-tools` / `sapbuddy-settings` / `sapbuddy-settings-ui` 装进 web profile、
复制 preset 到 `~/.dsh/.agent-presets/sapbuddy/`。**不配置模型/凭据**——模型直接复用 DSH 自身配置（Web 设置 → 模型页选择 provider/模型并填 key）。

然后：

1. 模型：直接复用 DSH 配置（Web 设置 → 模型页选 provider/模型，需要时填 key）
2. 填写 SAP 连接：编辑 `~/.dsh/.agent-presets/sapbuddy/connections.json`
   （参考仓库 `preset/connections.example.json`；ADT 需在 SICF 激活 `/sap/bc/adt`）；
3. 启动：`dsh web` → 浏览器打开 → 侧边栏选择 **SapBuddy** preset → 开始会话；
4. 单次问答：`dsh --profile headless --patch <sapbuddy-dsh>/overlays/headless.sapbuddy.yml "解释 ZPPR006"`
   （headless 需先 `dsh plugin --profile headless add sapbuddy-tools`）。

恢复：设置页出问题可 `node scripts/recover.mjs`（只移除 sapbuddy 设置行，**保留**你在
patch 里的其他自定义行）。

## 让 AI 一键安装（提示词，可直接复制给 AI 助手）

不想手动敲命令？把下面这段完整粘贴给任意 AI 编码助手（DeepSeek Harness 会话等），
它会按步骤下载、构建、安装：

```markdown
下载并安装 sapbuddy-dsh 到本机 DeepSeek Harness：

1. git clone https://github.com/gxx950224/SapBuddy-dsh.git 到工作区，进入目录
2. pnpm install && pnpm -r build        # 全新环境也能编译（peer 依赖自动装）
3. 运行 node scripts/install.mjs        # 装 sapbuddy-tools / sapbuddy-settings / sapbuddy-settings-ui
                                         # 到 DSH web profile，复制 preset 到 ~/.dsh/.agent-presets/sapbuddy/
   ⚠️ 这一步要写 ~/.dsh/（profile patch、preset 目录），在你的沙箱权限之外：
      如被沙箱拒绝，申请权限升级并等待用户批准；不要绕过、不要用其他方式偷偷写这些文件。
4. 安装器不配置模型和 API Key——模型由用户到 DSH 的 Web 设置 → 模型页选择（含填 key）。
5. 完成后向用户报告：
   - 重启 dsh web（需用户自己执行）
   - 侧边栏选择 "SapBuddy" preset
   - 编辑 ~/.dsh/.agent-presets/sapbuddy/connections.json 填 SAP 连接
   - （可选）MCP 服务器按本仓库 README 用 dsh-mcp-client 配置

注意事项：
- 前提：机器有 git、Node ≥ 22、pnpm（缺 pnpm 先 npm i -g pnpm，同样需批准）
- 不要修改 preset 里已存在的 connections.json / Memory.md（用户数据）
- 全程不要动 ~/.dsh/settings.yaml 的模型段和 ~/.dsh/.credentials.yaml
```

## MCP（可选）

MCP 服务器由你直接在 **DSH 内置 dsh-mcp-client** 配置（在 `~/.dsh/profiles/web/cordis.patch.yml`
加一个 `- insert:` 行），注册的工具名为 `mcp__<server>__<tool>`（双下划线）。本仓库**不提供**
程序化写 MCP 配置的代码。示例：

```yaml
- insert:
    - id: mcp-sap-mcp-dev
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: sap_mcp_dev
        transport: streamable-http
        url: https://<host>:44300/sap/bc/zsx_intf_serv/zsx_mcp?sap-client=100
        headers:
          X-API-Key: "<key>"
```

### MCP 自签名证书（重要）
SAP 内网 MCP 端点通常用自签名证书，而 dsh-mcp-client 经 MCP SDK 的 fetch 连接，
默认 TLS 会拒绝（`DEPTH_ZERO_SELF_SIGNED_CERT`）→ 连接失败、**MCP 工具不出现**（静默，无报错）。
解决：在**启动环境**放开 TLS 校验（`.env` 缝被 DSH 安全策略拒绝，只能在启动环境设）：
```bash
# ~/.zshrc 加一行（或每次启动前缀）
export NODE_TLS_REJECT_UNAUTHORIZED=0
```
更安全：导出 SAP 证书并用 `NODE_EXTRA_CA_CERTS=/path/sap-cert.pem`（只信任该证书，验证保持开启）。

## 阶段进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 0 | 机制验证（动态插件 + headless 物化） | ✅ |
| 1 | 仓库骨架 + 工具源码移植 + 原测试跑绿 | ✅ |
| 2 | 注册适配层（zod→spec + ctx.tools.register） | ✅ |
| 3 | 写门禁（guard + ask 门 + 授权窗口 + 知识库只读） | ✅ |
| 4 | agent preset（persona + skills 挂载 + standingKeyFor） | ✅ |
| 5 | 安装器（插件/preset，模型复用 DSH） | ✅ |
| 6 | headless overlay + 文档 + 端到端验证 | ✅ |

## 开发

```bash
pnpm install          # 正常环境直接安装（沙箱内可 --store-dir 指定本地 store）
# dev 依赖解析：@deepseek-ai/dsh-tools / @deepseek-ai/cordis 为 peerDependencies，由 pnpm 自动安装
# （npm 上已有匹配版本）；运行时由宿主 DSH profile 提供
pnpm -r build
pnpm -r test          # sapbuddy-tools：172 用例（门禁/转换器/插件加载/连接存储/提示词注入）全绿
```
