import { weave } from '@human-horizon/weft'
import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { scanArtifactFiles, type ArtifactFile } from './artifact-sync.js'
import { DOC_TEMPLATE } from './doc-template.js'

export type TranslationAction = 'generated' | 'updated' | 'matched'

export interface TranslationEntry {
    path: string
    action: TranslationAction
    description: string
}

export interface DocTranslationCheckReport {
    projectPath: string
    totalFiles: number
    generated: TranslationEntry[]
    updated: TranslationEntry[]
    matched: TranslationEntry[]
    errors: Array<{ path: string; error: string }>
}

export type Result<T, E = Error> =
    | { ok: true; value: T }
    | { ok: false; error: E }

const DecisionSchema = z.object({
    files: z.array(z.object({
        path: z.string(),
        action: z.enum(['generated', 'updated', 'matched']),
        description: z.string(),
    })),
})

async function readFileContent(relPath: string): Promise<string | null> {
    try {
        return await readFile(relPath, 'utf-8')
    } catch {
        return null
    }
}

export function ruPathForEn(enRelPath: string): string {
    return enRelPath.replace(/^docs\/en\//, 'docs/ru/')
}

function buildAgentPrompt(
    projectPath: string,
    enFile: ArtifactFile,
): string {
    const ruRelPath = ruPathForEn(enFile.relativePath)
    const absoluteRuPath = path.join(projectPath, ruRelPath)
    return [
        'You are a documentation translator.',
        `Project path: ${projectPath}`,
        '',
        `Source documentation (English): ${enFile.absolutePath}`,
        `Existing translation (Russian): ${absoluteRuPath}`,
        '',
        'Read BOTH files.',
        'If the existing Russian translation already accurately reflects the English source, do NOT modify any files.',
        'If the English source has changed or the translation is incomplete/inaccurate, update the Russian file by writing it directly using the write tool at the absolute path shown above.',
        'When translating, preserve the original HTML structure, tags, attributes, CSS, and code examples. Only translate visible text and headings.',
        'Change the root <html lang="en"> attribute to <html lang="ru"> in the translated file.',
        'IMPORTANT: First use the write tool to write the file if needed. Only after writing, return the JSON.',
        'Do NOT return JSON before writing the file.',
        'Return ONLY a single raw JSON object.',
        'Do NOT wrap the JSON in markdown code blocks.',
        'Return JSON: { "files": [ { "path": "relative path", "action": "generated" | "updated" | "matched", "description": "short summary" } ] }.',
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

function isValidAction(value: string): value is TranslationAction {
    return ['generated', 'updated', 'matched'].includes(value)
}

function parseDecision(value: unknown): TranslationEntry[] | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const files = getArray(value, 'files')
    if (!files) {
        return null
    }

    const entries: TranslationEntry[] = []
    for (const item of files) {
        if (typeof item !== 'object' || item === null) {
            continue
        }
        const pathValue = getString(item, 'path')
        const action = getString(item, 'action')
        const description = getString(item, 'description')
        if (!pathValue || !action || !description || !isValidAction(action)) {
            continue
        }
        entries.push({ path: pathValue, action, description })
    }
    return entries
}

function normalizeContent(value: string): string {
    return value.replace(/\r\n/g, '\n').trimEnd()
}

export function classifyFile(
    before: string | null,
    after: string | null,
): TranslationAction {
    if (before === null) {
        return after === null ? 'matched' : 'generated'
    }
    if (after === null) {
        return 'matched'
    }
    if (normalizeContent(before) === normalizeContent(after)) {
        return 'matched'
    }
    return 'updated'
}

function extractDocContent(html: string): string {
    const articleMatch = html.match(/<article class="doc-container">\s*([\s\S]*?)\s*<\/article>/i)
    if (articleMatch && articleMatch[1]) {
        return articleMatch[1].trim()
    }
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch && bodyMatch[1]) {
        return bodyMatch[1].trim()
    }
    return html.trim()
}

function removeFooter(content: string): string {
    return content.replace(/\s*<footer>[\s\S]*?<\/footer>\s*/g, '').trim()
}

function ensureLanguageClasses(content: string, lang: string): string {
    return content.replace(
        /<pre><code(?![^>]*\bclass=)/gi,
        `<pre><code class="language-${lang}">`,
    )
}

function highlightSignatures(content: string, lang: string): string {
    return content.replace(
        /<div class="signature">\s*([\s\S]*?)\s*<\/div>/gi,
        (match, inner) => {
            if (/<pre>|<code\b/i.test(inner)) {
                return match
            }
            const clean = inner.trim()
            if (!clean) {
                return match
            }
            return `<div class="signature"><code class="language-${lang}">${clean}</code></div>`
        },
    )
}

function sourceLanguageForDoc(relDocPath: string): string {
    const match = relDocPath.match(/^docs\/(?:en|ru)\/(.+)\.html$/)
    const sourcePath = match && match[1] ? match[1] : ''
    if (sourcePath.endsWith('.go')) {
        return 'go'
    }
    if (sourcePath.endsWith('.rs')) {
        return 'rust'
    }
    return 'typescript'
}

function titleForDoc(relDocPath: string): string {
    const sourcePath = relDocPath.replace(/^docs\/(?:en|ru)\//, '').replace(/\.html$/, '')
    return path.basename(sourcePath)
}

function buildRuDoc(content: string, relDocPath: string): string {
    const lang = sourceLanguageForDoc(relDocPath)
    let cleanContent = extractDocContent(content)
    cleanContent = removeFooter(cleanContent)
    cleanContent = ensureLanguageClasses(cleanContent, lang)
    cleanContent = highlightSignatures(cleanContent, lang)
    const title = titleForDoc(relDocPath)
    return DOC_TEMPLATE
        .replace('<html lang="en"', '<html lang="ru"')
        .replace('{{TITLE}}', title)
        .replace('{{CONTENT}}', cleanContent)
}

function normalizeRuContent(content: string): string {
    return content.replace(/<html lang="en"/i, '<html lang="ru"')
}

export async function runDocTranslationCheck(
    projectPath: string,
): Promise<Result<DocTranslationCheckReport, Error>> {
    const absoluteProject = path.resolve(projectPath)
    let enFiles: ArtifactFile[]
    try {
        enFiles = await scanArtifactFiles(absoluteProject, 'docs/en', '.html')
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        }
    }

    const beforeMap = new Map<string, string | null>()
    for (const enFile of enFiles) {
        const ruRelPath = ruPathForEn(enFile.relativePath)
        beforeMap.set(
            ruRelPath,
            await readFileContent(path.join(absoluteProject, ruRelPath)),
        )
    }

    let workflow = weave<Record<string, never>>()

    for (const enFile of enFiles) {
        const key = `translation_${enFile.relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`
        workflow = workflow.prompt(
            key,
            () => buildAgentPrompt(absoluteProject, enFile),
            { model: 'free', schema: DecisionSchema },
        )
    }

    const finalWorkflow = workflow.step('report', async (ctx) => {
        const generated: TranslationEntry[] = []
        const updated: TranslationEntry[] = []
        const matched: TranslationEntry[] = []
        const errors: Array<{ path: string; error: string }> = []

        for (const enFile of enFiles) {
            const ruRelPath = ruPathForEn(enFile.relativePath)
            const key = `translation_${enFile.relativePath.replace(/[^a-zA-Z0-9]/g, '_')}`
            const decision = parseDecision(ctx[key])
            if (!decision) {
                errors.push({ path: ruRelPath, error: 'Invalid decision from agent' })
                continue
            }

            const ruAbsolutePath = path.join(absoluteProject, ruRelPath)
            let after = await readFileContent(ruAbsolutePath)
            if (after !== null) {
                after = buildRuDoc(after, ruRelPath)
                await writeFile(ruAbsolutePath, after, 'utf-8')
            }

            const before = beforeMap.get(ruRelPath) ?? null
            const action = classifyFile(before, after)

            // If agent claimed generated/updated but file wasn't written, report error
            const agentAction = decision.find((e) => e.path === ruRelPath)?.action
            if (
                (agentAction === 'generated' || agentAction === 'updated') &&
                action === 'matched' &&
                after === null
            ) {
                errors.push({
                    path: ruRelPath,
                    error: 'Agent returned generated/updated but file was not written',
                })
                continue
            }

            const entry = decision.find((e) => e.path === ruRelPath) ?? {
                path: ruRelPath,
                action,
                description: 'Translated documentation',
            }
            entry.action = action

            if (action === 'generated') {
                generated.push(entry)
            } else if (action === 'updated') {
                updated.push(entry)
            } else {
                matched.push(entry)
            }
        }

        return {
            projectPath: absoluteProject,
            totalFiles: enFiles.length,
            generated,
            updated,
            matched,
            errors,
        }
    })

    try {
        const result = await finalWorkflow.build().run({})
        return { ok: true, value: result.report }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        }
    }
}
