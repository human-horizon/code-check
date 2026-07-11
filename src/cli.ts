#!/usr/bin/env node
import { mkdir, readdir, copyFile, readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function packageDir(): string {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    return path.resolve(dir, '..', '..')
}

async function install(projectPath: string): Promise<void> {
    const absPath = path.resolve(projectPath)
    const srcPipelines = path.join(packageDir(), 'pipelines')
    const dstPipelines = path.join(absPath, '.lore', 'weft', 'pipelines', 'code-check')
    const weftDir = path.join(absPath, '.lore', 'weft')

    // Copy pipeline files
    await mkdir(dstPipelines, { recursive: true })
    const entries = await readdir(srcPipelines)
    for (const entry of entries) {
        if (entry.endsWith('.ts') || entry.endsWith('.js') || entry.endsWith('.d.ts')) {
            await copyFile(
                path.join(srcPipelines, entry),
                path.join(dstPipelines, entry),
            )
        }
    }
    const count = entries.filter(e => e.endsWith('.ts') || e.endsWith('.js')).length
    console.log(`  pipelines: .lore/weft/pipelines/code-check/ (${count} files)`)

    // Install npm package
    const hasPnpm = await readFile(path.join(weftDir, 'pnpm-lock.yaml')).then(() => true).catch(() => false)
    const cmd = hasPnpm ? 'pnpm add --config.minimumReleaseAge=0' : 'npm install'
    console.log(`  installing: ${cmd} @human-horizon/code-check`)
    execSync(`${cmd} @human-horizon/code-check`, { cwd: weftDir, stdio: 'inherit' })

    console.log(`\ncode-check installed at ${absPath}`)
}

async function main(args: string[]): Promise<void> {
    const command = args[0]

    if (command === 'install') {
        const projectPath = args[1] ?? process.cwd()
        await install(projectPath)
        process.exit(0)
    }

    console.error('Usage: code-check install [project-path]')
    process.exit(1)
}

await main(process.argv.slice(2))
