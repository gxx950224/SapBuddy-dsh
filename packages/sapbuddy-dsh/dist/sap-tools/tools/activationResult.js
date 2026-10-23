import { createHash } from "node:crypto";
import { getOptimalObjectURI, sanitizeErrMsg } from "./shared.js";
/** Preserve the origin of errors; an inactive object or error cannot be a successful stage. */
export function mergeActivationResults(results, names) {
    const stages = results.flatMap((r, i) => r.stages ?? [{
            name: names[i],
            success: r.success && !(r.messages ?? []).some(m => /^(E|A|X)$/i.test(m.type)) && !(r.inactive ?? []).length,
            messages: r.messages ?? [],
        }]);
    const inactive = [...new Map(results.flatMap(r => r.inactive ?? []).map(r => [
            `${r.object?.["adtcore:type"]}|${r.object?.["adtcore:uri"] ?? r.object?.["adtcore:name"]}`, r,
        ])).values()];
    return { success: stages.every(s => s.success), stages, messages: results.flatMap(r => r.messages ?? []), inactive };
}
function failedStage(name, message) {
    return mergeActivationResults([{
            success: false, inactive: [],
            messages: [{ objDescr: "", type: "E", line: 0, href: "", forceSupported: false, shortText: message }],
        }], [name]);
}
// Only normalize transport formatting, never whitespace inside ABAP literals or identifiers.
const sourceHash = (source) => createHash("sha256")
    .update(source.replace(/\r\n/g, "\n").replace(/\n+$/, ""))
    .digest("hex");
/** Called inside the existing connection write mutex: check -> activate -> read active source. */
export async function verifyActivation(client, obj, activate) {
    const type = obj["adtcore:type"] ?? "";
    if (!/^(PROG\/[PI]|CLAS\/OC|INTF\/OI|FUGR\/(FF|I))$/.test(type)) {
        return { ...await activate(), verification: "not_applicable" };
    }
    const uri = getOptimalObjectURI(type, obj["adtcore:uri"]);
    let source;
    let syntax;
    try {
        try {
            source = await client.getObjectSource(uri, { version: "inactive" });
        }
        catch (err) {
            // Only an absent inactive version permits falling back to the active version.
            const responseError = err;
            if (Number(responseError.status ?? responseError.response?.status) !== 404)
                throw err;
            source = await client.getObjectSource(uri, { version: "active" });
        }
        const checks = await client.syntaxCheck(uri, uri, source);
        const errors = (checks ?? []).filter(c => /^(E|A|X)$/i.test(c.severity));
        if (errors.length)
            return failedStage("激活前语法检查", errors.slice(0, 20).map(c => `行 ${c.line}: ${c.text}`).join("；"));
        syntax = mergeActivationResults([{
                success: true, inactive: [],
                messages: (checks ?? []).map(c => ({ objDescr: "", type: c.severity, line: c.line, href: "", forceSupported: false, shortText: c.text })),
            }], ["激活前语法检查"]);
    }
    catch (err) {
        return failedStage("激活前语法检查", `无法确认待激活源码或语法结果，未执行激活：${sanitizeErrMsg(err)}`);
    }
    const expected = sourceHash(source);
    let activation;
    try {
        activation = await activate();
    }
    catch (err) {
        activation = failedStage("激活请求", sanitizeErrMsg(err));
    }
    const result = mergeActivationResults([syntax, activation], []);
    try {
        const active = await client.getObjectSource(uri, { version: "active" });
        if (sourceHash(active) !== expected) {
            return { ...mergeActivationResults([result, failedStage("激活版本核验", "active 源码与激活前核对的源码不一致，本次修改未确认生效。")], []), verification: "mismatch", sourceHash: expected };
        }
        if (!result.success) {
            // An unchanged main source alone cannot prove its INCLUDE changes took effect.
            // Re-read the live inactive list; the activation response may describe an earlier stage.
            const related = [obj, ...result.inactive.map(r => r.object).filter(Boolean)];
            for (const line of source.split("\n")) {
                const match = /^\s*INCLUDE\s+([A-Za-z/][A-Za-z0-9_/]*)\s*\./i.exec(line);
                if (match)
                    related.push({ "adtcore:name": match[1], "adtcore:type": "PROG/I" });
            }
            const normalizeUri = value => String(value ?? "").split(/[?#]/)[0].replace(/\/source\/main\/?$/i, "").replace(/\/$/, "").toLowerCase();
            const pending = await client.inactiveObjects();
            if (!Array.isArray(pending))
                throw new Error("未激活对象清单无效");
            const remaining = pending.filter(r => r.object && related.some(o =>
                (o["adtcore:uri"] && normalizeUri(o["adtcore:uri"]) === normalizeUri(r.object["adtcore:uri"])) ||
                (o["adtcore:name"] && o["adtcore:name"].toUpperCase() === String(r.object["adtcore:name"] ?? "").toUpperCase())));
            if (remaining.length) {
                return { ...mergeActivationResults([result, failedStage("激活状态核验", "目标或相关 INCLUDE 仍存在未激活版本，保留失败计数。")], []), inactive: remaining, verification: "pending", sourceHash: expected };
            }
            return {
                ...result, success: true, inactive: [], verification: "matched", recovered: true, sourceHash: expected,
                stages: [...result.stages, { name: "激活后核验（源码一致且无相关未激活对象）", success: true, messages: [] }],
            };
        }
        return { ...result, verification: "matched", sourceHash: expected };
    }
    catch (err) {
        return { ...mergeActivationResults([result, failedStage("激活版本核验", `激活请求已返回，但无法完成激活状态核对，结果未确认：${sanitizeErrMsg(err)}`)], []), verification: "unavailable", sourceHash: expected };
    }
}
