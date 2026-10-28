/* sapbuddy-dsh client bundle (esbuild) */
window.__ModuleLoader__.load({
  id: "sapbuddy-dsh",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var React = require("react");
var { useState, useEffect, useCallback } = React;
var API = "/api/sapbuddy/connections";
async function listConnections() {
  const r = await fetch(API);
  const j = await r.json();
  return j.connections ?? [];
}
async function post(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  let j;
  try {
    j = await r.json();
  } catch {
    return { ok: false, error: r.status === 404 ? "\u8BBE\u7F6E\u670D\u52A1\u672A\u52A0\u8F7D\uFF08API 404\uFF09\u2014\u2014\u8BF7\u91CD\u542F dsh web \u540E\u91CD\u8BD5" : "\u54CD\u5E94\u89E3\u6790\u5931\u8D25\uFF08HTTP " + r.status + "\uFF09" };
  }
  if (!r.ok && !("ok" in j)) j = { ok: false, error: "HTTP " + r.status + (j.error ? ": " + j.error : "") };
  return j;
}
var S = {
  wrap: { maxWidth: 720, display: "flex", flexDirection: "column", gap: 12, color: "var(--dsw-alias-label-primary)" },
  title: { margin: 0, fontSize: 16, fontWeight: 500, lineHeight: "24px" },
  intro: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
  msg: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-success-primary)" },
  err: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-state-error-primary)" },
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 },
  card: { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 12, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  name: { fontSize: 14, fontWeight: 500, lineHeight: "22px", margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  badge: { border: "1px solid var(--dsw-alias-border-l3)", color: "var(--dsw-alias-label-secondary)", borderRadius: 4, padding: "1px 6px", fontSize: 11, lineHeight: "16px", flex: "none" },
  badgeActive: { background: "var(--dsw-alias-state-success-primary)", borderColor: "var(--dsw-alias-state-success-primary)", color: "var(--dsw-alias-label-primary-foreground)" },
  meta: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  testMsg: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap" },
  actions: { display: "flex", gap: 6, marginLeft: "auto", flex: "none" },
  btn: { height: 28, padding: "0 10px", borderRadius: 14, fontSize: 12, lineHeight: "18px", cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-primary)", font: "inherit" },
  btnPrimary: { background: "var(--dsw-alias-button-primary-fill)", color: "var(--dsw-alias-label-primary-foreground)", border: "none" },
  btnDanger: { color: "var(--dsw-alias-state-error-primary)" },
  editor: { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, background: "var(--dsw-alias-bg-module-platform)" },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 500, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)" },
  input: { height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", fontSize: 14, font: "inherit" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 },
  hint: { margin: 0, fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" }
};
var EMPTY = { language: "ZH", authMethod: "basic", ssl: { allowSelfSigned: true } };
function Section() {
  const [conns, setConns] = useState([]);
  const [mode, setMode] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [testResult, setTestResult] = useState({});
  const refresh = useCallback(async () => {
    try {
      setConns(await listConnections());
      setErr(null);
    } catch (e) {
      setErr("\u52A0\u8F7D\u8FDE\u63A5\u914D\u7F6E\u5931\u8D25: " + (e.message ?? e));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const set = (key) => (evt) => {
    const v = evt.target.type === "checkbox" ? evt.target.checked : evt.target.value;
    setDraft((d) => ({ ...d, [key]: v }));
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await post(API, { connection: draft });
      if (!r.ok) {
        setErr("\u4FDD\u5B58\u5931\u8D25: " + (r.error ?? "\u672A\u77E5\u9519\u8BEF"));
        setMsg(null);
        return;
      }
      setMsg("\u5DF2\u4FDD\u5B58\u8FDE\u63A5 " + r.id);
      setErr(null);
      setMode(null);
      setDraft({});
      refresh();
    } catch (e) {
      setErr("\u4FDD\u5B58\u5931\u8D25: " + (e.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  const doActivate = async (id) => {
    const r = await post(API + "/activate", { id });
    if (!r.ok) setErr(r.error ?? "\u5207\u6362\u5931\u8D25");
    else {
      setMsg("\u5DF2\u542F\u7528 " + id);
      setErr(null);
    }
    refresh();
  };
  const doDelete = async (id) => {
    if (!window.confirm("\u5220\u9664\u8FDE\u63A5 " + id + "\uFF1F")) return;
    const r = await post(API + "/delete", { id });
    if (!r.ok) setErr(r.error ?? "\u5220\u9664\u5931\u8D25");
    else {
      setMsg("\u5DF2\u5220\u9664 " + id);
      setErr(null);
    }
    refresh();
  };
  const doTest = async (id) => {
    const r = await post(API + "/test", { id });
    setTestResult((m) => ({ ...m, [id]: r.ok ? "\u2705 \u8FDE\u63A5\u6210\u529F\uFF08HTTP " + r.status + "\uFF09" : "\u274C " + (r.error ?? "\u6D4B\u8BD5\u5931\u8D25") }));
  };
  const startNew = () => {
    setMode("new");
    setDraft({ ...EMPTY });
  };
  const startEdit = (c) => {
    setMode(c.id);
    setDraft({ ...c, password: "" });
  };
  const input = (key, label, ph) => React.createElement("label", { className: void 0, style: S.field }, [
    React.createElement("span", { key: "l", style: S.label }, label),
    React.createElement("input", {
      key: "i",
      style: S.input,
      value: draft[key] ?? "",
      placeholder: ph ?? "",
      onChange: set(key)
    })
  ]);
  const connRow = (c) => React.createElement("li", { key: c.id, style: S.card }, [
    React.createElement("div", { key: "r", style: S.row }, [
      React.createElement("p", { key: "n", style: S.name }, c.name || c.id),
      c.active === true ? React.createElement("span", { key: "a", style: { ...S.badge, ...S.badgeActive } }, "\u5DF2\u542F\u7528") : React.createElement("span", { key: "a", style: S.badge }, "\u672A\u542F\u7528"),
      React.createElement("div", { key: "x", style: S.actions }, [
        React.createElement("button", { key: "t", style: S.btn, onClick: () => doTest(c.id) }, "\u6D4B\u8BD5"),
        c.active === true ? null : React.createElement("button", { key: "on", style: { ...S.btn, ...S.btnPrimary }, onClick: () => doActivate(c.id) }, "\u8BBE\u4E3A\u542F\u7528"),
        React.createElement("button", { key: "e", style: S.btn, onClick: () => startEdit(c) }, "\u7F16\u8F91"),
        React.createElement("button", { key: "d", style: { ...S.btn, ...S.btnDanger }, onClick: () => doDelete(c.id) }, "\u5220\u9664")
      ])
    ]),
    React.createElement(
      "p",
      { key: "m", style: S.meta },
      c.url + (c.client ? " \xB7 Client " + c.client : "") + " \xB7 " + c.username + (c.hasPassword ? " \xB7 \u5BC6\u7801\u5DF2\u8BBE\u7F6E" : " \xB7 \u672A\u8BBE\u7F6E\u5BC6\u7801")
    ),
    testResult[c.id] ? React.createElement("p", { key: "tr", style: S.testMsg }, testResult[c.id]) : null
  ]);
  const editor = React.createElement("div", { key: "editor", style: S.editor }, [
    React.createElement("div", { key: "g1", style: S.grid }, [
      input("id", "\u8FDE\u63A5 ID\uFF08\u552F\u4E00\uFF0C\u5982 dev/prod\uFF09", "dev"),
      input("name", "\u540D\u79F0", "\u5F00\u53D1\u7CFB\u7EDF"),
      input("url", "\u5730\u5740\uFF08http(s)://host:port\uFF09", "http://10.8.202.35:8000 \u6216 https://10.8.202.35:44300"),
      input("client", "\u5BA2\u6237\u7AEF\u53F7\uFF083 \u4F4D\uFF0C\u5FC5\u987B\u4E0E\u7CFB\u7EDF\u4E00\u81F4\uFF09", "100")
    ]),
    React.createElement("div", { key: "g2", style: S.grid }, [
      input("username", "\u7528\u6237\u540D", "YOUR_USER"),
      input("password", "\u5BC6\u7801\uFF08\u7F16\u8F91\u65F6\u7559\u7A7A\u4FDD\u6301\u539F\u5BC6\u7801\uFF09", "\u2022\u2022\u2022\u2022\u2022\u2022"),
      input("language", "\u767B\u5F55\u8BED\u8A00\uFF08\u4E0D\u786E\u5B9A\u586B EN\uFF09", "ZH"),
      input("authMethod", "\u8BA4\u8BC1\u65B9\u5F0F", "basic")
    ]),
    React.createElement("div", { key: "g3", style: S.grid }, [
      input("description", "\u63CF\u8FF0", "\u5F00\u53D1\u7CFB\u7EDF")
    ]),
    React.createElement("label", { key: "ssl", style: { ...S.field, flexDirection: "row", alignItems: "center", gap: 8 } }, [
      React.createElement("input", {
        key: "i",
        type: "checkbox",
        checked: !draft.ssl || draft.ssl.allowSelfSigned !== false,
        onChange: (evt) => setDraft((d) => ({ ...d, ssl: { ...(d.ssl || {}), allowSelfSigned: evt.target.checked } }))
      }),
      React.createElement("span", { key: "l", style: S.label }, "\u5141\u8BB8\u81EA\u7B7E\u540D\u8BC1\u4E66\uFF08\u5185\u90E8\u7CFB\u7EDF https \u7528\uFF09")
    ]),
    React.createElement(
      "p",
      { key: "hint", style: S.hint },
      "\u7AEF\u53E3\u5BF9\u5E94\u534F\u8BAE\uFF1ASAP \u7684 ICM HTTP \u7AEF\u53E3\uFF08\u5E38\u89C1 8000\uFF09\u7528 http://\uFF0CHTTPS \u7AEF\u53E3\uFF08\u5E38\u89C1 44300\uFF09\u7528 https://\u3002\u5BA2\u6237\u7AEF\u53F7\u5C31\u662F\u767B\u5F55\u5BA2\u6237\u7AEF\uFF08sap-client\uFF09\uFF0C\u586B\u9519\u4F1A\u8FD4\u56DE 401\uFF1B\u767B\u5F55\u8BED\u8A00\u4E0D\u786E\u5B9A\u65F6\u586B EN\u3002"
    ),
    React.createElement("div", { key: "acts", style: { display: "flex", gap: 8, justifyContent: "flex-end" } }, [
      React.createElement("button", { key: "c", style: S.btn, onClick: () => {
        setMode(null);
        setDraft({});
      } }, "\u53D6\u6D88"),
      React.createElement("button", { key: "s", style: { ...S.btn, ...S.btnPrimary }, disabled: busy, onClick: save }, busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58")
    ])
  ]);
  return React.createElement("div", { style: S.wrap }, [
    React.createElement("h3", { key: "t", style: S.title }, "SAP \u8FDE\u63A5"),
    React.createElement(
      "p",
      { key: "i", style: S.intro },
      "\u914D\u7F6E\u4E00\u4E2A\u6216\u591A\u4E2A SAP \u7CFB\u7EDF\u8FDE\u63A5\uFF08ADT\uFF09\u3002\u5207\u6362\u4E3A\u542F\u7528\u540E\uFF0CSapBuddy \u4F1A\u8BDD\u7684 SAP \u5DE5\u5177\u9ED8\u8BA4\u4F7F\u7528\u8BE5\u8FDE\u63A5\uFF1B\u5207\u6362\u540E\u9700\u5728\u4F1A\u8BDD\u4E2D\u5148\u8C03\u7528 get_connected_systems \u786E\u8BA4\u3002\u5BC6\u7801\u4EC5\u4FDD\u5B58\u5728\u672C\u673A\u914D\u7F6E\u6587\u4EF6\u3002\u5730\u5740\u8981\u5199\u5168\u534F\u8BAE\uFF1Ahttp:// \u7528\u4E8E ICM HTTP \u7AEF\u53E3\uFF08\u5E38\u89C1 8000\uFF09\uFF0Chttps:// \u7528\u4E8E HTTPS \u7AEF\u53E3\uFF08\u5E38\u89C1 44300\uFF09\u3002"
    ),
    msg ? React.createElement("p", { key: "m", style: S.msg }, msg) : null,
    err ? React.createElement("p", { key: "e", style: S.err }, err) : null,
    React.createElement("ul", { key: "l", style: S.list }, conns.map(connRow)),
    mode === null ? React.createElement("button", { key: "add", style: { ...S.btn, ...S.btnPrimary, height: 36, borderRadius: 18, padding: "0 14px" }, onClick: startNew }, "\uFF0B \u6DFB\u52A0\u8FDE\u63A5") : editor
  ]);
}
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "sapbuddy-connections",
    order: 90,
    label: () => "SAP \u8FDE\u63A5",
    inject: () => ({})
  }, Section));
}

    return module.exports;
  }
});
