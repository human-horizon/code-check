import { type CodeFile } from './artifact-sync.js';
export type TestAction = 'matched' | 'updated-tests' | 'generated-tests';
export interface TestDecision {
    targetRelativePath: string;
    action: TestAction;
    description: string;
}
export interface TestReportEntry {
    path: string;
    action: TestAction;
    description: string;
}
export interface TestCheckReport {
    projectPath: string;
    totalFiles: number;
    matched: number;
    updated: TestReportEntry[];
    generated: TestReportEntry[];
    unchanged: TestReportEntry[];
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
export declare function scanCodeFiles(projectPath: string): Promise<CodeFile[]>;
export declare function testFileForCode(code: CodeFile): string | null;
export declare function testTargetForCode(code: CodeFile): string;
export declare function readTestFile(projectPath: string, code: CodeFile): Promise<string | null>;
export declare function buildReport(projectPath: string, files: CodeFile[], entries: TestReportEntry[], errors: Array<{
    path: string;
    error: string;
}>): TestCheckReport;
export declare function runTestCheck(projectPath: string): Promise<Result<TestCheckReport, Error>>;
