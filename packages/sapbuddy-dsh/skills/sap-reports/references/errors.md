# sap_reports 错误码速查

所有错误均为 `{ok:false, error:{code, message}}`。插件**不自动重试**，Agent 也不要自动重试。

| code | 含义 | 告诉用户 |
| --- | --- | --- |
| `INVALID_INPUT` | 参数不合法（未知字段、标识符格式、长度等） | 修正参数；不要猜字段 |
| `INVALID_SELECTION` | 选择条件不合法（未知 selname、kind/sign/option 错、P 多行、BT 缺边界、high 误填、不在 options 中） | 按 meta 修正条件后重新确认 |
| `REQUIRED_SELECTION` | 必填字段为空 | 向用户询问取值 |
| `TCODE_FORBIDDEN` | 事务码不在当前用户授权报表目录 | 说明无权限，不绕过 |
| `CONNECTION_NOT_FOUND` | 连接不存在/已关闭 | 回「SAP 报表」页面重新连接 |
| `CONNECTION_EXPIRED` | 空闲 30 分钟过期 | 回「SAP 报表」页面重新连接 |
| `SAP_AUTH` | HTTP 401，账号或密码被拒 | 在页面检查账号后重连（不要索取密码） |
| `SAP_FORBIDDEN` | HTTP 403，无权执行 | 联系 SAP 权限管理员 |
| `SAP_ERROR` | SAP 业务错误（含 STATUS=E/A/X 的 MSGTXT，如无接口执行权限） | 原样转述 message |
| `SAP_ASYNC_RESPONSE` | HTTP 202，接口未配置为同步 | SAP 端接口需配置 `INTFMD='SYN'` |
| `SAP_RESPONSE` | SAP 返回格式不符合约定 | SAP 端接口问题，联系接口开发 |
| `SAP_RESPONSE_TOO_LARGE` | 响应超过 8 MiB | 收窄条件或降低数据量后再试（需用户确认） |
| `SAP_HTTP` | 其他非 2xx HTTP 状态 | 检查 SAP 服务 |
| `SAP_REDIRECT` | SAP 返回重定向 | 页面里填写最终 HTTPS 地址 |
| `SAP_NETWORK` | 网络或证书问题 | 检查网络/证书信任 |
| `SAP_TIMEOUT` | 单次请求超过 60 秒 | 收窄条件后由用户决定是否再试 |
| `CANCELLED` | 已取消 | SAP 端报表可能仍在运行 |
| `SERVICE_UNAVAILABLE` | 插件已卸载 | 检查插件是否启用 |
