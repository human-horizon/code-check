import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { weave } from '@human-horizon/weft'
import { z } from 'zod'

const EXCLUDED_DIRS = new Set([
    'node_modules', 'dist', '.git', '.ai', '.lore', '.vscode',
    'coverage', 'target', 'build', 'out', 'tmp', 'temp',
    'problems',
])

export interface DeadCodeProblem {
    path: string
    title: string
    description: string
}

export interface DeadCodeReport {
    projectPath: string
    problems: DeadCodeProblem[]
    errors: Array<{ error: string }>
}

export type Result<T, E = Error> =
    | { ok: true; value: T }
    | { ok: false; error: E }

const ProblemSchema = z.object({
    problems: z.array(z.object({
        fileName: z.string(),
        title: z.string(),
        description: z.string(),
    })),
})

async function walk(
    root: string,
    currentRel: string,
    callback: (relPath: string, absPath: string) => Promise<void> | void,
): Promise<void> {
    const absDir = currentRel ? path.join(root, currentRel) : root
    let entries: string[]
    try {
        entries = await readdir(absDir)
    } catch {
        return
    }

    for (const name of entries) {
        if (name.startsWith('.') && name !== '.') {
            continue
        }
        if (EXCLUDED_DIRS.has(name)) {
            continue
        }

        const relPath = currentRel ? `${currentRel}/${name}` : name
        const absPath = path.join(root, relPath)
        const stats = await stat(absPath)

        if (stats.isDirectory()) {
            await walk(root, relPath, callback)
        } else if (stats.isFile() && (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.go') || name.endsWith('.rs'))) {
            await callback(relPath, absPath)
        }
    }
}

function buildAgentPrompt(projectPath: string, files: Array<{ relPath: string; content: string }>): string {
    const fileBlocks = files.map(f =>
        `--- ${f.relPath} ---\n${f.content}`
    ).join('\n\n')

    return [
        'You are analyzing a codebase for problems: dead code, outdated code, unused code, deprecated patterns, bugs, and design issues.',
        `Project path: ${projectPath}`,
        '',
        'Here are all source files:',
        '',
        fileBlocks,
        '',
        'Analyze the codebase thoroughly.',
        'For each problem you find, write a markdown file at:',
        `  ${projectPath}/problems/<short-name>.md`,
        '',
        'Each problem file should contain:',
        '- Title (H1)',
        '- Severity: critical / high / medium / low',
        '- Affected files',
        '- Description of the problem',
        '- Suggested fix',
        '',
        'IMPORTANT: First use the write tool to write each problem file. Only after writing all files, return the JSON.',
        'Do NOT return JSON before writing the files.',
        'Return ONLY a single raw JSON object.',
        'Do NOT wrap the JSON in markdown code blocks.',
        'Return JSON: { "problems": [ { "fileName": "short-name.md", "title": "Problem title", "description": "one-line summary" } ] }.',
    ].join('\n')
}

function getString(obj: object, key: string): string | undefined {
    for (const [k, value] of Object.entries(obj)) {
        if (k === key && typeof value === 'string') {
            return value
        }
    }
    return undefined
}

function getArray(obj: object, key: string): unknown[] | undefined {
    for (const [k, value] of Object.entries(obj)) {
        if (k === key && Array.isArray(value)) {
            return value
        }
    }
    return undefined
}

function parseProblems(value: unknown): DeadCodeProblem[] | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const problems = getArray(value, 'problems')
    if (!problems) {
        return null
    }

    const result: DeadCodeProblem[] = []
    for (const item of problems) {
        if (typeof item !== 'object' || item === null) {
            continue
        }
        const fileName = getString(item, 'fileName')
        const title = getString(item, 'title')
        const description = getString(item, 'description')
        if (!fileName || !title || !description) {
            continue
        }
        result.push({ path: fileName, title, description })
    }
    return result
}

export async function runDeadCodeCheck(
    projectPath: string,
): Promise<Result<DeadCodeReport, Error>> {
    const absoluteProject = path.resolve(projectPath)

    const files: Array<{ relPath: string; content: string }> = []
    try {
        await walk(absoluteProject, '', async (relPath, absPath) => {
            const content = await readFile(absPath, 'utf-8')
            files.push({ relPath, content })
        })
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        }
    }

    if (files.length === 0) {
        return {
            ok: true,
            value: { projectPath: absoluteProject, problems: [], errors: [] },
        }
    }

    // Ensure problems directory exists
    await mkdir(path.join(absoluteProject, 'problems'), { recursive: true })

    const workflow = weave<Record<string, never>>()
        .prompt(
            'analysis',
            () => buildAgentPrompt(absoluteProject, files),
            { model: 'free', schema: ProblemSchema },
        )
        .step('report', async (ctx) => {
            const problems = parseProblems(ctx.analysis)
            if (!problems) {
                return {
                    projectPath: absoluteProject,
                    problems: [],
                    errors: [{ error: 'Invalid response from agent' }],
                }
            }

            return {
                projectPath: absoluteProject,
                problems,
                errors: [],
            }
        })

    try {
        const result = await workflow.build().run({})
        return { ok: true, value: result.report }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        }
    }
}