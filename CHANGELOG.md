# Changelog

本文件记录 `sapbuddy-dsh` 的版本变更。版本号遵循语义化：修订号（如 0.1.7）为补丁/行为修正。

## 0.1.7 — 2026-11-19

### `analyze_abap_dumps` 重构：SNAP 列表 + ADT 标准单条详情

- **列表（`list_dumps`）改为直查 ST22 底层表 `SNAP`**：按 `DATUM / UZEIT`（日期+时间）与 `UNAME`（用户）下推过滤，**只查当前 SAP 连接对应的客户端（MANDT）**；单页 ~200ms。默认返回最多 **100 条**（上限 100）。不再调用会渲染整页详情的 ADT dumps feed（该 feed 在大 dump 量生产系统上 45s~120s 超时）。
- **单条详情（`analyze_dump`）改为调用 ADT 标准 dump 详情端点** `/sap/bc/adt/runtime/dump/{id}/formatted`（只渲染一条，~200ms），返回与 ST22 同款的标准结构：类别 / 运行时错误 / 异常 / ABAP 程序 / 短文本 / 发生了什么 / 错误分析 / 如何更正。任何错误类型通用，**不再需要按 dump 类型写解析**；并附上 SNAP 取到的出错源码行（行号±2）。同时间窗的 SNAP 分段渲染保留为老系统（无该端点）回退。
- ADT dump id 由 SNAP 头部行拼出：`时间戳14 + AHOST(补32) + UNAME(补12) + client(补3) + MODNO(补4)`。
- 列表与详情均**只按当前连接的 client**，移除“所有客户端 / allClients”开关。

### 修复（上一版 0.1.6 至今）

- `analyze_abap_dumps` 的 FQL 上界算子误用 `lessThan`（ADT 无此算子，实测 400 `Data is invalid and could not be converted`），改为 `less`。
- `sapTimeZoneOffset` 解析 dump 时间窗时为必填；在 `connections.example.json` 补 `+08:00` 示例，需在各连接配置中填写真实偏移（如 `+08:00`）。
- 时间戳提取兼容真实 dump id（`/sap/bc/adt/vit/runtime/dumps/...` 前缀）。

## 0.1.6

- ADT `400 Session timed out` 会话自愈（清 cookie、重登录、非 stateful 重试一次，仍失败清池）。
- 工具错误信息附带 HTTP 状态与 SAP 原文。
- `manage_text_elements` 对函数组（FUGR）改为本地提示，避免无意义 ADT 请求。

## 0.1.5

- DSH 加载加固、`engines >= 0.2.2-rc.1`、新增 `sap-pp-bapi`。
