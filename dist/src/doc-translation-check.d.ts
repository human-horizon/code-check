export type TranslationAction = 'generated' | 'updated' | 'matched';
export interface TranslationEntry {
    path: string;
    action: TranslationAction;
    description: string;
}
export interface DocTranslationCheckReport {
    projectPath: string;
    totalFiles: number;
    generated: TranslationEntry[];
    updated: TranslationEntry[];
    matched: TranslationEntry[];
    errors: Array<{
        path: string;
        error: string;
    }>;
}
export type Result<T, E = Error> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
export declare function ruPathForEn(enRelPath: string): string;
export declare function classifyFile(before: string | null, after: string | null): TranslationAction;
export declare function runDocTranslationCheck(projectPath: string): Promise<Result<DocTranslationCheckReport, Error>>;
