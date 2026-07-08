export type ProjectSpecAction = 'generated' | 'updated' | 'matched';
export interface ProjectSpecFileEntry {
    path: string;
    action: ProjectSpecAction;
    description: string;
}
export interface ProjectSpecCheckReport {
    projectPath: string;
    totalFiles: number;
    generated: ProjectSpecFileEntry[];
    updated: ProjectSpecFileEntry[];
    matched: ProjectSpecFileEntry[];
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
export declare function classifyFile(before: string | null, after: string | null, claimedAction: ProjectSpecAction): ProjectSpecAction;
export declare function runProjectSpecCheck(projectPath: string): Promise<Result<ProjectSpecCheckReport, Error>>;
