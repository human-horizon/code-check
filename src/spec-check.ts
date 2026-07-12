import {
    runArtifactSync,
    type ArtifactSyncReport,
    type Result,
} from './artifact-sync.js'

export function runSpecCheck(
    projectPath: string,
): Promise<Result<ArtifactSyncReport, Error>> {
    return runArtifactSync({
        projectPath,
        artifactDir: 'code-specs',
        artifactExt: '.md',
        artifactName: 'specification',
        artifactLanguage: 'Russian',
    })
}
