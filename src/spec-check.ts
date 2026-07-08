import {
    runArtifactSync,
    type ArtifactSyncReport,
    type Result,
} from './artifact-sync.js'

const HUMAN_HORIZON_CODE_SPECS = '/Users/a/Space/Projects/HumanHorizon/code-specs'

export function runSpecCheck(
    projectPath: string,
): Promise<Result<ArtifactSyncReport, Error>> {
    return runArtifactSync({
        projectPath,
        artifactDir: 'code-specs',
        artifactExt: '.md',
        artifactName: 'specification',
        artifactLanguage: 'Russian',
        codeSpecsPath: HUMAN_HORIZON_CODE_SPECS,
    })
}
