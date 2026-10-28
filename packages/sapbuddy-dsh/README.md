# sapbuddy-dsh

[![npm](https://img.shields.io/npm/v/sapbuddy-dsh)](https://www.npmjs.com/package/sapbuddy-dsh) [GitHub](https://github.com/gxx950224/sapbuddy-dsh)

[SapBuddy](https://github.com/gxx950224/sapbuddy) 的 DeepSeek Harness 插件，提供 41 个 SAP ABAP 工具、10 个技能、SapBuddy agent preset 和 SAP 连接设置页。

## 安装

需要 Node.js 22+ 和兼容的 DSH；具体宿主依赖要求见 package.json 的 peerDependencies。
在 DSH 的插件管理页添加：

```text
sapbuddy-dsh@0.0.9
```

也可以通过 DSH 命令行安装：

```bash
dsh plugin --profile desktop add sapbuddy-dsh@0.0.9
```

更新已安装插件后，完整退出并重新启动 DSH，再新建会话选择 **SapBuddy**。
在 **设置 → SAP 连接** 中配置连接。请只安装裸包名 `sapbuddy-dsh`，避免与同功能的作用域包或拆分插件同时启用。

依赖 `@scarf/scarf` 的遥测脚本不影响 SAP 功能。如果包管理器提示未批准构建脚本，可通过宿主提供的依赖脚本管理禁用该遥测脚本，再重试安装。

## 激活结果核对

`abap_activate` 先检查待激活源码的语法，执行激活后读取 active 源码进行核对；激活阶段返回错误或抛异常时也会继续核对。

例如 INCLUDE 阶段报错，后续主程序实际已经激活：只有 active 源码与激活前快照一致，并且实时未激活清单中没有目标、直接引用的 INCLUDE 或激活响应中报告的未激活对象时，才确认成功并清零该对象的连续失败计数。原始阶段诊断保留，本次不再登记为审计失败。

源码不一致、相关对象仍未激活或核对查询失败时，继续保留失败。对象元数据中的 `active` 字段不能单独证明本次修改已生效。非源码对象沿用其激活接口结果。

## 连接配置与排查

在 **设置 → SAP 连接** 中填写主机地址时，必须带协议，且协议与端口一致：

| 端口 | 协议 | 示例 |
|---|---|---|
| ICM HTTP（常见 8000） | `http://` | `http://<host>:8000` |
| ICM HTTPS（常见 44300） | `https://` | `https://<host>:44300` |

协议写错（例如 HTTP 端口却用 `https://`）会导致 TLS/连接失败。客户端号即登录用的 `sap-client`，必须与目标客户端一致，否则会返回 401。登录语言不确定时建议填 `EN`。内网自签名证书可勾选「允许自签名证书」。

设置页的 **测试** 与真实 SAP 工具使用同一套协议、客户端号与语言。返回 401 时核对客户端号、账号与语言；403/404 多为 ADT 未开通或权限不足。

## 连接切换与会话自愈

切换或保存 SAP 连接后，插件会立刻作废进程内池化的 ADT 客户端，下一次调用按新配置重新登录，不会带着上一个系统的 cookie 与 CSRF 令牌去读写当前系统。

写操作（编辑、激活、DDIC、传输等）在进入独占写序列前会刷新会话：会话超过 5 分钟没有被确认可用就先重新登录（清空 cookie、换一份新的 CSRF 令牌）。原因是 ABAP 侧的会话空闲超时会让旧令牌失效，而 ADT 客户端 SDK 只在无状态（stateless）请求上自动重登录——有状态写请求不会，于是会出现"读源码正常、每次写都报 `CSRF 令牌验证失败`"的僵局。

如果写请求仍然收到 CSRF 或会话失效错误（例如 ABAP 侧刚重启），插件会丢弃该会话、重建连接并整体重试一次。CSRF 校验失败的请求在 SAP 侧不会执行，因此重试不会造成重复写入。上述恢复对工具层透明，不需要重启 DSH，也不需要重新切换连接。

## 工具与技能

工具涵盖对象搜索与读码、代码导航、语法诊断与激活、ATC 与单元测试、SQL 查询、DDIC、文本池、屏幕文本、消息类、函数模块接口和传输请求。

技能包括 `abap-code-review`、`abap-explain`、`abap-templates`、`abap-wiki`、`clean-abap`、`dev-write`、`sap-abap-skills`、`translate-workflow`、`sap-fs`（四类 FS：MD + Claude 风 HTML）、`grilling`（经 sap-fs 加载的追问澄清）。

## 配置和写入保护

首次加载时，插件会在 `<DSH_HOME|~/.dsh>/.agent-presets/sapbuddy/` 补充缺失的默认提示词与示例配置；也可用 `SAPBUDDY_HOME` 指定位置。已有连接、Memory 和自定义提示词不会被覆盖。连接凭据通过 SAP 连接设置页管理，不应提交到 Git。

写操作受连接级只读、开发客户端检查、Z/Y 命名空间及人工授权约束。中文文案采用维护建议，不再按源码中的中文字符统一阻断。

插件包含顶层设置入口 `sapbuddy-dsh` 和 preset 内工具入口 `sapbuddy-dsh/tools`；使用插件管理器安装以同时登记 bundle 和 preset。

## 开发与验证

仓库中的 `packages/sapbuddy-dsh` 是可发布的统一插件，包含已构建运行代码、类型声明、默认提示词和技能。维护此目录时直接验证运行代码；这里不提供重建该统一包的 TypeScript 开发树。

从 GitHub 克隆仓库后，在 `packages/sapbuddy-dsh` 下运行激活回归测试（需要 Node.js 24+，无需连接 SAP）：

```bash
npm test                      # = test:activation + test:session + test:store + test:probe + test:route + test:bundle + test:sap-fs
npm pack --dry-run --ignore-scripts
```

`test:activation` 覆盖激活结果核对的误报恢复、失败计数、审计记录和核对失败边界；`test:session` 覆盖写前会话刷新、CSRF 失效自动重建，以及"已落库则绝不重试"的边界；`test:store` 用真实模块验证设置页保存/切换/删除连接确实会作废连接池；`test:probe` 覆盖连接探测的协议/客户端号/语言与 401 提示；`test:route` 起一个本地 http 服务端到端验证「测试」按钮（含 sap-client 传递与 401 提示）；`test:bundle` 对设置页 bundle 做渲染冒烟。测试都使用模拟 SAP 响应，不能替代真实 SAP 联机验收。

## 许可证

MIT。工具实现来自 [SapBuddy](https://github.com/gxx950224/sapbuddy)。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
