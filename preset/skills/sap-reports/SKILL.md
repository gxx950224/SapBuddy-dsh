---
name: sap-reports
description: >-
  通过「SAP 报表」插件的 sap_reports 工具查询、运行 SAP 已授权报表（ALV 数据）。
  仅在用户明确要求查询/运行 SAP 报表、按条件取报表数据，或需要用报表数据核对/验证数据时加载。
  写 ABAP、开发或修改报表程序、写报表 FS/功能设计书、代码审查、解释程序均不触发
  （分别交给 dev-write / sap-fs / abap-code-review / abap-explain）。
  报表连接与 SapBuddy 的 ABAP 开发连接相互独立，互不替代。
agent_created: true
disable: false
---

# sap-reports — 使用 SAP 报表插件查询报表

> 报表查询走独立的 `sap_reports` 工具（「SAP 报表」插件提供），**不属于** SapBuddy 的 41 个 SAP 工具。
> 错误码速查见 `references/errors.md`。

## 0. 前置检查（必须）

1. 确认当前可用工具里有 `sap_reports`。
2. **没有**时：告诉用户需要先安装并启用「SAP 报表」插件（npm 包 `@gxx-labs/sap-reports-dsh`，安装：`dsh plugin --profile desktop add @gxx-labs/sap-reports-dsh@0.0.1`），
   然后在左侧「SAP 报表」页面完成连接；**到此停止**。
   - 禁止用 `execute_data_query`、`read_table_contents` 等其他工具"模拟"报表结果。

## 1. 两套连接互相独立

- 报表连接：在「SAP 报表」页面创建（例如 client 200），工具只能读到其 `connectionId`。
- ABAP 开发连接：SapBuddy 设置页创建（例如 client 200），由 `get_connected_systems` 查看。
- 两者**互不替代**：`get_connected_systems` 看不到报表连接；报表连接也不能用于读写 ABAP 对象。
- 账号密码只由用户在「SAP 报表」页面填写。**绝不索取、转述或回显密码**；工具参数也不接受凭据。

## 2. 标准流程：status → list → meta → 确认 → run → 分析

### 2.1 status（不访问 SAP）
- 调 `{"action":"status"}`，得到 `connections[{connectionId, username, endpoint, tlsVerified}]`。
- 没有连接 → 让用户到「SAP 报表」页面连接后再说。
- **多个连接，或无法判断用户要哪个系统/client** → 列出（用户名 + endpoint 中的 sap-client）请用户选择，不要自行挑选。
- `tlsVerified:false` → 提醒用户：该连接跳过了证书校验，凭据经未验证的 TLS 通道传输，仅适合测试系统。

### 2.2 list
- `{"action":"list","connectionId":"…"}` → `tcodes[{tcode, text, report, group?}]`。
- **只运行目录中存在的 tcode**。用户要的事务码不在目录中 → 如实说明「当前账号的授权报表目录里没有」，不猜、不换近似事务码。

### 2.3 meta
- `{"action":"meta","connectionId":"…","tcode":"…","variant":""}` → `{report, selection[], fields[], variants?}`。
- selection 字段**只用 meta 返回的 selname**，绝不猜字段名、不凭经验补字段。
- `obligatory:true` 且无默认/变式值的字段 → 向用户询问取值。
- 字段带 `options` 时只能填其中的 `value`。
- 有 variants 且用户提到变式时，按用户指定的变式名重新 meta。

### 2.4 运行前确认（每次 run 都必须）
- 把将要发送的**完整** `tcode`、`variant`、`selection`（逐行 selname/sign/option/low/high）和 `max_rows` 展示给用户，
  **等用户明确确认后**再 run。用户改条件后重新展示、重新确认。
- `max_rows` 使用插件默认值 **5000**，不要自行调低。
- 提醒：SAP 报表执行可能带业务副作用（有 ALV 输出不代表只读）；只运行用户明确要求的报表。

### 2.5 run
- `{"action":"run","connectionId":"…","tcode":"…","variant":"…","selection":[…],"max_rows":5000}`
  → `{rows, fields, rowCount, truncated, message?}`。
- 一次 run 内部会向 SAP 发 3 次请求，可能耗时较长（工具总超时 190 秒）。

## 3. 选择条件格式

- 所有值都是**字符串**；日期 `YYYYMMDD`，时间 `HHMMSS`；保留前导零与小数精度（物料号、工厂等不要去零）。
- 每行：`{"selname","kind","sign","option","low","high"}`，`kind` 必须与 meta 一致（`P` 参数 / `S` 选择范围）。
- `sign`：`I` 包含，`E` 排除。
- `option`：`EQ` 等于、`NE` 不等于、`GT`/`GE`/`LT`/`LE` 比较、`BT` 区间内、`NB` 区间外、`CP` 模式匹配（`*`/`+`）、`NP` 模式不匹配。
- `BT`/`NB`：`low`、`high` 都必填且 low ≤ high；其他 option 的 `high` 必须为空字符串。
- `P` 参数：只能有**一行** `sign:"I"`、`option:"EQ"`、`high:""`；复选框选中填 `"X"`，不选填 `""`。
- `S` 字段可多行（多值、区间、包含+排除组合）。最多 500 行。
- 必填字段需至少一行非空的 `I` 值；显式传入的行会覆盖默认/变式值。

## 4. 结果分析

- `truncated:true`：明确说「只看到了前 N 行（N = rowCount），结果被截断」，**不得对全量数据下结论**（合计、"不存在某项"、排名等）。
  然后**询问用户**是否放宽：把 `max_rows` 提高（上限 10000）或调整/收窄条件。**禁止自动重跑**。
- `rows` 为空：表述为「当前条件下无数据」，不要说"不存在"。
- 只基于返回的 `fields`/`rows` 分析；字段含义不确定时按 `fields[].label` 说明并注明不确定。
- 有 `message` 时原样告知用户。

## 5. 错误处理

- **不自动重试**任何错误；把错误码与（已脱敏的）message 告诉用户并给出建议，详见 `references/errors.md`。
- `CONNECTION_NOT_FOUND` / `CONNECTION_EXPIRED` → 请用户回「SAP 报表」页面重新连接。
- `TCODE_FORBIDDEN` / `SAP_FORBIDDEN` / `SAP_ERROR` → 权限或 SAP 业务错误，原样转述，不换其他途径绕过。
