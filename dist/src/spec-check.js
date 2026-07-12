import { runArtifactSync, } from './artifact-sync.js';
export function runSpecCheck(projectPath) {
    return runArtifactSync({
        projectPath,
        artifactDir: 'code-specs',
        artifactExt: '.md',
        artifactName: 'specification',
        artifactLanguage: 'Russian',
    });
}
