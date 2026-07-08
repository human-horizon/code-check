import { weave } from '@human-horizon/weft';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { scanCodeFiles, scanArtifactFiles, } from './artifact-sync.js';
const DecisionSchema = z.object({
    files: z.array(z.object({
        path: z.string(),
        action: z.enum(['generated', 'updated', 'matched']),
        description: z.string(),
    })),
});
async function scanProjectSpecFiles(projectPath) {
    return scanArtifactFiles(projectPath, 'specs', '.md');
}
async function readFileContent(relPath) {
    try {
        return await readFile(relPath, 'utf-8');
    }
    catch {
        return null;
    }
}
function buildAgentPrompt(projectPath, codeFiles, codeSpecs, existingSpecs) {
    return [
        'You are a project specification writer.',
        `Project path: ${projectPath}`,
        '',
        'Code files:',
        ...codeFiles.map((f) => `- ${f.relativePath}`),
        '',
        'Code-specs (per-file specs):',
        ...codeSpecs.map((f) => `- ${f.relativePath}`),
        '',
        'Existing project specs:',
        ...existingSpecs.map((f) => `- ${f.relativePath}`),
        '',
        'Analyze the code and code-specs. Decide which high-level project specification files are needed in specs/*.md.',
        'These specs should describe the overall project: architecture, design decisions, public API overview, data flow, and anything not already covered by per-file code-specs.',
        'Write all specification files in Russian language.',
        'Write or update the necessary files directly using the write tool at their absolute paths.',
        'Do not modify code-specs or source code. Only create or update files inside specs/.',
        'Return ONLY a single raw JSON object.',
        'Do NOT wrap the JSON in markdown code blocks.',
        'Return JSON: { "files": [ { "path": "relative path", "action": "generated" | "updated" | "matched", "description": "short summary" } ] }.',
    ].join('\n');
}
function getString(obj, key) {
    for (const [k, value] of Object.entries(obj)) {
        if (k === key && typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}
function getArray(obj, key) {
    for (const [k, value] of Object.entries(obj)) {
        if (k === key && Array.isArray(value)) {
            return value;
        }
    }
    return undefined;
}
function isValidAction(value) {
    return ['generated', 'updated', 'matched'].includes(value);
}
function parseDecision(value) {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const files = getArray(value, 'files');
    if (!files) {
        return null;
    }
    const entries = [];
    for (const item of files) {
        if (typeof item !== 'object' || item === null) {
            continue;
        }
        const pathValue = getString(item, 'path');
        const action = getString(item, 'action');
        const description = getString(item, 'description');
        if (!pathValue || !action || !description || !isValidAction(action)) {
            continue;
        }
        entries.push({ path: pathValue, action, description });
    }
    return entries;
}
function normalizeContent(value) {
    return value.replace(/\r\n/g, '\n').trimEnd();
}
export function classifyFile(before, after, claimedAction) {
    if (before === null) {
        return after === null ? 'matched' : 'generated';
    }
    if (after === null) {
        return 'matched';
    }
    if (normalizeContent(before) === normalizeContent(after)) {
        return 'matched';
    }
    return 'updated';
}
export async function runProjectSpecCheck(projectPath) {
    const absoluteProject = path.resolve(projectPath);
    let codeFiles;
    let codeSpecs;
    let existingSpecs;
    try {
        codeFiles = await scanCodeFiles(absoluteProject);
        codeSpecs = await scanArtifactFiles(absoluteProject, 'code-specs', '.md');
        existingSpecs = await scanProjectSpecFiles(absoluteProject);
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
    const beforeMap = new Map();
    for (const spec of existingSpecs) {
        beforeMap.set(spec.relativePath, await readFileContent(path.join(absoluteProject, spec.relativePath)));
    }
    const workflow = weave()
        .prompt('decision', () => buildAgentPrompt(absoluteProject, codeFiles, codeSpecs, existingSpecs), { model: 'free', schema: DecisionSchema })
        .step('report', async (ctx) => {
        const claimedFiles = parseDecision(ctx.decision) ?? [];
        const afterSpecs = await scanProjectSpecFiles(absoluteProject);
        const afterMap = new Map();
        for (const spec of afterSpecs) {
            afterMap.set(spec.relativePath, await readFileContent(path.join(absoluteProject, spec.relativePath)));
        }
        const generated = [];
        const updated = [];
        const matched = [];
        const errors = [];
        for (const entry of claimedFiles) {
            if (!entry.path.startsWith('specs/')) {
                errors.push({
                    path: entry.path,
                    error: 'Path must be inside specs/',
                });
                continue;
            }
            const before = beforeMap.get(entry.path) ?? null;
            const after = afterMap.get(entry.path) ?? null;
            const action = classifyFile(before, after, entry.action);
            const finalEntry = { path: entry.path, action, description: entry.description };
            if (action === 'generated') {
                generated.push(finalEntry);
            }
            else if (action === 'updated') {
                updated.push(finalEntry);
            }
            else {
                matched.push(finalEntry);
            }
        }
        for (const spec of afterSpecs) {
            if (claimedFiles.some((entry) => entry.path === spec.relativePath)) {
                continue;
            }
            const before = beforeMap.get(spec.relativePath) ?? null;
            const after = afterMap.get(spec.relativePath) ?? null;
            if (before === null && after !== null) {
                generated.push({ path: spec.relativePath, action: 'generated', description: 'Spec file created by agent' });
            }
            else if (before !== null && after !== null && normalizeContent(before) !== normalizeContent(after)) {
                updated.push({ path: spec.relativePath, action: 'updated', description: 'Spec file updated by agent' });
            }
            else {
                matched.push({ path: spec.relativePath, action: 'matched', description: 'Spec file unchanged' });
            }
        }
        return {
            projectPath: absoluteProject,
            totalFiles: afterSpecs.length,
            generated,
            updated,
            matched,
            errors,
        };
    });
    try {
        const result = await workflow.build().run({});
        return { ok: true, value: result.report };
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}
