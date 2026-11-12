#!/usr/bin/env node
/** ADT 连接健康自检 + "坏会话自愈"验证。用法：node scripts/adt-probe.mjs [connId]
 *  不打印密码、用户名、完整 URL。 */
import { readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const connId = (process.argv[2] ?? "开发").toLowerCase()
const file = path.join(os.homedir(), ".dsh/.agent-presets/sapbuddy/connections.json")
let conf
try {
  conf = JSON.parse(readFileSync(file, "utf8")).connections.find((c) => c.id.toLowerCase() === connId)
} catch {
  console.error("连接配置不可读")
  process.exit(1)
}
if (!conf) {
  console.error("指定连接不存在")
  process.exit(1)
}

const { createSSLConfig } = await import("abap-adt-api")
const { createManagedAdtClient } = await import("../dist/sap-tools/http-client.js")
const ssl = createSSLConfig(conf.ssl?.allowSelfSigned ?? false, conf.ssl?.customCA)
const client = createManagedAdtClient(conf.url, conf.username, conf.password, conf.client, conf.language ?? "ZH", { timeout: 30000, ...ssl })

async function hit(pathSuffix) {
  try {
    const r = await client.request(pathSuffix, { method: "GET" })
    console.log(`✅ ${pathSuffix} → ${r.status} ${r.statusText}`)
    return true
  } catch (e) {
    const msg = String(e?.message ?? "").slice(0, 160)
    console.log(`❌ ${pathSuffix} → ${e?.status ?? e?.err ?? "?"} ${msg}`)
    return false
  }
}

try {
  await client.login()
  console.log("✅ login")
} catch (e) {
  const code = e?.code ?? e?.parent?.code ?? ""
  console.log(`❌ login → ${e?.status ?? e?.err ?? "?"} ${code || "failed"}`)
  process.exit(1)
}
await hit("/sap/bc/adt/compatibility/graph")
await hit("/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=ZITS033")

// 故意把会话 cookie 改坏，验证 L1 自愈：预期下面这次仍成功（自动重登 + 重试）
const jar = client.httpClient?.cookie
if (jar && typeof jar.set === "function") {
  jar.set("sap-contextid", "BROKEN-CONTEXT")
} else {
  console.log("❌ 无法注入坏 cookie（httpClient.cookie 不可用）")
  process.exit(1)
}
console.log("--- 注入坏 cookie，验证自愈 ---")
const healed = await hit("/sap/bc/adt/compatibility/graph")
console.log(healed ? "✅ 自愈生效（未重启、未人工干预）" : "❌ 自愈未生效，检查 http-client.js 的会话重试")
process.exit(healed ? 0 : 2)
