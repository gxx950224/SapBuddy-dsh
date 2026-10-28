# SapBuddy × DeepSeek Harness

[![npm](https://img.shields.io/npm/v/sapbuddy-dsh)](https://www.npmjs.com/package/sapbuddy-dsh) [GitHub](https://github.com/gxx950224/sapbuddy-dsh)

SapBuddy 的 DeepSeek Harness 插件：41 个 SAP ABAP 工具、8 个技能、SapBuddy agent preset 和 SAP 连接设置页。支持对象搜索与读码、代码修改、语法诊断与激活、DDIC、传输请求及文本维护。

## 安装与升级

在 DSH 的插件管理页添加：

```text
sapbuddy-dsh@0.0.8
```

或者使用 DSH 命令行：

```bash
dsh plugin --profile desktop add sapbuddy-dsh@0.0.8
```

安装或更新后完整退出并重启 DSH，在设置页配置 SAP 连接，新建会话选择 **SapBuddy**。需要 Node.js 22+ 和兼容的 DSH，宿主依赖要求见[插件 package.json](packages/sapbuddy-dsh/package.json)。

请使用统一包 `sapbuddy-dsh`，不要同时启用同功能的作用域包或旧拆分插件。连接凭据、Memory 和已存在的自定义提示词不会被默认文件覆盖。

## 激活核对

激活阶段报错后，工具仍会核对 active 源码与实时未激活对象清单。只有确认本次源码已生效、目标及相关对象没有未激活版本时，才清零该对象连续失败计数，本次也不再登记审计失败。INCLUDE 的原始报错仍作为诊断保留。

旧 active 版本、相关对象仍未激活或状态查询失败不会被当作成功。详见[插件使用说明](packages/sapbuddy-dsh/README.md)。

## 连接配置与排查

地址必须写全协议，且协议要与端口一致：ICM HTTP 端口（常见 8000）用 `http://`，ICM HTTPS 端口（常见 44300）用 `https://`。客户端号就是登录 `sap-client`，必须与系统一致（系统是 300 却填 200 会 401 认证失败）；登录语言不确定时填 `EN`；内部自签证书系统保持「允许自签名证书」勾选。

设置页的 **测试** 按钮现在与真实 SAP 工具同源（协议、客户端号、语言都一致）。早期版本把探活写死成 `node:https` 且只发 `X-sap-login-client` 头，会出现"http 端口永远探测失败"和"账号密码正确却报 401"的假阴性；401/403/404 分别给出客户端号与账号、ADT 权限、服务未激活的排查提示。

## 连接切换与会话自愈

切换或保存 SAP 连接后，插件立刻作废进程内池化的 ADT 客户端，下一次调用按新配置重新登录；写序列进入前还会刷新会话，识别到 CSRF/会话失效时重建连接并重试一次。因此切换系统后不会再出现"读源码正常、写入一直报 `CSRF 令牌验证失败`、必须重启 DSH"的情况，详见[插件使用说明](packages/sapbuddy-dsh/README.md)。

## 仓库结构

- `packages/sapbuddy-dsh/`：npm 发布的统一包，包含运行代码、类型声明、默认提示词、技能与激活回归测试。
- `packages/sapbuddy-tools/`、`packages/sapbuddy-settings/`、`packages/sapbuddy-settings-ui/`：保留的拆分包开发代码；当前统一包安装不依赖这些目录的构建流程。
- `preset/`、`overlays/`、`scripts/`、`docs/`：拆分包的开发与集成资源；使用统一包时以其包内 `cordis.patch.yml` 和使用说明为准。

## 开发验证

统一包维护的是已构建发布代码，不包含对应的完整 TypeScript 构建树。修改后在其目录执行回归与打包检查：

```bash
cd packages/sapbuddy-dsh
npm test                      # 激活核对 + 连接会话 + 连接配置接线 + 连接探测 + 设置页 bundle
npm pack --dry-run --ignore-scripts
```

回归测试需要 Node.js 24+，模拟 SAP 响应，不执行真实 SAP 写入。实际 SAP 系统的联机验收需要单独完成。

本地改完还没发布时，可以直接把 `packages/sapbuddy-dsh` 打成 tgz 装进 profile：

```bash
cd packages/sapbuddy-dsh
npm pack --ignore-scripts                      # 生成 sapbuddy-dsh-0.0.8.tgz
dsh plugin --profile desktop add ./sapbuddy-dsh-0.0.8.tgz
```

安装后完整退出并重新启动 DSH 生效。

## 配置与保护

连接在 DSH 的 **设置 → SAP 连接** 中管理。配置根默认是 `<DSH_HOME|~/.dsh>/.agent-presets/sapbuddy/`，可通过 `SAPBUDDY_HOME` 覆盖。

写入受只读配置、开发客户端、Z/Y 命名空间和人工授权约束。不要把 SAP 凭据、令牌或用户连接配置提交到本仓库。

## 许可证

MIT。工具实现来自 [SapBuddy](https://github.com/gxx950224/sapbuddy)。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
