/** 判断 ADT 会话是否已失效（401/407，或 400/408 且文本命中会话特征）。 */
export declare function isSessionBroken(error: unknown): boolean;
import { ADTClient, type ClientOptions, type HttpClient } from "abap-adt-api";
/** Preserve the SDK's URL and stateless-clone contract when supplying our transport. */
export declare function createManagedAdtClient(url: string, username: string, password: string | (() => Promise<string>), client: string | undefined, language: string | undefined, options: ClientOptions, clone?: boolean): ADTClient;
/** ADT retains cookies/CSRF handling; this transport adds per-execution cancellation. */
export declare function createHttpClient(baseURL: string, defaults: ClientOptions): HttpClient;
