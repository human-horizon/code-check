import { weave } from '@human-horizon/weft';
import { z } from 'zod';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { scanCodeFiles, scanArtifactFiles, } from './artifact-sync.js';
const PlanSchema = z.object({
    tests: z.array(z.object({
        path: z.string(),
        description: z.string(),
    })),
});
const TestFileSchema = z.object({
    path: z.string(),
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
function safeKey(id) {
    return id.replace(/[^a-zA-Z0-9]/g, '_');
}
function normalizeContent(value) {
    return value.replace(/\r\n/g, '\n').trimEnd();
}
function hasTestsField(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    for (const [key, val] of Object.entries(value)) {
        if (key === 'tests') {
            if (!Array.isArray(val)) {
                return false;
            }
            return val.every((item) => {
                if (typeof item !== 'object' || item === null) {
                    return false;
                }
                let hasPath = false;
                let hasDescription = false;
                for (const [k, v] of Object.entries(item)) {
                    if (k === 'path' && typeof v === 'string') {
                        hasPath = true;
                    }
                    if (k === 'description' && typeof v === 'string') {
                        hasDescription = true;
                    }
                }
                return hasPath && hasDescription;
            });
        }
    }
    return false;
}
function getTestFile(value) {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    let pathValue;
    let description;
    for (const [key, val] of Object.entries(value)) {
        if (key === 'path' && typeof val === 'string') {
            pathValue = val;
        }
        if (key === 'description' && typeof val === 'string') {
            description = val;
        }
    }
    if (!pathValue || !description) {
        return null;
    }
    return { path: pathValue, description };
}
async function readFileIfExists(projectPath, relPath) {
    try {
        return await readFile(path.join(projectPath, relPath), 'utf-8');
    }
    catch {
        return null;
    }
}
async function ensureTestDir(projectPath, relPath) {
    const targetPath = path.join(projectPath, relPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
}
function buildIntegrationPlanPrompt(projectPath, codeFiles, specFiles) {
    return [
        'You are an integration test planner.',
        `Project path: ${projectPath}`,
        '',
        'Code files:',
        ...codeFiles.map((f) => `- ${f.relativePath}`),
        '',
        'Spec files:',
        ...specFiles.map((f) => `- ${f.relativePath}`),
        '',
        'Analyze the project and decide which integration tests are needed in tests/integration/.',
        'Return JSON with field "tests" containing objects with "path" (relative to project root) and "description" (what this test covers).',
    ].join('\n');
}
function buildE2ePlanPrompt(projectPath, docFiles) {
    return [
        'You are an end-to-end test planner.',
        `Project path: ${projectPath}`,
        '',
        'Documentation files:',
        ...docFiles.map((f) => `- ${f.relativePath}`),
        '',
        'Analyze the documentation and decide which e2e tests are needed in tests/e2e/.',
        'Return JSON with field "tests" containing objects with "path" (relative to project root) and "description" (what user flow this test covers).',
    ].join('\n');
}
function buildIntegrationTestPrompt(projectPath, testPath, description, codeFiles, specFiles) {
    return [
        'You are generating an integration test file.',
        `Project path: ${projectPath}`,
        `Test file path: ${testPath}`,
        `Absolute test file path: ${path.join(projectPath, testPath)}`,
        `Description: ${description}`,
        '',
        'Code files:',
        ...codeFiles.map((f) => `- ${f.relativePath}`),
        '',
        'Spec files:',
        ...specFiles.map((f) => `- ${f.relativePath}`),
        '',
        'Read the relevant code and code-specs, then write the complete integration test file directly using the write tool at the absolute path shown above.',
        'Return JSON with fields: path (relative to project root), description (short summary).',
    ].join('\n');
}
function buildE2eTestPrompt(projectPath, testPath, description, docFiles) {
    return [
        'You are generating an end-to-end test file.',
        `Project path: ${projectPath}`,
        `Test file path: ${testPath}`,
        `Absolute test file path: ${path.join(projectPath, testPath)}`,
        `Description: ${description}`,
        '',
        'Documentation files:',
        ...docFiles.map((f) => `- ${f.relativePath}`),
        '',
        'Read the relevant documentation and write the complete e2e test file directly using the write tool at the absolute path shown above.',
        'Return JSON with fields: path (relative to project root), description (short summary).',
    ].join('\n');
}
function classifyAction(existingContent, afterContent) {
    if (existingContent === null) {
        return afterContent === null ? 'matched' : 'generated';
    }
    if (afterContent === null) {
        return 'matched';
    }
    if (normalizeContent(existingContent) === normalizeContent(afterContent)) {
        return 'matched';
    }
    return 'updated';
}
export async function runIntegrationE2eCheck(projectPath) {
    const absoluteProject = path.resolve(projectPath);
    let codeFiles;
    let specFiles;
    let docFiles;
    try {
        codeFiles = await scanCodeFiles(absoluteProject);
        specFiles = await scanArtifactFiles(absoluteProject, 'code-specs', '.md');
        docFiles = await scanArtifactFiles(absoluteProject, 'docs/en', '.html');
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
    let workflow = weave();
    workflow = workflow.prompt('integration_plan', () => buildIntegrationPlanPrompt(absoluteProject, codeFiles, specFiles), { model: 'free', schema: PlanSchema });
    workflow = workflow.prompt('e2e_plan', () => buildE2ePlanPrompt(absoluteProject, docFiles), { model: 'free', schema: PlanSchema });
    const finalWorkflow = workflow.step('generate', async (ctx) => {
        if (!hasTestsField(ctx.integration_plan)) {
            return {
                projectPath: absoluteProject,
                integrationTotal: 0,
                e2eTotal: 0,
                generated: [],
                updated: [],
                matched: [],
                errors: [{ path: 'integration_plan', error: 'Invalid integration plan' }],
            };
        }
        if (!hasTestsField(ctx.e2e_plan)) {
            return {
                projectPath: absoluteProject,
                integrationTotal: 0,
                e2eTotal: 0,
                generated: [],
                updated: [],
                matched: [],
                errors: [{ path: 'e2e_plan', error: 'Invalid e2e plan' }],
            };
        }
        const integrationPlan = ctx.integration_plan;
        const e2ePlan = ctx.e2e_plan;
        const entries = [];
        const errors = [];
        for (const test of integrationPlan.tests) {
            if (!test.path.startsWith('tests/integration/')) {
                errors.push({ path: test.path, error: 'Path must be inside tests/integration/' });
                continue;
            }
            const existingContent = await readFileIfExists(absoluteProject, test.path);
            await ensureTestDir(absoluteProject, test.path);
            const key = `integration_${safeKey(test.path)}`;
            const testWorkflow = weave()
                .prompt(key, () => buildIntegrationTestPrompt(absoluteProject, test.path, test.description, codeFiles, specFiles), { model: 'free', schema: TestFileSchema });
            try {
                const testResult = await testWorkflow.build().run({});
                const decision = getTestFile(testResult[key]);
                if (!decision) {
                    errors.push({ path: test.path, error: 'Invalid test file result' });
                    continue;
                }
                const afterContent = await readFileIfExists(absoluteProject, decision.path);
                const action = classifyAction(existingContent, afterContent);
                entries.push({ path: decision.path, action, description: decision.description });
            }
            catch (error) {
                errors.push({
                    path: test.path,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        for (const test of e2ePlan.tests) {
            if (!test.path.startsWith('tests/e2e/')) {
                errors.push({ path: test.path, error: 'Path must be inside tests/e2e/' });
                continue;
            }
            const existingContent = await readFileIfExists(absoluteProject, test.path);
            await ensureTestDir(absoluteProject, test.path);
            const key = `e2e_${safeKey(test.path)}`;
            const testWorkflow = weave()
                .prompt(key, () => buildE2eTestPrompt(absoluteProject, test.path, test.description, docFiles), { model: 'free', schema: TestFileSchema });
            try {
                const testResult = await testWorkflow.build().run({});
                const decision = getTestFile(testResult[key]);
                if (!decision) {
                    errors.push({ path: test.path, error: 'Invalid test file result' });
                    continue;
                }
                const afterContent = await readFileIfExists(absoluteProject, decision.path);
                const action = classifyAction(existingContent, afterContent);
                entries.push({ path: decision.path, action, description: decision.description });
            }
            catch (error) {
                errors.push({
                    path: test.path,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return {
            projectPath: absoluteProject,
            integrationTotal: integrationPlan.tests.length,
            e2eTotal: e2ePlan.tests.length,
            generated: entries.filter((e) => e.action === 'generated'),
            updated: entries.filter((e) => e.action === 'updated'),
            matched: entries.filter((e) => e.action === 'matched'),
            errors,
        };
    });
    try {
        const result = await finalWorkflow.build().run({});
        return { ok: true, value: result.generate };
    }
    catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}
