import test from 'node:test';
import assert from 'node:assert/strict';

// "测试连接"探测请求的回归：曾经写死 node:https，导致 http://host:8000（SAP ICM HTTP 端口）
// 永远探测失败；客户端号也只发了 X-sap-login-client 头，部分系统会忽略它、按默认客户端登录，
// 于是明明账号密码正确却返回 401。这里把这两条钉住。

const { buildProbeRequest, describeProbeStatus } = await import('../dist/index.js');

const conn = (overrides = {}) => ({
    id: 'dev',
    url: 'http://192.168.111.85:8000',
    client: '300',
    username: 'RC_ZHENGXY',
    password: 'secret',
    language: 'EN',
    ...overrides,
});

test('http 地址按 http 探测，并带上 sap-client / sap-language 查询参数', () => {
    const probe = buildProbeRequest(conn());
    assert.ok(!('error' in probe));
    assert.equal(probe.scheme, 'http');
    assert.equal(probe.url.protocol, 'http:');
    assert.equal(probe.url.pathname, '/sap/bc/adt/compatibility/graph');
    assert.equal(probe.url.searchParams.get('sap-client'), '300');
    assert.equal(probe.url.searchParams.get('sap-language'), 'EN');
    // 兼容只认该头的系统
    assert.equal(probe.headers['X-sap-login-client'], '300');
    assert.match(probe.headers.Authorization, /^Basic /);
    assert.equal(Buffer.from(probe.headers.Authorization.slice(6), 'base64').toString(), 'RC_ZHENGXY:secret');
});

test('https 地址按 https 探测，尾部斜杠不会拼出双斜杠', () => {
    const probe = buildProbeRequest(conn({ url: 'https://10.8.202.35:44300///' }));
    assert.ok(!('error' in probe));
    assert.equal(probe.scheme, 'https');
    assert.equal(probe.url.toString(), 'https://10.8.202.35:44300/sap/bc/adt/compatibility/graph?sap-client=300&sap-language=EN');
});

test('地址缺协议时给出明确提示，而不是抛 TLS 错误', () => {
    const probe = buildProbeRequest(conn({ url: '192.168.111.85:8000' }));
    assert.ok('error' in probe);
    assert.match(probe.error, /http:\/\//);
    assert.match(probe.error, /https:\/\//);
});

test('没有客户端号时不带 sap-client 参数，也不加该请求头', () => {
    const probe = buildProbeRequest(conn({ client: undefined, language: undefined }));
    assert.ok(!('error' in probe));
    assert.equal(probe.url.search, '');
    assert.equal(probe.headers['X-sap-login-client'], undefined);
});

test('401 的提示点名客户端号（填错客户端会 401），并保留当前填的值', () => {
    const message = describeProbeStatus(401, conn({ client: '200' }));
    assert.ok(message);
    assert.match(message, /客户端号/);
    assert.match(message, /200/);
    assert.match(message, /401/);
});

test('2xx 视为成功，403/404/5xx 各有对应提示', () => {
    assert.equal(describeProbeStatus(200, conn()), null);
    assert.equal(describeProbeStatus(204, conn()), null);
    assert.match(describeProbeStatus(403, conn()), /ADT/);
    assert.match(describeProbeStatus(404, conn()), /ADT 服务/);
    assert.match(describeProbeStatus(500, conn()), /服务端/);
});
