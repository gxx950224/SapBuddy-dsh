import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// L1 传输层自愈：stub axios 与 ADTClient，验证 Managed.request
// 在 400 Session timed out 时 login 再重试，业务 400 / stateful 不重试，失败只重试一次。

const session_types = { stateful: 'stateful', stateless: 'stateless', keep: '' };

class FakeADTClient {
    constructor(http, username, password, client, language, options) {
        this.http = http;
        this.username = username;
        this._stateful = session_types.stateless;
        this.loginCalls = 0;
        this.superRequestCalls = 0;
        this.cookie = new Map();
        this._requestImpl = async () => ({ status: 200, statusText: 'OK', body: 'ok' });
    }
    get stateful() { return this._stateful; }
    set stateful(value) { this._stateful = value; }
    get isStateful() { return this._stateful === session_types.stateful; }
    async login() {
        this.loginCalls++;
        if (this.loginShouldFail) throw new Error('login failed');
    }
    async request(path, config) {
        this.superRequestCalls++;
        return this._requestImpl(path, config, this.superRequestCalls);
    }
}

const stubs = {
    axios: {
        default: {
            create() {
                return { async request() { return { data: '', status: 200, statusText: 'OK', headers: {} }; } };
            },
            isAxiosError() { return false; },
        },
    },
    'abap-adt-api': { ADTClient: FakeADTClient, session_types },
    'abap-adt-api/build/AdtHTTP.js': { HttpClientException: class HttpClientException extends Error {} },
    './execution.js': { executionSignal: () => undefined },
};

const base = new URL('../dist/sap-tools/', import.meta.url);
const modules = new Map();
async function load(name) {
    if (modules.has(name)) return modules.get(name);
    let mod;
    if (stubs[name]) {
        const exports = stubs[name];
        mod = new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        });
    } else if (name.startsWith('node:')) {
        const exports = await import(name);
        const keys = Object.keys(exports);
        mod = new vm.SyntheticModule(keys, function () {
            for (const key of keys) this.setExport(key, exports[key]);
        });
    } else {
        mod = new vm.SourceTextModule(await readFile(new URL(name, base), 'utf8'), { identifier: name });
    }
    modules.set(name, mod);
    await mod.link(load);
    return mod;
}

const loaded = await load('http-client.js');
await loaded.evaluate();
const { createManagedAdtClient, isSessionBroken } = loaded.namespace;

function session400() {
    const err = new Error('Request failed with status code 400');
    err.status = 400;
    err.response = { status: 400, statusText: 'Session timed out', body: '' };
    return err;
}
function business400() {
    const err = new Error('Request failed with status code 400');
    err.status = 400;
    err.response = { status: 400, statusText: 'Bad Request', body: 'Invalid object name' };
    return err;
}

function newClient() {
    return createManagedAdtClient(
        'https://example.invalid:44300',
        'USER',
        'secret',
        '200',
        'ZH',
        { timeout: 1000 },
    );
}

test('isSessionBroken 识别会话 400，不识别业务 400', () => {
    assert.equal(isSessionBroken(session400()), true);
    assert.equal(isSessionBroken(business400()), false);
    const sdkShape = new Error('Error 400:Session timed out');
    sdkShape.err = 400;
    assert.equal(isSessionBroken(sdkShape), true);
});

test('400 Session timed out → login 再调、请求重试成功', async () => {
    const client = newClient();
    await client.login();
    client._requestImpl = async (_p, _c, n) => {
        if (n === 1) throw session400();
        return { status: 200, statusText: 'OK', body: 'graph' };
    };
    const r = await client.request('/sap/bc/adt/compatibility/graph');
    assert.equal(r.status, 200);
    assert.equal(client.loginCalls, 2, '初次 login + 自愈 login');
    assert.equal(client.superRequestCalls, 2, '失败一次后重试成功');
});

test('普通业务 400 → 直接抛、不重试', async () => {
    const client = newClient();
    await client.login();
    client._requestImpl = async () => { throw business400(); };
    await assert.rejects(() => client.request('/x'), /status code 400/);
    assert.equal(client.loginCalls, 1, '不应因业务 400 重登');
    assert.equal(client.superRequestCalls, 1, '不应重试');
});

test('stateful 时即使会话 400 也不重试', async () => {
    const client = newClient();
    await client.login();
    client.stateful = session_types.stateful;
    client._requestImpl = async () => { throw session400(); };
    await assert.rejects(() => client.request('/x'), /status code 400/);
    assert.equal(client.loginCalls, 1, 'stateful 下不重登');
    assert.equal(client.superRequestCalls, 1, 'stateful 下不重试');
});

test('第二次仍失败 → 抛原始错误，不无限循环', async () => {
    const client = newClient();
    await client.login();
    const original = session400();
    client._requestImpl = async () => { throw original; };
    const thrown = await client.request('/x').then(
        () => { throw new Error('should have thrown'); },
        (e) => e,
    );
    assert.equal(thrown, original, '必须抛出原始错误而不是包装或新错误');
    assert.equal(client.loginCalls, 2, '只再 login 一次');
    assert.equal(client.superRequestCalls, 2, '只重试一次，不无限循环');
});
