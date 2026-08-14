# sapbuddy-tools

SapBuddy 的 41 个 SAP ABAP 工具，以 **DeepSeek Harness（DSH）工具插件**形式提供（`ctx.tools.register`），
并内置三层写门禁（`tools.guard` 硬规则 → `tools/pre-execute` 审批 → 对话确认词授权窗口）。

## 安装（配合 preset 使用）

```bash
# 在仓库根目录
node scripts/install.mjs
```

或手动安装到 DSH profile：

```bash
dsh plugin --profile web add ./packages/sapbuddy-tools
```

## 导出

- `sapbuddy-tools`：插件入口（41 工具注册 + 写门禁安装）
- `sapbuddy-tools/store`：连接配置存储（`connections-store`），供 sapbuddy-settings 复用

## 工具清单

41 个工具覆盖：对象搜索/读取/编辑、代码定位、文档、ATC/单测/SQL、传输请求、
文本元素/消息类/屏幕文本翻译、Mermaid 图表等。完整清单见 `dist/sap-tools/tools/index.js`
或 preset 技能 `sap-abap-skills/references/tool-guide.md`。

## 开发

```bash
pnpm --filter sapbuddy-tools test   # tsc + node --test（31 门禁 + 门禁集成 + 插件加载等）
```
