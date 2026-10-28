import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

// 端到端验证设置页「测试」按钮：起一个本地 HTTP（非 HTTPS）服务冒充 ADT，
// 走真实的 /api/sapbuddy/connections/test 路由。旧实现写死 node:https，
// 对 http:// 地址一定失败——这条用例专门钉住"http 地址能测通"。

process.env.SAPBUDDY_HOME = mkdtempSync(join(tmpdir(), 'sapbuddy-route-'));
const store = await import('../dist/sap-tools/connections-store.js');
const { installSettingsRoutes } = await import('../dist/index.js');

const routes = new Map();
const ctx = {
    get: (name) => (name === 'webServer'
        ? { register: (route) => { routes.set(route.path, route.handler); return () => {}; } }
        : undefined),
};
installSettingsRoutes(ctx);
const testHandler = routes.get('/api/sapbuddy/connections/test');
assert.equal(typeof testHandler, 'function', '必须注册 /test 路由');

function fakeRequest(body) {
    const req = new EventEmitter();
    req.method = 'POST';
    req.socket = { remoteAddress: '127.0.0.1' };
    setImmediate(() => {
        req.emit('data', Buffer.from(JSON.stringify(body)));
        req.emit('end');
    });
    return req;
}
function fakeResponse(sink) {
    return {
        writeHead(status, headers) { sink.status = status; sink.headers = headers; },
        end(text) { sink.text = text; },
    };
}
async function callTest(id) {
    const sink = {};
    await testHandler(fakeRequest({ id }), fakeResponse(sink));
    return { status: sink.status, body: JSON.parse(sink.text) };
}

/** 启动一个只记录请求、按 status 回应的假 ADT 服务 */
async function startProbeServer(status = 200) {
    const seen = [];
    const server = http.createServer((req, res) => {
        seen.push({ url: req.url, headers: req.headers });
        res.writeHead(status, { 'content-type': 'text/plain' });
        res.end(status === 200 ? 'ok' : 'denied');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { server, seen, port: server.address().port };
}

test('http:// 地址能用「测试」按钮测通，且带 sap-client / sap-language / Basic 认证', async () => {
    const { server, seen, port } = await startProbeServer(200);
    try {
        const saved = store.saveConnection({
            id: 'local', url: `http://127.0.0.1:${port}`, client: '300',
            username: 'RC_ZHENGXY', password: 'secret', language: 'EN',
        });
        assert.equal(saved.ok, true);

        const r = await callTest('local');
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(r.body.status, 200);

        assert.equal(seen.length, 1);
        assert.equal(seen[0].url, '/sap/bc/adt/compatibility/graph?sap-client=300&sap-language=EN');
        const auth = Buffer.from(String(seen[0].headers.authorization).replace(/^Basic /, ''), 'base64').toString();
        assert.equal(auth, 'RC_ZHENGXY:secret');
    } finally {
        server.close();
    }
});

test('401 时返回可照做的客户端号提示', async () => {
    const { server, port } = await startProbeServer(401);
    try {
        store.saveConnection({
            id: 'local401', url: `http://127.0.0.1:${port}`, client: '200',
            username: 'RC_ZHENGXY', password: 'secret', language: 'ZH',
        });
        const r = await callTest('local401');
        assert.equal(r.body.ok, false);
        assert.match(r.body.error, /401/);
        assert.match(r.body.error, /客户端号/);
        assert.match(r.body.error, /200/);
    } finally {
        server.close();
    }
});

test('地址缺协议时直接给出明确错误，不发起请求', async () => {
    store.saveConnection({ id: 'noproto', url: 'http://placeholder:1', client: '300', username: 'u', password: 'p' });
    // 直接改文件模拟历史遗留的无协议配置
    const { writeFileSync, readFileSync } = await import('node:fs');
    const { join: j } = await import('node:path');
    const file = j(process.env.SAPBUDDY_HOME, 'connections.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.connections.push({ id: 'bare', url: '192.168.111.85:8000', client: '300', username: 'u', password: 'p' });
    writeFileSync(file, JSON.stringify(data));

    const r = await callTest('bare');
    assert.equal(r.body.ok, false);
    assert.match(r.body.error, /http:\/\//);
    assert.match(r.body.error, /https:\/\//);
});
