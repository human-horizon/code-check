export type CodeLang = 'typescript' | 'go' | 'rust';
export interface CodeFile {
    lang: CodeLang;
    relativePath: string;
    absolutePath: string;
}
export interface ArtifactFile {
    relativePath: string;
    absolutePath: string;
}
export interface MatchedTask {
    kind: 'matched';
    code: CodeFile;
    artifact: ArtifactFile;
}
export interface CodeOnlyTask {
    kind: 'code-only';
    code: CodeFile;
}
export interface ArtifactOnlyTask {
    kind: 'artifact-only';
    artifact: ArtifactFile;
}
export type SyncTask = MatchedTask | CodeOnlyTask | ArtifactOnlyTask;
export type SyncAction = 'matched' | 'updated-code' | 'updated-artifact' | 'generated-code' | 'generated-artifact';
export interface SyncDecision {
    action: SyncAction;
    targetRelativePath: string;
    description: string;
}
export interface ReportEntry {
    path: string;
    action: SyncAction;
    description: string;
}
export interface ArtifactSyncReport {
    projectPath: string;
    totalTasks: number;
    matched: number;
    updated: ReportEntry[];
    generatedArtifacts: ReportEntry[];
    generatedCode: ReportEntry[];
    unchanged: ReportEntry[];
    errors: Array<{
        path: string;
        error: string;
    }>;
}
export interface ArtifactSyncOptions {
    projectPath: string;
    artifactDir: string;
    artifactExt: string;
    artifactName: 'specification' | 'documentation';
    artifactLanguage?: string;
    /** Path to HumanHorizon code-specs (development standards) to include as context. */
    codeSpecsPath?: string;
    /** Full HTML template with {{TITLE}} and {{CONTENT}} placeholders. */
    artifactTemplate?: string;
}
export type Result<T, E = Error> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: E;
};
export declare function detectLang(relPath: string): CodeLang | null;
export declare function removeExt(relPath: string): string;
export declare function artifactRelativePathForCode(codeRel: string, artifactDir: string, artifactExt: string): string;
export declare function scanCodeFiles(projectPath: string): Promise<CodeFile[]>;
export declare function scanArtifactFiles(projectPath: string, artifactDir: string, artifactExt: string): Promise<ArtifactFile[]>;
export declare function buildSyncTasks(codeFiles: CodeFile[], artifactFiles: ArtifactFile[], artifactDir: string, artifactExt: string): SyncTask[];
export declare function buildReport(projectPath: string, tasks: SyncTask[], entries: ReportEntry[], errors: Array<{
    path: string;
    error: string;
}>): ArtifactSyncReport;
export declare function runArtifactSync(options: ArtifactSyncOptions): Promise<Result<ArtifactSyncReport, Error>>;
