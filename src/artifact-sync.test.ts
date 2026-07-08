import { describe, it, expect } from 'vitest'
import {
    buildSyncTasks,
    detectLang,
    removeExt,
    artifactRelativePathForCode,
    buildReport,
} from './artifact-sync.js'
import type { CodeFile, ArtifactFile } from './artifact-sync.js'

function codeFile(relativePath: string, lang = 'typescript'): CodeFile {
    return {
        lang: lang as CodeFile['lang'],
        relativePath,
        absolutePath: `/project/${relativePath}`,
    }
}

function artifactFile(relativePath: string): ArtifactFile {
    return {
        relativePath,
        absolutePath: `/project/${relativePath}`,
    }
}

describe('detectLang', () => {
    it('recognizes typescript', () => {
        expect(detectLang('src/main.ts')).toBe('typescript')
    })

    it('recognizes go', () => {
        expect(detectLang('src/main.go')).toBe('go')
    })

    it('recognizes rust', () => {
        expect(detectLang('src/main.rs')).toBe('rust')
    })

    it('ignores test files', () => {
        expect(detectLang('src/main.test.ts')).toBeNull()
        expect(detectLang('src/main.spec.ts')).toBeNull()
        expect(detectLang('src/main_test.go')).toBeNull()
    })
})

describe('removeExt', () => {
    it('removes extension', () => {
        expect(removeExt('src/main.ts')).toBe('src/main')
    })

    it('returns path without extension as is', () => {
        expect(removeExt('src/main')).toBe('src/main')
    })
})

describe('artifactRelativePathForCode', () => {
    it('maps code path to spec path', () => {
        expect(artifactRelativePathForCode('src/main.ts', 'code-specs', '.md')).toBe(
            'code-specs/src/main.md',
        )
    })

    it('maps code path to doc path', () => {
        expect(artifactRelativePathForCode('src/main.ts', 'docs', '.html')).toBe(
            'docs/src/main.html',
        )
    })
})

describe('buildSyncTasks', () => {
    it('returns empty tasks for empty inputs', () => {
        expect(buildSyncTasks([], [], 'code-specs', '.md')).toEqual([])
    })

    it('creates code-only task when artifact is missing', () => {
        const code = codeFile('src/main.ts')
        const tasks = buildSyncTasks([code], [], 'code-specs', '.md')
        expect(tasks).toHaveLength(1)
        expect(tasks[0]).toEqual({ kind: 'code-only', code })
    })

    it('creates artifact-only task when code is missing', () => {
        const artifact = artifactFile('code-specs/src/main.md')
        const tasks = buildSyncTasks([], [artifact], 'code-specs', '.md')
        expect(tasks).toHaveLength(1)
        expect(tasks[0]).toEqual({ kind: 'artifact-only', artifact })
    })

    it('creates matched task when both files exist', () => {
        const code = codeFile('src/main.ts')
        const artifact = artifactFile('code-specs/src/main.md')
        const tasks = buildSyncTasks([code], [artifact], 'code-specs', '.md')
        expect(tasks).toHaveLength(1)
        expect(tasks[0]).toEqual({ kind: 'matched', code, artifact })
    })
})

describe('buildReport', () => {
    it('classifies matched entries', () => {
        const report = buildReport(
            '/project',
            [],
            [
                {
                    path: 'src/main.ts',
                    action: 'matched',
                    description: 'ok',
                },
            ],
            [],
        )
        expect(report.matched).toBe(1)
        expect(report.updated).toHaveLength(0)
    })
})
