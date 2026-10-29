import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 设置页浏览器 bundle 的冒烟测试：手改/重建 dist/client.js 后必须仍能被 DSH 模块加载器
// 注册、能通过伪装 React 渲染出设置区块。曾经踩过的坑（地址支持 http、客户端号提示、
// 自签证书开关）都在这里钉住，避免下次重建把文案改回去。

const code = readFileSync(new URL('../dist/client.js', import.meta.url), 'utf8');

const hookState = [];
const calls = [];
const React = {
    useState: (init) => { const pair = [init, () => {}]; hookState.push(pair); return pair; },
    useEffect: () => {},
    useCallback: (fn) => fn,
    createElement: (type, props, ...children) => { calls.push({ type, props }); return { type, props, children }; },
};

const sandbox = { window: {}, console, require: undefined };
sandbox.window.__ModuleLoader__ = { load: (spec) => { sandbox.__spec = spec; } };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'client.js' });

const spec = sandbox.__spec;
assert.ok(spec, 'bundle 必须通过 window.__ModuleLoader__.load 注册');
assert.equal(spec.id, 'sapbuddy-dsh');

const exportsObj = spec.factory((id) => (id === 'react' ? React : {}));
let Section;
exportsObj.apply({
    slots: {
        inject: (_name, fn) => fn(),
        register: (_spec, Comp) => { Section = Comp; return () => {}; },
    },
});
assert.equal(typeof Section, 'function');

const tree = Section({});
const json = JSON.stringify(tree);

test('设置区块能渲染（bundle 结构没被改坏）', () => {
    assert.ok(json.includes('SAP 连接'));
    assert.match(json, /\uFF0B \u6DFB\u52A0\u8FDE\u63A5|添加连接/);
});

test('顶部说明写明 http 用于 8000、https 用于 44300', () => {
    assert.match(json, /http:\/\/ 用于 ICM HTTP 端口（常见 8000）/);
    assert.match(json, /https:\/\/ 用于 HTTPS 端口（常见 44300）/);
});

// 以下文案只出现在"编辑连接"表单里，表单按需渲染，因此直接断言 bundle 文本。
// 先把 \uXXXX 还原成中文，断言才可读。
const bundleText = code.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

test('地址：协议下拉 + 主机 + 端口，灰字固定 https://主机:44300，无真实 IP', () => {
    assert.match(bundleText, /"https:\/\/主机:44300"/);
    assert.match(bundleText, /https: "44300", http: "8000"/);
    assert.match(code, /"option"/);
    assert.doesNotMatch(bundleText, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    assert.doesNotMatch(bundleText, /http\(s\):\/\/host:port/);
});

test('客户端号要求与系统一致，语言提示填 EN', () => {
    assert.match(bundleText, /客户端号（3 位，必须与系统一致）/);
    assert.match(bundleText, /登录语言（不确定填 EN）/);
});

test('提供自签证书开关（内部系统 https 用）', () => {
    assert.match(bundleText, /允许自签名证书/);
    assert.match(code, /type: "checkbox"/);
    assert.match(code, /allowSelfSigned/);
    // 编辑表单是"按需渲染"但元素会被构造，断言确实生成了一个 checkbox 输入
    const checkbox = calls.find((c) => c.type === 'input' && c.props?.type === 'checkbox');
    assert.ok(checkbox, '必须构造出 allowSelfSigned 复选框');
    assert.equal(checkbox.props.checked, true);
});

test('自签证书开关只在 HTTPS 下出现', () => {
    assert.match(code, /isHttp \? null : React\.createElement\("label"/);
});
