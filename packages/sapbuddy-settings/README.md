# sapbuddy-settings

SapBuddy SAP 连接管理宿主 API：注册 DSH `webServer` 路由，供设置页读写连接配置。

## 路由

- `GET/POST /api/sapbuddy/connections` —— 列表 / 新增或更新连接
- `POST /api/sapbuddy/activate` —— 切换当前活动连接
- `POST /api/sapbuddy/delete` —— 删除连接
- `POST /api/sapbuddy/test` —— 连接测试（node:https 直连，支持 `ssl.allowSelfSigned`）

配置存储由 `sapbuddy-tools/store`（connections-store）提供，写入
`<DSH_HOME|~/.dsh>/.agent-presets/sapbuddy/connections.json`。

## 安装

```bash
dsh plugin --profile web add ./packages/sapbuddy-settings
```

> 依赖 `sapbuddy-tools`（file: 相对路径，git 仓库内安装）。npm registry 发布前
> 需先发布 sapbuddy-tools 并把依赖改为 `"sapbuddy-tools": "^0.2.7"`。
