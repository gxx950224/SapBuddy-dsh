# 与上游 SapBuddy 的同步工作流

`packages/sapbuddy-tools/src/sap-tools/` 是自上游仓库 [gxx950224/SapBuddy](https://github.com/gxx950224/SapBuddy)
vendored 的副本。**上游仓库是 41 个 SAP 工具实现的 canonical 源**，本仓库负责 DSH 集成层。

## 同步规则

- 只同步 `src/sap-tools/` 下的**业务实现**：`tools/`、`adtManager.ts`、`config.ts`、
  `taskTransport.ts`、`auditLog.ts`、`banner.ts`。
- **不同步** pi 适配文件：`pi-extension.ts`、`mcp-register.mjs`（本仓库以 DSH 注册层/配置替代）。
- `register.ts` 是特例：逻辑同源，但头部已去掉 pi 类型导入（`ExtensionAPI = any` 占位），
  阶段 2/3 将把 pi 耦合部分（`installWriteGate`/`registerSapTools`）替换为
  `ctx.tools.register` + `guard` + `tools/pre-execute` 实现。
- 本仓库对同步文件的改动应尽量少：能回推上游的修复（bug fix / 新工具）请先提交到上游。

## 手动同步步骤

```bash
# 1. 拉取上游最新
git clone --depth 1 https://github.com/gxx950224/SapBuddy.git /tmp/sapbuddy-upstream

# 2. 覆盖业务文件（保留本仓库对 register.ts 头部的适配，手工合并）
cp /tmp/sapbuddy-upstream/src/sap-tools/*.ts   packages/sapbuddy-tools/src/sap-tools/
cp -r /tmp/sapbuddy-upstream/src/sap-tools/tools packages/sapbuddy-tools/src/sap-tools/tools
rm -f packages/sapbuddy-tools/src/sap-tools/pi-extension.ts

# 3. 同步工具层测试（跳过 pi 集成测试：smoke/promptSync/skillSync/cassette）
for f in taskTransport textPool messageClassText languageKeys \
         dataQueryHint fmoduleInterface writeTools robustness security; do
  cp /tmp/sapbuddy-upstream/test/$f.test.mjs packages/sapbuddy-tools/test/
done

# 4. 回归
cd packages/sapbuddy-tools && pnpm test

# 5. 记录同步的上游 commit
git log -1 --format='%H %s'   # 记入 PR 描述
```

## 后续自动化（P2）

将上述步骤固化为 `scripts/sync-upstream.mjs`，支持 `--commit <sha>` 精确同步、
`--dry-run` 差异预览，并在 CI 中定期检查漂移。
