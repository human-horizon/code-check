import { copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

export const PIPELINE_FILES = [
    ['generate-specs.ts', '01-generate-specs.ts'],
    ['generate-project-specs.ts', '02-generate-project-specs.ts'],
    ['generate-tests.ts', '03-generate-tests.ts'],
    ['generate-integration-e2e.ts', '04-generate-integration-e2e.ts'],
    ['generate-docs.ts', '05-generate-docs.ts'],
    ['generate-doc-translations.ts', '06-generate-doc-translations.ts'],
    ['check-problems.ts', '07-check-problems.ts'],
] as const

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

export async function syncPipelineFiles(
    sourceDirectory: string,
    destinationDirectory: string,
): Promise<void> {
    await mkdir(destinationDirectory, { recursive: true })

    for (const entry of LEGACY_PIPELINE_FILES) {
        await rm(path.join(destinationDirectory, entry), { force: true })
    }

    for (const [sourceName, installedName] of PIPELINE_FILES) {
        await copyFile(
            path.join(sourceDirectory, sourceName),
            path.join(destinationDirectory, installedName),
        )
    }
}
