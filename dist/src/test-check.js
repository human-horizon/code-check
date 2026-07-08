import { weave } from '@human-horizon/weft';
import { z } from 'zod';
import { readdir, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { detectLang, } from './artifact-sync.js';
const TestDecisionSchema = z.object({
    targetRelativePath: z.string(),
    action: z.enum(['matched', 'updated-tests', 'generated-tests']),
    description: z.string(),
});
const EXCLUDED_DIRS = new Set([
    'node_modules',
    'dist',
    '.git',
    '.ai',
    '.vscode',
    'coverage',
    'target',
    'build',
    'out',
    'tmp',
    'temp',
]);
const EXCLUDED_PREFIXES = ['.', '_'];
function isExcludedFile(relPath) {
    const base = path.basename(relPath);
    return EXCLUDED_PREFIXES.some((prefix) => base.startsWith(prefix));
}
async function walk(root, currentRel, callback) {
    const absDir = currentRel ? path.join(root, currentRel) : root;
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.') {
            continue;
        }
        if (EXCLUDED_DIRS.has(entry.name)) {
            continue;
        }
        const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
        const absPath = path.join(root, relPath);
        if (entry.isDirectory()) {
            await walk(root, relPath, callback);
        }
        else if (entry.isFile()) {
            await callback(relPath, absPath);
        }
    }
}
export async function scanCodeFiles(projectPath) {
    const files = [];
    await walk(projectPath, '', (relPath, absPath) => {
        if (isExcludedFile(relPath)) {
            return;
        }
        const lang = detectLang(relPath);
        if (!lang) {
            return;
        }
        files.push({
            lang,
            relativePath: relPath.replace(/\\/g, '/'),
            absolutePath: absPath,
        });
    });
    return files;
}
export function testFileForCode(code) {
    if (code.lang === 'typescript') {
        return `${code.relativePath.replace(/\.ts$/, '')}.test.ts`;
    }
    if (code.lang === 'go') {
        return `${code.relativePath.replace(/\.go$/, '')}_test.go`;
    }
    return null;
}
export function testTargetForCode(code) {
    if (code.lang === 'rust') {
        return code.relativePath;
    }
    const testRel = testFileForCode(code);
    if (testRel) {
        return testRel;
    }
    return code.relativePath;
}
export async function readTestFile(projectPath, code) {
    const targetRel = testTargetForCode(code);
    try {
        return await readFile(path.join(projectPath, targetRel), 'utf-8');
    }
    catch {
        return null;
    }
}
function buildAgentPrompt(projectPath, code, existingTests) {
    const jsonRules = [
        'Return ONLY a single raw JSON object on one line.',
        'Do NOT wrap the JSON in markdown code blocks and do NOT use triple backticks anywhere in the response.',
        'Do NOT include file content in the JSON response.',
    ].join(' ');
    const testRel = testTargetForCode(code);
    const absoluteTestPath = path.join(projectPath, testRel);
    if (code.lang === 'rust') {
        return [
            'You are checking unit tests inside a Rust source file.',
            '',
            `Code file: ${code.absolutePath}`,
            `Test file: ${absoluteTestPath}`,
            '',
            'Rust unit tests live inside a `#[cfg(test)] mod tests { ... }` block, typically at the end of the file.',
            'Read the code file. Determine whether there are unit tests and whether they cover all public functions, methods, and structs.',
            `If there are no tests or coverage is incomplete, rewrite the entire file at ${absoluteTestPath} with complete, production-ready tests added or updated using the write tool.`,
            'If tests already cover all public items, do not modify the file.',
            jsonRules,
            `Return JSON: action ("matched" | "updated-tests"), targetRelativePath "${testRel}", description (short summary).`,
        ].join('\n');
    }
    return [
        'You are checking unit tests for a code file.',
        '',
        `Code file: ${code.absolutePath}`,
        `Language: ${code.lang}`,
        `Test file: ${absoluteTestPath}`,
        '',
        'Read the code file and the existing test file (if any). Determine whether the tests cover all classes, methods, and functions.',
        `If there is no test file or coverage is incomplete, generate or rewrite the complete test file at ${absoluteTestPath} using the write tool so that every public function/class/method is covered.`,
        'If tests already cover all public items, do not modify the file.',
        jsonRules,
        `Return JSON: action ("matched" | "generated-tests" | "updated-tests"), targetRelativePath "${testRel}", description (short summary).`,
    ].join('\n');
}
async function ensureTestFile(projectPath, code) {
    if (code.lang === 'rust') {
        return;
    }
    const testRel = testFileForCode(code);
    if (!testRel) {
        return;
    }
    const targetPath = path.join(projectPath, testRel);
    await mkdir(path.dirname(targetPath), { recursive: true });
}
function getString(obj, key) {
    for (const [k, value] of Object.entries(obj)) {
        if (k === key && typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}
function isTestAction(value) {
    return ['matched', 'updated-tests', 'generated-tests'].includes(value);
}
function isTestDecision(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const targetRelativePath = getString(value, 'targetRelativePath');
    const action = getString(value, 'action');
    const description = getString(value, 'description');
    if (!targetRelativePath || !action || !description || !isTestAction(action)) {
        return false;
    }
    return true;
}
function collectDecisions(ctx) {
    const pairs = [];
    for (const [key, value] of Object.entries(ctx)) {
        if (key.startsWith('decision_') && isTestDecision(value)) {
            pairs.push({ key, decision: value });
        }
    }
    return pairs;
}
export function buildReport(projectPath, files, entries, errors) {
    const matched = [];
    const updated = [];
    const generated = [];
    const unchanged = [];
    for (const entry of entries) {
        if (entry.action === 'matched') {
            matched.push(entry);
        }
        else if (entry.action === 'updated-tests') {
            updated.push(entry);
        }
        else if (entry.action === 'generated-tests') {
            generated.push(entry);
        }
        else {
            unchanged.push(entry);
        }
    }
    return {
        projectPath,
        totalFiles: files.length,
        matched: matched.length,
        updated,
        generated,
        unchanged,
        errors,
    };
}
function safeKey(id) {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
}
function normalizeContent(value) {
    return value.replace(/\r\n/g, '\n').trimEnd();
}
function classifyTestAction(existingTests, after) {
    if (existingTests === null) {
        return after === null ? 'matched' : 'generated-tests';
    }
    if (after === null) {
        return 'matched';
    }
    if (normalizeContent(existingTests) === normalizeContent(after)) {
        return 'matched';
    }
    return 'updated-tests';
}
export async function runTestCheck(projectPath) {
    const absoluteProject = path.resolve(projectPath);
    let codeFiles;
    try {
        codeFiles = await scanCodeFiles(absoluteProject);
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
    const existingTestsMap = new Map();
    for (const code of codeFiles) {
        existingTestsMap.set(code.relativePath, await readTestFile(absoluteProject, code));
    }
    let workflow = weave();
    for (const code of codeFiles) {
        const key = safeKey(code.relativePath);
        const existingTests = existingTestsMap.get(code.relativePath) ?? null;
        await ensureTestFile(absoluteProject, code);
        workflow = workflow.prompt(`decision_${key}`, () => buildAgentPrompt(absoluteProject, code, existingTests), { model: 'free', schema: TestDecisionSchema, retry: 3 });
    }
    const finalWorkflow = workflow.step('report', async (ctx) => {
        const pairs = collectDecisions(ctx);
        const entries = [];
        const errors = [];
        for (const { key, decision } of pairs) {
            const codeRel = key.replace('decision_', '');
            const code = codeFiles.find((c) => safeKey(c.relativePath) === codeRel);
            if (!code) {
                errors.push({
                    path: decision.targetRelativePath,
                    error: 'Could not map decision back to code file',
                });
                continue;
            }
            const existingTests = existingTestsMap.get(code.relativePath) ?? null;
            const after = await readTestFile(absoluteProject, code);
            const action = classifyTestAction(existingTests, after);
            entries.push({
                path: decision.targetRelativePath,
                action,
                description: decision.description,
            });
        }
        return buildReport(absoluteProject, codeFiles, entries, errors);
    });
    try {
        const result = await finalWorkflow.build().run({});
        return { ok: true, value: result.report };
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}
