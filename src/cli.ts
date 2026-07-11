import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

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

    console.log(`code-check installed at ${absPath}`)
    console.log(`  created: ${DIRS.join(', ')}`)
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
