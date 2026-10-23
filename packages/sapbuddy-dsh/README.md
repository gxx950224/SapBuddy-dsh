# sapbuddy-dsh

[![npm](https://img.shields.io/npm/v/sapbuddy-dsh)](https://www.npmjs.com/package/sapbuddy-dsh) [GitHub](https://github.com/gxx950224/sapbuddy-dsh)

[SapBuddy](https://github.com/gxx950224/sapbuddy) 的 DeepSeek Harness 插件，提供 41 个 SAP ABAP 工具、8 个技能、SapBuddy agent preset 和 SAP 连接设置页。

## 安装

需要 Node.js 22+ 和兼容的 DSH；具体宿主依赖要求见 package.json 的 peerDependencies。
在 DSH 的插件管理页添加：

```text
sapbuddy-dsh@0.0.6
```

也可以通过 DSH 命令行安装：

```bash
dsh plugin --profile desktop add sapbuddy-dsh@0.0.6
```

更新已安装插件后，完整退出并重新启动 DSH，再新建会话选择 **SapBuddy**。
在 **设置 → SAP 连接** 中配置连接。请只安装裸包名 `sapbuddy-dsh`，避免与同功能的作用域包或拆分插件同时启用。

依赖 `@scarf/scarf` 的遥测脚本不影响 SAP 功能。如果包管理器提示未批准构建脚本，可通过宿主提供的依赖脚本管理禁用该遥测脚本，再重试安装。

## 激活结果核对

`abap_activate` 先检查待激活源码的语法，执行激活后读取 active 源码进行核对；激活阶段返回错误或抛异常时也会继续核对。

例如 INCLUDE 阶段报错，后续主程序实际已经激活：只有 active 源码与激活前快照一致，并且实时未激活清单中没有目标、直接引用的 INCLUDE 或激活响应中报告的未激活对象时，才确认成功并清零该对象的连续失败计数。原始阶段诊断保留，本次不再登记为审计失败。

源码不一致、相关对象仍未激活或核对查询失败时，继续保留失败。对象元数据中的 `active` 字段不能单独证明本次修改已生效。非源码对象沿用其激活接口结果。

## 工具与技能

工具涵盖对象搜索与读码、代码导航、语法诊断与激活、ATC 与单元测试、SQL 查询、DDIC、文本池、屏幕文本、消息类、函数模块接口和传输请求。

技能包括 `abap-code-review`、`abap-explain`、`abap-templates`、`abap-wiki`、`clean-abap`、`dev-write`、`sap-abap-skills`、`translate-workflow`。

## 配置和写入保护

首次加载时，插件会在 `<DSH_HOME|~/.dsh>/.agent-presets/sapbuddy/` 补充缺失的默认提示词与示例配置；也可用 `SAPBUDDY_HOME` 指定位置。已有连接、Memory 和自定义提示词不会被覆盖。连接凭据通过 SAP 连接设置页管理，不应提交到 Git。

写操作受连接级只读、开发客户端检查、Z/Y 命名空间及人工授权约束。中文文案采用维护建议，不再按源码中的中文字符统一阻断。

插件包含顶层设置入口 `sapbuddy-dsh` 和 preset 内工具入口 `sapbuddy-dsh/tools`；使用插件管理器安装以同时登记 bundle 和 preset。

## 开发与验证

仓库中的 `packages/sapbuddy-dsh` 是可发布的统一插件，包含已构建运行代码、类型声明、默认提示词和技能。维护此目录时直接验证运行代码；这里不提供重建该统一包的 TypeScript 开发树。

从 GitHub 克隆仓库后，在 `packages/sapbuddy-dsh` 下运行激活回归测试（需要 Node.js 24+，无需连接 SAP）：

```bash
npm run test:activation
npm pack --dry-run --ignore-scripts
```

回归测试使用模拟 SAP 响应，覆盖误报恢复、失败计数、审计记录和核对失败边界；不能替代真实 SAP 联机验收。

## 许可证

MIT。工具实现来自 [SapBuddy](https://github.com/gxx950224/sapbuddy)。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
