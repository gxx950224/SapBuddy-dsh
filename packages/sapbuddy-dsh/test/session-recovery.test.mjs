import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// 连接切换/会话过期的回归测试：只加载 adtManager.js，把客户端工厂、配置与
// 执行上下文（取消信号）替换成可控替身，不触网、不依赖真实 SAP。

const base = new URL('../dist/sap-tools/', import.meta.url);
const state = { config: null, factory: null };

const stubs = {
    './execution.js': {
        executionSignal: () => undefined,
        checkCancelled: () => {},
        runCleanup: (fn) => fn(),
        waitForReady: (p) => p,
    },
    './http-client.js': {
        createManagedAdtClient: () => { throw new Error('本测试应通过 __setClientFactoryForTest 注入客户端'); },
    },
    './config.js': { getConfig: () => state.config, reloadConfig: () => state.config },
    'abap-adt-api': {
        createSSLConfig: () => ({}),
        session_types: { stateful: 'stateful', stateless: 'stateless', keep: '' },
    },
};

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

const adt = await load('adtManager.js');
await adt.evaluate();
const {
    getClient, ensureFreshSession, resetClients, runWriteWithRecovery,
    isCsrfError, isConnectionError, connectedIds, __setClientFactoryForTest,
    __setSessionFreshAtForTest,
} = adt.namespace;

const csrfError = (message = 'CSRF 令牌验证失败') => {
    const err = new Error(message);
    Object.defineProperty(err, 'typeID', { get: () => Symbol.for('BAD CSRF') });
    return err;
};

/** 每个 test 用独立连接 id，避免池化客户端互相影响 */
let created = [];
let plans = [];
function setup(connId, plan = {}) {
    created = [];
    plans = [];
    resetClients();
    state.config = {
        connections: [{
            id: connId, url: 'https://dev.example:44300', client: '100',
            username: 'BC01', password: 'secret', language: 'ZH', authMethod: 'basic',
        }],
        security: { readOnly: false },
    };
    __setClientFactoryForTest((conf) => {
        const plan = plans.shift() ?? {};
        const client = {
            conf,
            logins: 0,
            stateful: 'stateless',
            async login() {
                client.logins++;
                if (client.failNextLogin) {
                    client.failNextLogin = false;
                    throw new Error('HTTP 401');
                }
                if (plan.loginError) throw plan.loginError;
            },
            async setObjectSource() {
                if (plan.csrfError) throw plan.csrfError;
                return '✅ saved';
            },
            async getObjectSource() {
                return '<source/>';
            },
        };
        created.push(client);
        return client;
    });
}

test('getClient 首次登录一次；紧接着的 ensureFreshSession 复用同一会话', async () => {
    setup('dev-reuse');
    const client = await getClient('dev-reuse');
    assert.equal(client.logins, 1);
    assert.deepEqual(connectedIds(), ['dev-reuse']);

    await ensureFreshSession('dev-reuse');
    assert.equal(created.length, 1, '不应重建客户端');
    assert.equal(client.logins, 1, '会话新鲜时不应重复登录');
});

test('ensureFreshSession 会先把残留的 stateful 压回 stateless，再按需重新登录', async () => {
    setup('dev-stale');
    const client = await getClient('dev-stale');
    client.stateful = 'stateful';

    // 模拟空闲 10 分钟（超过 5 分钟复用窗口）后的第一次写
    __setSessionFreshAtForTest('dev-stale', Date.now() - 10 * 60_000);
    await ensureFreshSession('dev-stale');

    assert.equal(client.stateful, 'stateless', '写序列前必须回到 stateless，否则 SDK 不会自动重建');
    assert.equal(client.logins, 2, '会话过期时必须重新登录换新 CSRF 令牌');
    assert.equal(created.length, 1, '重登录复用同一个客户端对象（工具里已持有它）');

    // 刚刷新过的会话要算"新鲜"，紧接着的写不能再登录一次
    await ensureFreshSession('dev-stale');
    assert.equal(client.logins, 2, '刷新成功必须记录会话新鲜度');
});

test('登录失败时不保留坏会话，下一次调用重新创建客户端', async () => {
    setup('dev-login-fail');
    const client = await getClient('dev-login-fail');
    client.failNextLogin = true; // 会话过期后重新登录失败（例如口令被改）
    __setSessionFreshAtForTest('dev-login-fail', Date.now() - 10 * 60_000);

    await assert.rejects(() => ensureFreshSession('dev-login-fail'), /HTTP 401/);
    assert.deepEqual(connectedIds(), [], '登录失败必须把客户端移出池');

    await getClient('dev-login-fail');
    assert.equal(created.length, 2);
});

test('写操作抛 CSRF 异常时自动丢弃会话并整体重试一次', async () => {
    setup('dev-csrf');
    plans.push({ csrfError: csrfError() }); // 池里的客户端第一次写就 CSRF 失败
    await getClient('dev-csrf');

    const result = await runWriteWithRecovery('dev-csrf', async () => {
        const client = await getClient('dev-csrf');
        return client.setObjectSource('/sap/bc/adt/programs/programs/ztest', 'x');
    });

    assert.equal(result, '✅ saved');
    assert.equal(created.length, 2, 'CSRF 失败后必须重建连接再重试');
    assert.equal(created[1].logins, 1);
});

test('写工具把 CSRF 错误当字符串返回时同样自动重试', async () => {
    setup('dev-csrf-text');
    await getClient('dev-csrf-text');
    let attempts = 0;

    const result = await runWriteWithRecovery('dev-csrf-text', async () => {
        attempts++;
        return attempts === 1 ? '编辑失败: CSRF 令牌验证失败\n\n可能的原因：…' : '✅ 替换成功';
    });

    assert.equal(result, '✅ 替换成功');
    assert.equal(attempts, 2);
    assert.equal(created.length, 2, '文本形式的 CSRF 失败也要换新连接');
});

test('非 CSRF 的业务失败不重试（避免重复写入）', async () => {
    setup('dev-business');
    await getClient('dev-business');
    let attempts = 0;
    const result = await runWriteWithRecovery('dev-business', async () => {
        attempts++;
        return '编辑失败: oldString 未唯一匹配';
    });
    assert.equal(attempts, 1);
    assert.match(result, /oldString/);

    const businessErr = new Error('对象被其他用户锁定');
    await assert.rejects(
        () => runWriteWithRecovery('dev-business', async () => { throw businessErr; }),
        /锁定/
    );
    // 没有重试 ⇒ 池里仍是同一个客户端，没有被作废重连
    assert.deepEqual(connectedIds(), ['dev-business']);
    assert.equal(created.length, 1);
});

test('已经成功写过一个方法后，再出现 CSRF 文本也不重试（避免重复写入/残留锁）', async () => {
    setup('dev-partial');
    await getClient('dev-partial');
    let attempts = 0;
    const result = await runWriteWithRecovery('dev-partial', async () => {
        attempts++;
        const client = await getClient('dev-partial');
        await client.setObjectSource('/sap/bc/adt/programs/programs/ztest', 'x');
        // 保存已成功，随后解锁/激活阶段才报 CSRF：绝不能重放整个写
        return '编辑失败: CSRF 令牌验证失败\n\n可能的原因：…';
    });
    assert.equal(attempts, 1);
    assert.match(result, /CSRF/);
    assert.equal(created.length, 1, 'SAP 侧已有改动时不得重建连接重试');
});

test('返回值显示已保存时不重试（即使文本里带"会话已失效"告警）', async () => {
    setup('dev-landed');
    await getClient('dev-landed');
    let attempts = 0;
    const result = await runWriteWithRecovery('dev-landed', async () => {
        attempts++;
        return '✅ 替换成功并已保存到 SAP（自检确认新内容已写入）\n⚠️ 会话已失效，请重新确认连接';
    });
    assert.equal(attempts, 1);
    assert.match(result, /替换成功/);
    assert.equal(created.length, 1);
});

test('重试前若连接配置被改动（用户切了系统），放弃重试', async () => {
    setup('dev-epoch');
    await getClient('dev-epoch');
    let attempts = 0;
    const result = await runWriteWithRecovery('dev-epoch', async () => {
        attempts++;
        resetClients(); // 模拟写一半时设置页保存/切换了连接
        return '编辑失败: CSRF 令牌验证失败';
    });
    assert.equal(attempts, 1, '配置变了就不能拿旧 payload 重试到新系统');
    assert.match(result, /CSRF/);
    assert.deepEqual(connectedIds(), []);
});

test('resetClients 让连接配置变更后不再复用旧会话', async () => {
    setup('dev-reset');
    await getClient('dev-reset');
    assert.deepEqual(connectedIds(), ['dev-reset']);

    resetClients(); // 模拟设置页切换/保存连接

    assert.deepEqual(connectedIds(), []);
    const client = await getClient('dev-reset');
    assert.equal(created.length, 2, '配置变更后必须重新登录（新 cookie + 新 CSRF 令牌）');
    assert.equal(client.logins, 1);
});

test('读方法成功不算"已落库"：随后 CSRF 仍应重试', async () => {
    setup('dev-read-ok');
    await getClient('dev-read-ok');
    let attempts = 0;
    const result = await runWriteWithRecovery('dev-read-ok', async () => {
        attempts++;
        const client = await getClient('dev-read-ok');
        await client.getObjectSource(); // 只读方法（READ_METHODS 白名单）
        return attempts === 1 ? '编辑失败: CSRF 令牌验证失败' : '✅ 替换成功';
    });
    assert.equal(attempts, 2, '读成功不改变"SAP 侧还没有改动"的判断');
    assert.equal(result, '✅ 替换成功');
    assert.equal(created.length, 2);
});

test('会话维护方法（login）成功不算"已落库"：随后 CSRF 仍应重试', async () => {
    setup('dev-login-only');
    await getClient('dev-login-only');
    let attempts = 0;
    const result = await runWriteWithRecovery('dev-login-only', async () => {
        attempts++;
        const client = await getClient('dev-login-only');
        await client.login(); // 会话维护，不代表数据已写入
        return attempts === 1 ? '编辑失败: CSRF 令牌验证失败' : '✅ 替换成功';
    });
    assert.equal(attempts, 2, '重登录不能被误判成已落库');
    assert.equal(result, '✅ 替换成功');
});

test('只有"会话已失效"字样、没有 CSRF 令牌校验失败时不重试', async () => {
    setup('dev-session-text');
    await getClient('dev-session-text');
    let attempts = 0;
    const result = await runWriteWithRecovery('dev-session-text', async () => {
        attempts++;
        return '编辑失败: 会话已过期，请检查连接';
    });
    assert.equal(attempts, 1, '会话失效不保证请求未执行，不能据此重放写操作');
    assert.match(result, /会话已过期/);
    assert.equal(created.length, 1);
});

test('CSRF 异常被识别为连接级故障（SDK 的 AdtCsrfException 没有 status）', () => {
    const err = csrfError();
    assert.equal(isCsrfError(err), true);
    assert.equal(isConnectionError(err), true);
    assert.equal(isCsrfError(new Error('CSRF token validation failed')), true);
    assert.equal(isConnectionError(new Error('对象被其他用户锁定')), false);
    assert.equal(isCsrfError(undefined), false);
});
