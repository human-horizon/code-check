import { mkdir, writeFile, readFile, readdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIRS = [
    'code-specs',
    'docs/en',
    'docs/ru',
    'specs',
    'tests/integration',
    'tests/e2e',
]

const GITIGNORE_CONTENT = `node_modules
dist
.DS_Store
*.tsbuildinfo
`

function packageDir(): string {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    // cli.js is at dist/src/cli.js, package root is two levels up
    return path.resolve(dir, '..', '..')
}

async function copyPipelines(targetProject: string): Promise<void> {
    const srcPipelines = path.join(packageDir(), 'pipelines')
    const dstPipelines = path.join(targetProject, '.lore', 'weft', 'pipelines', 'code-check')

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

    console.log(`  pipelines: .lore/weft/pipelines/code-check/ (${entries.filter(e => e.endsWith('.ts') || e.endsWith('.js')).length} files)`)
}

async function install(projectPath: string): Promise<void> {
    const absPath = path.resolve(projectPath)

    for (const dir of DIRS) {
        await mkdir(path.join(absPath, dir), { recursive: true })
    }

    const gitignorePath = path.join(absPath, '.gitignore')
    try {
        await writeFile(gitignorePath, GITIGNORE_CONTENT, { flag: 'wx' })
    } catch {
        // .gitignore already exists, skip
    }

    await copyPipelines(absPath)

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
