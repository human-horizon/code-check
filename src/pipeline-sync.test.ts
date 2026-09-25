import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PIPELINE_FILES, syncPipelineFiles } from './pipeline-sync.js'

const LEGACY_PIPELINE_FILES = [
    'generate-specs.ts',
    'generate-project-specs.ts',
    'generate-tests.ts',
    'generate-integration-e2e.ts',
    'generate-docs.ts',
    'generate-doc-translations.ts',
    'check-problems.ts',
    'check-specs.ts',
    'check-project-specs.ts',
    'check-tests.ts',
    'check-integration-e2e.ts',
    'check-docs.ts',
    'check-doc-translations.ts',
    'check-dead-code.ts',
] as const

describe('syncPipelineFiles', () => {
    it('replaces old pipeline filenames with the ordered installed filenames', async (): Promise<void> => {
        const projectPath = await mkdtemp(path.join(tmpdir(), 'code-check-pipelines-'))
        const sourceDirectory = path.join(projectPath, 'package-pipelines')
        const destinationDirectory = path.join(projectPath, 'project-pipelines')

        try {
            await mkdir(sourceDirectory, { recursive: true })
            await mkdir(destinationDirectory, { recursive: true })

            await Promise.all(
                PIPELINE_FILES.map(([sourceName]) =>
                    writeFile(path.join(sourceDirectory, sourceName), 'pipeline', 'utf-8'),
                ),
            )
            await Promise.all(
                LEGACY_PIPELINE_FILES.map((name) =>
                    writeFile(path.join(destinationDirectory, name), 'legacy', 'utf-8'),
                ),
            )

            await syncPipelineFiles(sourceDirectory, destinationDirectory)

            const installedFiles = (await readdir(destinationDirectory)).sort()
            expect(installedFiles).toEqual(
                PIPELINE_FILES.map(([, installedName]) => installedName).sort(),
            )

            for (const [, installedName] of PIPELINE_FILES) {
                await expect(
                    readFile(path.join(destinationDirectory, installedName), 'utf-8'),
                ).resolves.toBe('pipeline')
            }
        } finally {
            await rm(projectPath, { recursive: true, force: true })
        }
    })
})
