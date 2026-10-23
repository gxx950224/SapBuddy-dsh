/** Keep complete results on disk; subsequent model turns carry only the bounded preview. */
export declare function boundToolResult(text: string, directory?: string): Promise<{
    text: string;
    details: {
        truncated?: undefined;
        fullResultPath?: undefined;
        characters?: undefined;
    };
} | {
    text: string;
    details: {
        truncated: boolean;
        fullResultPath: string;
        characters: number;
    };
}>;
