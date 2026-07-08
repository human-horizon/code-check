import { type ArtifactSyncReport, type Result } from './artifact-sync.js';
export declare function runSpecCheck(projectPath: string): Promise<Result<ArtifactSyncReport, Error>>;
