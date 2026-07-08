import { type ArtifactSyncReport, type Result } from './artifact-sync.js';
export declare function runDocCheck(projectPath: string): Promise<Result<ArtifactSyncReport, Error>>;
