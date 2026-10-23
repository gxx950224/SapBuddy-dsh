import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { runToolExecution, recordFailure } from '../dist/sap-tools/execution.js';

// Load the shipped modules; replace only SAP/network and unrelated tool dependencies.
const base = new URL('../dist/sap-tools/tools/', import.meta.url);
let currentClient;
const schema = new Proxy(() => schema, { get: () => schema });
const shared = {
    getOptimalObjectURI: (_type, uri) => uri.endsWith('/source/main') ? uri : `${uri}/source/main`,
    sanitizeErrMsg: err => String(err instanceof Error ? err.message : err).replace(/<stack>[\s\S]*?<\/stack>/gi, ' <堆栈已省略>').slice(0, 300),
    toToolError: err => { recordFailure(err); return String(err); },
    resolveConnectionId: async id => id ?? 'test',
    requireObject: async (_conn, name) => object(name),
    readSourceSmart: async () => currentClient.source,
    connectionIdSchema: schema, objectTypeSchema: schema,
    findObject: () => {}, escapeXmlAttr: x => x, normalizeFunctionGroupIncludeUri: () => {},
};
const stubs = {
    zod: { z: schema },
    'abap-adt-api': { session_types: { stateful: 'stateful' } },
    '../adtManager.js': { getClient: async () => currentClient },
    '../execution.js': { recordFailure },
    '../code-policy.js': { scanCodeIssues: () => [], validateSourceMode: () => {} },
    '../taskTransport.js': { getActiveRequest: () => {}, setActiveRequest: () => {} },
    './fmoduleInterface.js': Object.fromEntries(['parseFunctionModuleParams', 'normalizeFunctionModuleParams', 'normalizeFormIncludeSource', 'isFmoduleSourceChannel', 'detectCommentParamBlock', 'escapeOpenSqlHostVars', 'FM_KINDS'].map(key => [key, () => {}])),
    './shared.js': shared,
};
const modules = new Map();
async function load(name) {
    if (modules.has(name)) return modules.get(name);
    let mod;
    if (stubs[name] || name.startsWith('node:')) {
        const exports = stubs[name] ?? await import(name);
        mod = new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        });
    } else {
        mod = new vm.SourceTextModule(await readFile(new URL(name, base), 'utf8'), { identifier: name });
    }
    modules.set(name, mod);
    await mod.link(load);
    return mod;
}
const activation = await load('./activationResult.js');
await activation.evaluate();
const writes = await load('./writeTools.js');
await writes.evaluate();
const { verifyActivation, mergeActivationResults } = activation.namespace;
const { activateTool } = writes.namespace;
const object = (name = 'ZTEST') => ({ 'adtcore:name': name, 'adtcore:type': 'PROG/P', 'adtcore:uri': `/sap/bc/adt/programs/programs/${name.toLowerCase()}` });
const ok = () => ({ success: true, messages: [], inactive: [] });
const bad = (inactive = []) => ({ success: false, messages: [{ type: 'E', shortText: 'INCLUDE ZBCX_PUB_CONV_CONS activation error', line: 1 }], inactive });
const report = () => mergeActivationResults([bad(), ok()], ['批量 INCLUDE', '主程序']);
function client(options = {}) {
    const source = "REPORT ztest.\nINCLUDE ZBCX_PUB_CONV_CONS.\n";
    return {
        source,
        getObjectSource: async (_uri, { version }) => version === 'inactive' ? source : options.active ?? source,
        syntaxCheck: async () => [],
        inactiveObjects: async () => options.pending ?? [],
        ...options,
    };
}

test('INCLUDE error is reconciled when current source is active; raw diagnostic remains', async () => {
    const result = await verifyActivation(client(), object(), async () => report());
    assert.equal(result.success, true);
    assert.equal(result.recovered, true);
    assert.equal(result.verification, 'matched');
    assert.equal(result.stages[1].success, false);
    assert.match(result.messages[0].shortText, /ZBCX_PUB_CONV_CONS/);
});

test('thrown activation error still runs post-activation verification', async () => {
    const result = await verifyActivation(client(), object(), async () => { throw new Error('response lost'); });
    assert.equal(result.success, true);
    assert.equal(result.recovered, true);
});

test('old active source never clears a failure', async () => {
    const result = await verifyActivation(client({ active: 'REPORT old.' }), object(), async () => report());
    assert.equal(result.success, false);
    assert.equal(result.verification, 'mismatch');
});

for (const [label, pending] of [
    ['target', [{ object: object() }]],
    ['INCLUDE with unchanged main source', [{ object: { 'adtcore:name': 'zbcx_pub_conv_cons', 'adtcore:type': 'PROG/I' } }]],
    ['target URI without name', [{ object: { 'adtcore:uri': '/SAP/BC/ADT/PROGRAMS/PROGRAMS/ZTEST/source/main?version=inactive' } }]],
]) test(`does not recover when ${label} remains inactive`, async () => {
    const result = await verifyActivation(client({ pending }), object(), async () => report());
    assert.equal(result.success, false);
    assert.equal(result.verification, 'pending');
});

test('reported inactive object must be absent from the live list', async () => {
    const other = { object: object('ZOTHER') };
    const result = await verifyActivation(client({ pending: [other] }), object(), async () => mergeActivationResults([bad([other])], ['include']));
    assert.equal(result.success, false);
});

test('stale response inactive list does not prevent confirmed recovery', async () => {
    const result = await verifyActivation(client(), object(), async () => mergeActivationResults([bad([{ object: object() }])], ['activation']));
    assert.equal(result.success, true);
    assert.equal(result.inactive.length, 0);
});

test('unrelated inactive objects do not block the target', async () => {
    const result = await verifyActivation(client({ pending: [{ object: object('ZUNRELATED') }] }), object(), async () => report());
    assert.equal(result.success, true);
});

for (const method of ['getObjectSource', 'inactiveObjects']) test(`failed ${method} verification preserves the failure`, async () => {
    const c = client();
    const original = c[method];
    c[method] = async (...args) => {
        if (method === 'getObjectSource' && args[1].version === 'inactive') return original(...args);
        throw new Error('403 forbidden');
    };
    const result = await verifyActivation(c, object(), async () => report());
    assert.equal(result.success, false);
    assert.equal(result.verification, 'unavailable');
});

test('invalid inactive list does not turn an error into success', async () => {
    const result = await verifyActivation(client({ inactiveObjects: async () => undefined }), object(), async () => report());
    assert.equal(result.verification, 'unavailable');
});

test('successful request keeps the existing source verification', async () => {
    const result = await verifyActivation(client(), object(), async () => mergeActivationResults([ok()], ['activation']));
    assert.equal(result.success, true);
    assert.equal(result.recovered, undefined);
    assert.equal(result.verification, 'matched');
});

test('syntax errors stop activation and cannot be reconciled from an old active version', async () => {
    let called = false;
    const result = await verifyActivation(client({ syntaxCheck: async () => [{ severity: 'E', line: 1, text: 'bad syntax' }] }), object(), async () => { called = true; return report(); });
    assert.equal(called, false);
    assert.equal(result.success, false);
});

test('inactive source 404 fallback is allowed, 403 is not', async () => {
    for (const status of [404, 403]) {
        const c = client();
        c.getObjectSource = async (_uri, { version }) => {
            if (version === 'inactive') throw Object.assign(new Error('source unavailable'), { status });
            return c.source;
        };
        const result = await verifyActivation(c, object(), async () => report());
        assert.equal(result.success, status === 404);
    }
});

test('unsupported metadata objects do not get source-based recovery', async () => {
    const result = await verifyActivation(client(), { ...object(), 'adtcore:type': 'TABL/DT' }, async () => report());
    assert.equal(result.success, false);
    assert.equal(result.verification, 'not_applicable');
});

async function execute(name, options = {}) {
    currentClient = client({
        ...options,
        activate: async arg => {
            if (Array.isArray(arg)) throw new Error('INCLUDE ZBCX_PUB_CONV_CONS activation error');
            return ok();
        },
    });
    return runToolExecution(undefined, () => activateTool.execute({ objectName: name, objectType: 'PROG/P', connectionId: 'test' }));
}

test('tool clears the object streak and audit failure after recovery, then counts real failures anew', async () => {
    for (let i = 0; i < 2; i++) {
        const result = await execute('ZCOUNT', { active: 'old source' });
        assert.match(result.value, /激活失败/);
        assert.equal(result.failures.length, 1);
    }
    const recovered = await execute('ZCOUNT');
    assert.match(recovered.value, /连续失败计数已清零/);
    assert.match(recovered.value, /ZBCX_PUB_CONV_CONS/);
    assert.equal(recovered.failures.length, 0);
    for (let i = 1; i <= 3; i++) {
        const result = await execute('ZCOUNT', { active: 'old source' });
        assert.equal(result.failures.length, 1);
        assert.equal(result.value.includes('连续激活失败已达 3 次'), i === 3);
    }
    const afterLimit = await execute('ZCOUNT');
    assert.match(afterLimit.value, /连续失败计数已清零/);
    assert.equal(afterLimit.failures.length, 0);
});

test('repeated INCLUDE false alarms never reach the retry threshold', async () => {
    for (let i = 0; i < 4; i++) {
        const result = await execute('ZREPEATED');
        assert.match(result.value, /激活成功/);
        assert.equal(result.failures.length, 0);
        assert.doesNotMatch(result.value, /已强制停止重试/);
    }
});
