import { weave } from '@human-horizon/weft';
import { z } from 'zod';
import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
const SyncDecisionSchema = z.object({
    action: z.enum([
        'matched',
        'updated-code',
        'updated-artifact',
        'generated-code',
        'generated-artifact',
    ]),
    targetRelativePath: z.string(),
    description: z.string(),
});
const EXCLUDED_DIRS = new Set([
    'node_modules',
    'dist',
    '.git',
    '.ai',
    '.lore',
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
export function detectLang(relPath) {
    if (relPath.endsWith('.ts') &&
        !relPath.endsWith('.test.ts') &&
        !relPath.endsWith('.spec.ts')) {
        return 'typescript';
    }
    if (relPath.endsWith('.go') && !relPath.endsWith('_test.go')) {
        return 'go';
    }
    if (relPath.endsWith('.rs')) {
        return 'rust';
    }
    return null;
}
export function removeExt(relPath) {
    const ext = path.extname(relPath);
    return ext ? relPath.slice(0, -ext.length) : relPath;
}
export function artifactRelativePathForCode(codeRel, artifactDir, artifactExt) {
    return path
        .join(artifactDir, `${removeExt(codeRel)}${artifactExt}`)
        .replace(/\\/g, '/');
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
export async function scanArtifactFiles(projectPath, artifactDir, artifactExt) {
    const artifactRoot = path.join(projectPath, artifactDir);
    const files = [];
    try {
        await stat(artifactRoot);
    }
    catch {
        return files;
    }
    await walk(artifactRoot, '', (relPath, absPath) => {
        if (!relPath.endsWith(artifactExt)) {
            return;
        }
        files.push({
            relativePath: path.join(artifactDir, relPath.replace(/\\/g, '/')),
            absolutePath: absPath,
        });
    });
    return files;
}
export function buildSyncTasks(codeFiles, artifactFiles, artifactDir, artifactExt) {
    const artifactMap = new Map(artifactFiles.map((a) => [a.relativePath, a]));
    const matchedArtifactRels = new Set();
    const tasks = [];
    for (const code of codeFiles) {
        const expectedArtifact = artifactRelativePathForCode(code.relativePath, artifactDir, artifactExt);
        const artifact = artifactMap.get(expectedArtifact);
        if (artifact) {
            tasks.push({ kind: 'matched', code, artifact });
            matchedArtifactRels.add(artifact.relativePath);
        }
        else {
            tasks.push({ kind: 'code-only', code });
        }
    }
    for (const artifact of artifactFiles) {
        if (!matchedArtifactRels.has(artifact.relativePath)) {
            tasks.push({ kind: 'artifact-only', artifact });
        }
    }
    return tasks;
}
function buildAgentPrompt(projectPath, task, options, codeSpecsPath) {
    const artifactType = options.artifactName;
    const languageNote = options.artifactLanguage
        ? `The ${artifactType} must be written in ${options.artifactLanguage}.`
        : '';
    const jsonRules = [
        'Return ONLY a single raw JSON object.',
        'Do NOT wrap the JSON in markdown code blocks and do NOT use triple backticks anywhere in the response.',
        'Do NOT put file content in the JSON response.',
    ].join(' ');
    if (task.kind === 'matched') {
        const contextBlock = codeSpecsPath
            ? `\n\nHumanHorizon Development Standards are at: ${codeSpecsPath}\nRead the relevant files from there and follow them.`
            : '';
        const templateBlock = options.artifactTemplate
            ? [
                '',
                'The documentation follows a unified HTML template shown below.',
                'If the existing file does not follow this template, rewrite it using the template.',
                'Replace {{TITLE}} with the module name and {{CONTENT}} with the documentation body HTML.',
                'Wrap code examples in <pre><code class="language-typescript">...</code></pre> (or language-go, language-rust).',
                '',
                options.artifactTemplate,
            ].join('\n')
            : '';
        return [
            `You are checking that a code file matches its ${artifactType}.`,
            '',
            `Code file: ${task.code.absolutePath}`,
            `${artifactType} file: ${task.artifact.absolutePath}`,
            '',
            `Read both files. Determine whether the code fully implements the ${artifactType} and the ${artifactType} accurately describes the code.`,
            'If they do not match, update the file that is wrong by writing it directly using the write tool at the absolute path shown above.',
            'IMPORTANT: First use the write tool to write the file. Only after writing, return the JSON.',
            'Do NOT return JSON before writing the file.',
            languageNote,
            'If they already match, do not modify any files.',
            jsonRules,
            'Return JSON matching the schema: action ("matched" | "updated-code" | "updated-artifact"), targetRelativePath (relative to project root, the file you changed or kept unchanged), description (short human summary).',
            'Example: {"action": "matched", "targetRelativePath": "src/utils.ts", "description": "The code and specification match."}',
            templateBlock,
            contextBlock,
        ].join('\n');
    }
    if (task.kind === 'code-only') {
        const expectedArtifact = artifactRelativePathForCode(task.code.relativePath, options.artifactDir, options.artifactExt);
        const contextBlock = codeSpecsPath
            ? `\n\nHumanHorizon Development Standards are at: ${codeSpecsPath}\nRead the relevant files from there and follow them.`
            : '';
        const templateBlock = options.artifactTemplate
            ? [
                '',
                'Use the following unified HTML template for the documentation file.',
                'Replace {{TITLE}} with the module name and {{CONTENT}} with the documentation body HTML.',
                'Write the complete HTML file using this template.',
                'Wrap code examples in <pre><code class="language-typescript">...</code></pre> (or language-go, language-rust).',
                '',
                options.artifactTemplate,
            ].join('\n')
            : '';
        return [
            `You are generating a ${artifactType} for a code file.`,
            '',
            `Code file: ${task.code.absolutePath}`,
            `Language: ${task.code.lang}`,
            '',
            `Read the code file and write a complete ${artifactType} at ${path.join(projectPath, expectedArtifact)} using the write tool.`,
            'The file should describe the behavior, public API, types, and important implementation details.',
            languageNote,
            'IMPORTANT: First use the write tool to write the file. Only after writing, return the JSON.',
            'Do NOT return JSON before writing the file.',
            jsonRules,
            `Return JSON: action "generated-artifact", targetRelativePath "${expectedArtifact}", description (short summary).`,
            `Example: {"action": "generated-artifact", "targetRelativePath": "${expectedArtifact}", "description": "Created specification for utils.ts."}`,
            templateBlock,
            contextBlock,
        ].join('\n');
    }
    const contextBlock = codeSpecsPath
        ? `\n\nHumanHorizon Development Standards are at: ${codeSpecsPath}\nRead the relevant files from there and follow them.`
        : '';
    return [
        `You are generating code from a ${artifactType}.`,
        '',
        `${artifactType} file: ${task.artifact.absolutePath}`,
        '',
        'Read the file and write complete, production-ready source code that implements it at the appropriate absolute path in the project root.',
        'Infer the language from the content and choose the correct file extension and relative path (without the leading "docs/en/" or "code-specs/" prefix and with the appropriate source extension instead of the artifact extension).',
        'Write the source file directly using the write tool.',
        jsonRules,
        'Return JSON: action "generated-code", targetRelativePath (relative to project root, the file you created), description (short summary).',
        'Example: {"action": "generated-code", "targetRelativePath": "src/utils.ts", "description": "Generated TypeScript implementation from specification."}',
        contextBlock,
    ].join('\n');
}
async function readFileContent(projectPath, relPath) {
    try {
        return await readFile(path.join(projectPath, relPath), 'utf-8');
    }
    catch {
        return null;
    }
}
async function classifyEntry(projectPath, decision, beforeMap) {
    const before = beforeMap.get(decision.targetRelativePath) ?? null;
    const after = await readFileContent(projectPath, decision.targetRelativePath);
    let action = decision.action;
    if (action === 'matched') {
        return {
            path: decision.targetRelativePath,
            action,
            description: decision.description,
        };
    }
    if (before === null && after !== null) {
        action = action.startsWith('generated') ? action : 'generated-artifact';
    }
    else if (before !== null && after !== null && before !== after) {
        action = action.startsWith('updated') ? action : 'updated-artifact';
    }
    else {
        action = 'matched';
    }
    return {
        path: decision.targetRelativePath,
        action,
        description: decision.description,
    };
}
function getString(obj, key) {
    for (const [k, value] of Object.entries(obj)) {
        if (k === key && typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}
function isSyncAction(value) {
    return [
        'matched',
        'updated-code',
        'updated-artifact',
        'generated-code',
        'generated-artifact',
    ].includes(value);
}
function isSyncDecision(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const action = getString(value, 'action');
    const targetRelativePath = getString(value, 'targetRelativePath');
    const description = getString(value, 'description');
    if (!action || !targetRelativePath || !description || !isSyncAction(action)) {
        return false;
    }
    return true;
}
function collectDecisions(ctx) {
    const decisions = [];
    for (const [key, value] of Object.entries(ctx)) {
        if (key.startsWith('decision_') && isSyncDecision(value)) {
            decisions.push(value);
        }
    }
    return decisions;
}
async function buildBeforeMap(projectPath, tasks, options) {
    const map = new Map();
    for (const task of tasks) {
        if (task.kind === 'matched') {
            map.set(task.code.relativePath, await readFileContent(projectPath, task.code.relativePath));
            map.set(task.artifact.relativePath, await readFileContent(projectPath, task.artifact.relativePath));
        }
        else if (task.kind === 'code-only') {
            const expectedArtifact = artifactRelativePathForCode(task.code.relativePath, options.artifactDir, options.artifactExt);
            map.set(expectedArtifact, null);
        }
    }
    return map;
}
export function buildReport(projectPath, tasks, entries, errors) {
    const matched = [];
    const updated = [];
    const generatedArtifacts = [];
    const generatedCode = [];
    const unchanged = [];
    for (const entry of entries) {
        if (entry.action === 'matched') {
            matched.push(entry);
        }
        else if (entry.action === 'updated-code' || entry.action === 'updated-artifact') {
            updated.push(entry);
        }
        else if (entry.action === 'generated-artifact') {
            generatedArtifacts.push(entry);
        }
        else if (entry.action === 'generated-code') {
            generatedCode.push(entry);
        }
        else {
            unchanged.push(entry);
        }
    }
    return {
        projectPath,
        totalTasks: tasks.length,
        matched: matched.length,
        updated,
        generatedArtifacts,
        generatedCode,
        unchanged,
        errors,
    };
}
function taskId(task) {
    if (task.kind === 'matched') {
        return task.code.relativePath;
    }
    if (task.kind === 'code-only') {
        return task.code.relativePath;
    }
    return task.artifact.relativePath;
}
function safeKey(id) {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
}
export async function runArtifactSync(options) {
    const absoluteProject = path.resolve(options.projectPath);
    let codeFiles;
    let artifactFiles;
    try {
        codeFiles = await scanCodeFiles(absoluteProject);
        artifactFiles = await scanArtifactFiles(absoluteProject, options.artifactDir, options.artifactExt);
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
    const tasks = buildSyncTasks(codeFiles, artifactFiles, options.artifactDir, options.artifactExt);
    const beforeMap = await buildBeforeMap(absoluteProject, tasks, options);
    // Validate HumanHorizon code-specs path if configured
    if (options.codeSpecsPath) {
        const resolved = path.resolve(options.codeSpecsPath);
        try {
            await stat(resolved);
        }
        catch {
            return {
                ok: false,
                error: new Error(`code-specs path not found: ${resolved}`),
            };
        }
    }
    let workflow = weave();
    for (const task of tasks) {
        const key = safeKey(taskId(task));
        workflow = workflow.prompt(`decision_${key}`, () => buildAgentPrompt(absoluteProject, task, options, options.codeSpecsPath), { model: 'free', schema: SyncDecisionSchema, retry: 3 });
    }
    const finalWorkflow = workflow.step('report', async (ctx) => {
        const decisions = collectDecisions(ctx);
        const entries = [];
        const errors = [];
        for (const decision of decisions) {
            try {
                const entry = await classifyEntry(absoluteProject, decision, beforeMap);
                // If agent claimed to generate/update but file doesn't exist, report error
                if ((decision.action === 'generated-artifact' || decision.action === 'updated-artifact') &&
                    entry.action === 'matched') {
                    const filePath = path.join(absoluteProject, decision.targetRelativePath);
                    try {
                        await readFile(filePath, 'utf-8');
                    }
                    catch {
                        errors.push({
                            path: decision.targetRelativePath,
                            error: 'Agent returned generated/updated but file was not written',
                        });
                        continue;
                    }
                }
                entries.push(entry);
            }
            catch (error) {
                errors.push({
                    path: decision.targetRelativePath,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return buildReport(absoluteProject, tasks, entries, errors);
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
