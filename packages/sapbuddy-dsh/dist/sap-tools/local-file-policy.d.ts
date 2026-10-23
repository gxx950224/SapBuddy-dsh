/** Resolve existing ancestors as well as new files, so symlinks cannot hide protected targets. */
export declare function canonicalPath(value: string): string;
/** A closed command grammar, not a blacklist of filenames in arbitrary executable code.
 * No scripts, substitutions, pipes, redirection, extra flags, or extra commands.
 * Quoted arguments are mandatory; expansion characters are rejected even in quotes.
 */
export type LocalOperation = {
    kind: "https" | "upload" | "open";
    target: string;
};
export declare function parseBashCommand(command: string): LocalOperation | undefined;
export declare const bashCommandAllowed: (command: string) => boolean;
