# sapbuddy-settings-ui

SapBuddy「SAP 连接」设置页（DSH 客户端 UI）。注册 `settings.section`，
经 `sapbuddy-settings` 的同源 HTTP API 读写连接配置。

## 构建

```bash
pnpm --filter sapbuddy-settings-ui build   # esbuild → dist/client.js
```

浏览器端 bundle 通过 `exports["./client"]` 提供；`dsh.client` 字段声明平台与注入。

## 安装

```bash
dsh plugin --profile web add ./packages/sapbuddy-settings-ui
```
