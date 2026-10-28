import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 接线测试：用真实的 connections-store + adtManager 模块，验证"设置页保存/切换连接"
// 真的会把池化的 ADT 客户端作废（而不是只在别处单测 resetClients 本身）。
// 配置根指向临时目录，不碰用户真实的 ~/.dsh；客户端用假工厂，不连 SAP。

const home = mkdtempSync(join(tmpdir(), 'sapbuddy-wiring-'));
process.env.SAPBUDDY_HOME = home;

const adt = await import('../dist/sap-tools/adtManager.js');
const store = await import('../dist/sap-tools/connections-store.js');
const config = await import('../dist/sap-tools/config.js');

let created = [];
adt.__setClientFactoryForTest((conf) => {
    const client = {
        conf: { ...conf },
        logins: 0,
        stateful: 'stateless',
        async login() { client.logins++; },
    };
    created.push(client);
    return client;
});

const connection = (overrides = {}) => ({
    id: 'dev',
    name: '开发',
    url: 'https://dev.example:44300',
    client: '100',
    username: 'BC01',
    password: 'secret',
    language: 'ZH',
    authMethod: 'basic',
    ...overrides,
});

test('保存连接后池化客户端立刻作废，并按新地址重新登录', async () => {
    created = [];
    assert.equal(store.saveConnection(connection()).ok, true);
    assert.ok(existsSync(join(home, 'connections.json')));

    await adt.getClient('dev');
    assert.deepEqual(adt.connectedIds(), ['dev']);
    assert.equal(created.length, 1);
    assert.equal(created[0].conf.url, 'https://dev.example:44300');

    // 设置页改地址 = 切换到另一个系统
    assert.equal(store.saveConnection(connection({ url: 'https://prod.example:44300', client: '800' })).ok, true);
    assert.deepEqual(adt.connectedIds(), [], '配置变更必须清空连接池');
    assert.equal(config.getConfig().connections[0].url, 'https://prod.example:44300');

    await adt.getClient('dev');
    assert.equal(created.length, 2, '下一次调用必须重新创建客户端并登录');
    assert.equal(created[1].conf.url, 'https://prod.example:44300');
    assert.equal(created[1].logins, 1);
});

test('切换启用连接（activate）同样清空连接池', async () => {
    created = [];
    assert.equal(store.saveConnection(connection({ id: 'dev', url: 'https://dev.example:44300' })).ok, true);
    assert.equal(store.saveConnection(connection({ id: 'qas', url: 'https://qas.example:44300', client: '600' })).ok, true);

    await adt.getClient('dev');
    assert.deepEqual(adt.connectedIds(), ['dev']);

    assert.equal(store.activateConnection('qas').ok, true);
    assert.deepEqual(adt.connectedIds(), [], '切换系统后不能复用上一个系统的会话');
    assert.equal(config.activeConnectionId(), 'qas');
});

test('删除连接同样清空连接池', async () => {
    created = [];
    assert.equal(store.saveConnection(connection({ id: 'dev' })).ok, true);
    assert.equal(store.saveConnection(connection({ id: 'tmp1', url: 'https://tmp.example:44300' })).ok, true);
    await adt.getClient('tmp1');
    assert.equal(store.deleteConnection('tmp1').ok, true);
    assert.deepEqual(adt.connectedIds(), []);
});
