import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { z } from 'zod';

// manage_text_elements 对 FUGR 必须本地拦截，不发 SAP 请求；示例程序名要取函数组短名。

const hits = { getClient: 0, textElementsUrl: 0, getTextElements: 0, resolveConnectionId: 0 };

function matchFunctionGroupProgram(name) {
    const upper = (name || '').toUpperCase();
    if (upper.startsWith('SAPL') && upper.length > 4) return { fgName: upper.slice(4), isMain: true };
    if (upper.startsWith('L') && upper.length > 4) {
        const rest = upper.slice(1);
        if (/^(TOP|[A-Z][0-9X]{2})$/i.test(rest.slice(-3))) {
            return { fgName: rest.slice(0, -3), isMain: false };
        }
    }
    return undefined;
}

const stubs = {
    zod: { z, default: z },
    'abap-adt-api': {
        session_types: { stateful: 'stateful', stateless: 'stateless', keep: '' },
        textElementsUrl(...args) {
            hits.textElementsUrl++;
            return `/fake/${args.join('/')}`;
        },
    },
    '../adtManager.js': {
        getClient: async () => {
            hits.getClient++;
            return {
                getTextElements: async () => {
                    hits.getTextElements++;
                    return { textElements: [] };
                },
            };
        },
    },
    './shared.js': {
        resolveConnectionId: async () => { hits.resolveConnectionId++; return 'dev'; },
        toToolError: (e) => String(e),
        escapeXmlAttr: (s) => String(s ?? ''),
        connectionIdSchema: z.string().optional(),
        matchFunctionGroupProgram,
    },
};

const base = new URL('../dist/sap-tools/tools/', import.meta.url);
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

const loaded = await load('transportText.js');
await loaded.evaluate();
const { textElementsTool } = loaded.namespace;

function resetHits() {
    hits.getClient = 0;
    hits.textElementsUrl = 0;
    hits.getTextElements = 0;
    hits.resolveConnectionId = 0;
}

function assertLocalFugr(result, expectedInclude) {
    assert.match(result, /不支持按函数组/);
    assert.match(result, /未发出任何 SAP 请求/);
    assert.match(result, new RegExp(expectedInclude));
    assert.doesNotMatch(result, /LLZBCG033I01I01/);
    assert.equal(hits.getClient, 0, '不得 getClient');
    assert.equal(hits.textElementsUrl, 0, '不得调用 textElementsUrl');
    assert.equal(hits.getTextElements, 0, '不得发 SAP 请求');
    assert.equal(hits.resolveConnectionId, 0, '不得解析连接');
}

test('FUGR 组名 ZBCG033 本地拦截，示例为 LZBCG033I01，不发请求', async () => {
    resetHits();
    const result = await textElementsTool.execute({ action: 'read', objectName: 'ZBCG033', objectType: 'FUGR' });
    assertLocalFugr(result, 'LZBCG033I01');
    assert.match(result, /ZBCG033/);
});

test('SAPLZBCG033 归一化成 FUGR 后同样拦截，示例为 LZBCG033I01', async () => {
    resetHits();
    const result = await textElementsTool.execute({ action: 'read', objectName: 'SAPLZBCG033', objectType: 'PROG' });
    assertLocalFugr(result, 'LZBCG033I01');
});

test('FUGR + include 名 LZBCG033I01 取出短名，示例仍是 LZBCG033I01', async () => {
    resetHits();
    const result = await textElementsTool.execute({ action: 'read', objectName: 'LZBCG033I01', objectType: 'FUGR' });
    assertLocalFugr(result, 'LZBCG033I01');
});

test('非 FUGR 对象不拦截，会走 getClient', async () => {
    resetHits();
    const result = await textElementsTool.execute({ action: 'read', objectName: 'ZSOMEPROG', objectType: 'PROG' });
    assert.doesNotMatch(String(result), /不支持按函数组/);
    assert.equal(hits.resolveConnectionId, 1);
    assert.equal(hits.getClient, 1);
    // textElementsUrl 是 execute 内动态 import，VM stub 可能绕过计数；能走到 getClient 且不是本地 FUGR 提示即可
});
