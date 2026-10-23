import type { ActivationResult, ADTClient } from "abap-adt-api";
export interface ActivationStage {
    name: string;
    success: boolean;
    messages: ActivationResult["messages"];
}
export interface ActivationReport extends ActivationResult {
    stages: ActivationStage[];
    verification?: "matched" | "mismatch" | "unavailable" | "not_applicable" | "pending";
    recovered?: boolean;
    sourceHash?: string;
}
/** Preserve the origin of errors; an inactive object or error cannot be a successful stage. */
export declare function mergeActivationResults(results: ActivationResult[], names: string[]): ActivationReport;
/** Called inside the existing connection write mutex: check -> activate -> read active source. */
export declare function verifyActivation(client: Pick<ADTClient, "getObjectSource" | "syntaxCheck" | "inactiveObjects">, obj: {
    "adtcore:uri": string;
    "adtcore:name"?: string;
    "adtcore:type"?: string;
}, activate: () => Promise<ActivationReport>): Promise<ActivationReport>;
