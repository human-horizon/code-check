export interface IntegrationE2eReportEntry {
    path: string;
    action: 'generated' | 'updated' | 'matched';
    description: string;
}
export interface IntegrationE2eCheckReport {
    projectPath: string;
    integrationTotal: number;
    e2eTotal: number;
    generated: IntegrationE2eReportEntry[];
    updated: IntegrationE2eReportEntry[];
    matched: IntegrationE2eReportEntry[];
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
export declare function runIntegrationE2eCheck(projectPath: string): Promise<Result<IntegrationE2eCheckReport, Error>>;
