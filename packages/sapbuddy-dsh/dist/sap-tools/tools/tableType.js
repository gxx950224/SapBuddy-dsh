/**
 * DDIC 表类型（TTYP / ADT 类型 TTYP/DA）定义：校验 + XML 生成 + 写入。
 * ADT 端点：/sap/bc/adt/ddic/tabletypes/{name}，Content-Type application/vnd.sap.adt.tabletype.v1+xml，
 * 根元素 <ttyp:tableType xmlns:ttyp="http://www.sap.com/dictionary/tabletype">。
 * 创建分两步：abap-adt-api createObject 只建默认壳（CHAR 行类型），再 lock → PUT 完整定义 → unlock。
 * <ttyp:rowType> 子元素必须按序：typeKind, typeName, builtInType(dataType,length,decimals), rangeType。
 */
import { session_types } from "abap-adt-api";
export const TTYP_CONTENT_TYPE = "application/vnd.sap.adt.tabletype.v1+xml";
export const TTYP_NAMESPACE = "http://www.sap.com/dictionary/tabletype";
export const TTYP_ROW_KINDS = ["dictionaryType", "predefinedAbapType", "refToDictionaryType", "refToClassOrInterfaceType"];
export const TTYP_ACCESS_TYPES = ["standard", "sorted", "hashed"];
export const TTYP_KEY_DEFINITIONS = ["standard", "rowType", "keyComponents", "empty"];
export const TTYP_KEY_KINDS = ["nonUnique", "unique"];
/** 内置 ABAP 类型（仅用于 rowTypeKind 自动判断，显式 rowTypeKind 以调用方为准） */
export const TTYP_BUILTIN_ROW_TYPES = new Set([
    "STRING", "XSTRING", "I", "INT8", "F", "P", "D", "T", "C", "N", "X", "B", "S",
    "DECFLOAT16", "DECFLOAT34", "UTCLONG",
]);
const LENGTH_REQUIRED = new Set(["C", "N", "X", "P"]);
const NAME_RE = /^(?:\/[A-Z0-9_]+\/)?[A-Z0-9_]{1,30}$/;
const COMP_RE = /^[A-Z][A-Z0-9_]{0,29}$/;
/** 校验并规范化表类型定义；有错误时返回 { errors } */
export function normalizeTableTypeDefinition(def) {
    const errors = [];
    const rowType = String(def?.rowType ?? "").trim().toUpperCase();
    if (!rowType)
        errors.push("缺少行类型 rowType（DDIC 结构/数据元素/表名，或内置类型如 STRING/C/I）");
    else if (!NAME_RE.test(rowType))
        errors.push(`行类型名不合法：${def.rowType}`);
    const rowTypeKind = def.rowTypeKind ?? (TTYP_BUILTIN_ROW_TYPES.has(rowType) ? "predefinedAbapType" : "dictionaryType");
    if (!TTYP_ROW_KINDS.includes(rowTypeKind))
        errors.push(`rowTypeKind 只能是 ${TTYP_ROW_KINDS.join("/")}`);
    if (rowTypeKind === "dictionaryType" && TTYP_BUILTIN_ROW_TYPES.has(rowType))
        errors.push(`${rowType} 是内置类型，rowTypeKind 应为 predefinedAbapType`);
    let length = def.length ?? 0;
    let decimals = def.decimals ?? 0;
    if (rowTypeKind === "predefinedAbapType") {
        if (LENGTH_REQUIRED.has(rowType) && !(length > 0))
            errors.push(`内置类型 ${rowType} 必须提供 length`);
        if (!Number.isInteger(length) || length < 0 || length > 262143)
            errors.push("length 必须是 0..262143 的整数");
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 14)
            errors.push("decimals 必须是 0..14 的整数");
        if (decimals > 0 && rowType !== "P")
            errors.push("只有 P 类型可设置 decimals");
    }
    else {
        length = 0;
        decimals = 0;
    }
    const accessType = def.accessType ?? "standard";
    if (!TTYP_ACCESS_TYPES.includes(accessType))
        errors.push(`accessType 只能是 ${TTYP_ACCESS_TYPES.join("/")}`);
    const keyDefinition = def.keyDefinition ?? "standard";
    if (!TTYP_KEY_DEFINITIONS.includes(keyDefinition))
        errors.push(`keyDefinition 只能是 ${TTYP_KEY_DEFINITIONS.join("/")}`);
    const keyKind = def.keyKind ?? (accessType === "hashed" ? "unique" : "nonUnique");
    if (!TTYP_KEY_KINDS.includes(keyKind))
        errors.push(`keyKind 只能是 ${TTYP_KEY_KINDS.join("/")}`);
    if (accessType === "standard" && keyKind === "unique")
        errors.push("标准表（standard）主键只能是 nonUnique");
    if (accessType === "hashed" && keyKind !== "unique")
        errors.push("哈希表（hashed）主键必须是 unique");
    if (keyDefinition === "empty" && accessType !== "standard")
        errors.push("空键（empty）只允许用于标准表（standard）");
    const keyComponents = (def.keyComponents ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    if (keyDefinition === "keyComponents") {
        if (keyComponents.length === 0)
            errors.push("keyDefinition=keyComponents 时必须提供 keyComponents（行结构的字段名）");
        if (rowTypeKind !== "dictionaryType")
            errors.push("用户定义键组件只适用于 DDIC 结构行类型（rowTypeKind=dictionaryType）");
        const bad = keyComponents.filter((c) => !COMP_RE.test(c));
        if (bad.length)
            errors.push(`键组件名不合法：${bad.join(", ")}`);
        if (new Set(keyComponents).size !== keyComponents.length)
            errors.push("键组件重复");
    }
    else if (keyComponents.length > 0) {
        errors.push("只有 keyDefinition=keyComponents 时才能指定 keyComponents");
    }
    if (errors.length)
        return { ok: false, errors };
    return { ok: true, value: { rowType, rowTypeKind, length, decimals, accessType, keyDefinition, keyKind, keyComponents } };
}
function esc(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const pad = (n, w) => String(Math.max(0, Math.trunc(n))).padStart(w, "0");
export function buildRowTypeXml(d) {
    const builtin = d.rowTypeKind === "predefinedAbapType";
    const typeName = builtin ? "<ttyp:typeName/>" : `<ttyp:typeName>${esc(d.rowType)}</ttyp:typeName>`;
    const dataType = builtin ? esc(d.rowType) : d.rowTypeKind === "dictionaryType" ? "STRU" : "";
    return (`<ttyp:rowType><ttyp:typeKind>${d.rowTypeKind}</ttyp:typeKind>${typeName}` +
        `<ttyp:builtInType><ttyp:dataType>${dataType}</ttyp:dataType><ttyp:length>${pad(d.length, 6)}</ttyp:length>` +
        `<ttyp:decimals>${pad(d.decimals, 6)}</ttyp:decimals></ttyp:builtInType><ttyp:rangeType/></ttyp:rowType>`);
}
export function buildPrimaryKeyXml(d) {
    const comps = d.keyDefinition === "keyComponents"
        ? `<ttyp:components ttyp:isVisible="true">${d.keyComponents
            .map((c) => `<ttyp:component ttyp:name="${esc(c)}"/>`)
            .join("")}</ttyp:components>`
        : `<ttyp:components ttyp:isVisible="false"/>`;
    return (`<ttyp:primaryKey ttyp:isVisible="true" ttyp:isEditable="true">` +
        `<ttyp:definition>${d.keyDefinition}</ttyp:definition><ttyp:kind>${d.keyKind}</ttyp:kind>` +
        `${comps}<ttyp:alias/></ttyp:primaryKey>`);
}
/** 完整 <ttyp:tableType> 文档（GET 读回失败时的兜底 / 单测用） */
export function buildTableTypeXml(meta, d) {
    const lang = meta.language ? ` adtcore:masterLanguage="${esc(meta.language.toUpperCase())}" adtcore:language="${esc(meta.language.toUpperCase())}"` : "";
    const resp = meta.responsible ? ` adtcore:responsible="${esc(meta.responsible.toUpperCase())}"` : "";
    return (`<?xml version="1.0" encoding="UTF-8"?>` +
        `<ttyp:tableType xmlns:ttyp="${TTYP_NAMESPACE}" xmlns:adtcore="http://www.sap.com/adt/core"` +
        ` adtcore:description="${esc(meta.description)}" adtcore:name="${esc(meta.name.toUpperCase())}" adtcore:type="TTYP/DA"${lang}${resp}>` +
        `<adtcore:packageRef adtcore:name="${esc(meta.packageName.toUpperCase())}"/>` +
        buildRowTypeXml(d) +
        `<ttyp:initialRowCount>00000</ttyp:initialRowCount>` +
        `<ttyp:accessType>${d.accessType}</ttyp:accessType>` +
        buildPrimaryKeyXml(d) +
        `<ttyp:secondaryKeys ttyp:isVisible="true" ttyp:isEditable="true"><ttyp:allowed>notSpecified</ttyp:allowed></ttyp:secondaryKeys>` +
        `</ttyp:tableType>`);
}
function replaceElement(xml, tag, replacement, insertBefore) {
    const re = new RegExp(`<ttyp:${tag}(?:\\s[^>]*)?(?:/>|>[\\s\\S]*?</ttyp:${tag}>)`);
    if (re.test(xml))
        return xml.replace(re, () => replacement);
    if (insertBefore) {
        const idx = xml.indexOf(`<ttyp:${insertBefore}`);
        if (idx >= 0)
            return xml.slice(0, idx) + replacement + xml.slice(idx);
    }
    const end = xml.lastIndexOf("</ttyp:tableType>");
    if (end < 0)
        throw new Error("表类型 XML 缺少 </ttyp:tableType> 根元素");
    return xml.slice(0, end) + replacement + xml.slice(end);
}
/** 在服务器读回的 XML 上替换行类型/访问类别/主键，其余（元数据、二级键、atom 链接）原样保留；去掉只读的 valueHelps */
export function applyTableTypeDefinition(currentXml, d) {
    if (!/<ttyp:tableType[\s>]/.test(currentXml))
        throw new Error("不是表类型 XML（缺少 <ttyp:tableType>）");
    let xml = currentXml.replace(/<ttyp:valueHelps>[\s\S]*?<\/ttyp:valueHelps>/, "");
    xml = replaceElement(xml, "rowType", buildRowTypeXml(d), "initialRowCount");
    xml = replaceElement(xml, "accessType", `<ttyp:accessType>${d.accessType}</ttyp:accessType>`, "primaryKey");
    xml = replaceElement(xml, "primaryKey", buildPrimaryKeyXml(d), "secondaryKeys");
    return xml;
}
export function tableTypeUrl(name) {
    return `/sap/bc/adt/ddic/tabletypes/${encodeURIComponent(name.toLowerCase())}`;
}
/** lock → GET 当前定义 → 合并 → PUT → unlock（不激活） */
export async function writeTableTypeDefinition(client, name, d, transport) {
    const url = tableTypeUrl(name);
    const oldState = client.stateful;
    client.stateful = session_types.stateful;
    try {
        const lock = await client.lock(url);
        try {
            const cur = await client.httpClient.request(url, { method: "GET", headers: { Accept: TTYP_CONTENT_TYPE } });
            const body = applyTableTypeDefinition(String(cur.body ?? ""), d);
            const t = lock.IS_LOCAL === "X" ? undefined : lock.CORRNR || transport;
            const qs = { lockHandle: lock.LOCK_HANDLE };
            if (t)
                qs.corrNr = t;
            await client.httpClient.request(url, {
                method: "PUT",
                headers: { "Content-Type": `${TTYP_CONTENT_TYPE}; charset=utf-8`, Accept: TTYP_CONTENT_TYPE },
                qs,
                body,
            });
            return body;
        }
        finally {
            await client.unLock(url, lock.LOCK_HANDLE).catch(() => undefined);
        }
    }
    finally {
        client.stateful = oldState;
    }
}
/**
 * 创建表类型壳：POST /sap/bc/adt/ddic/tabletypes（工作区 abap-adt-api 8.4.x 的 createObject 未登记 TTYP/DA，
 * 这里直接按 ADT 协议发送完整 <ttyp:tableType>；服务器可能只落默认 CHAR 壳，随后 writeTableTypeDefinition 再 PUT 定义）
 */
export async function createTableTypeObject(client, meta, d, transport) {
    const body = buildTableTypeXml(meta, d);
    const qs = {};
    if (transport)
        qs.corrNr = transport;
    await client.httpClient.request("/sap/bc/adt/ddic/tabletypes", {
        method: "POST",
        headers: { "Content-Type": `${TTYP_CONTENT_TYPE}; charset=utf-8`, Accept: TTYP_CONTENT_TYPE },
        qs,
        body,
    });
    return body;
}
