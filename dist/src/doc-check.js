import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runArtifactSync, } from './artifact-sync.js';
import { DOC_TEMPLATE } from './doc-template.js';
function extractDocContent(html) {
    const articleMatch = html.match(/<article class="doc-container">\s*([\s\S]*?)\s*<\/article>/i);
    if (articleMatch && articleMatch[1]) {
        return articleMatch[1].trim();
    }
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) {
        return bodyMatch[1].trim();
    }
    return html.trim();
}
function removeFooter(content) {
    return content.replace(/\s*<footer>[\s\S]*?<\/footer>\s*/g, '').trim();
}
function ensureLanguageClasses(content, lang) {
    return content.replace(/<pre><code(?![^>]*\bclass=)/gi, `<pre><code class="language-${lang}"`);
}
function highlightSignatures(content, lang) {
    return content.replace(/<div class="signature">\s*([\s\S]*?)\s*<\/div>/gi, (match, inner) => {
        if (/<pre>|<code\b/i.test(inner)) {
            return match;
        }
        const clean = inner.trim();
        if (!clean) {
            return match;
        }
        return `<div class="signature"><code class="language-${lang}">${clean}</code></div>`;
    });
}
function sourceLanguageForDoc(relDocPath) {
    const match = relDocPath.match(/^docs\/en\/(.+)\.html$/);
    const sourcePath = match && match[1] ? match[1] : '';
    if (sourcePath.endsWith('.go')) {
        return 'go';
    }
    if (sourcePath.endsWith('.rs')) {
        return 'rust';
    }
    return 'typescript';
}
function titleForDoc(relDocPath) {
    const sourcePath = relDocPath.replace(/^docs\/en\//, '').replace(/\.html$/, '');
    return path.basename(sourcePath);
}
async function normalizeDocs(projectPath) {
    const docsEnRoot = path.join(projectPath, 'docs', 'en');
    let entries = [];
    try {
        entries = await readdir(docsEnRoot, { recursive: true });
    }
    catch {
        return;
    }
    const htmlFiles = entries
        .map((entry) => path.join(docsEnRoot, entry))
        .filter((entry) => entry.endsWith('.html'));
    for (const absolutePath of htmlFiles) {
        const relDocPath = path.relative(projectPath, absolutePath).replace(/\\/g, '/');
        const raw = await readFile(absolutePath, 'utf-8');
        let content = extractDocContent(raw);
        content = removeFooter(content);
        const lang = sourceLanguageForDoc(relDocPath);
        content = ensureLanguageClasses(content, lang);
        content = highlightSignatures(content, lang);
        const title = titleForDoc(relDocPath);
        const finalHtml = DOC_TEMPLATE
            .replace('{{TITLE}}', title)
            .replace('{{CONTENT}}', content);
        await writeFile(absolutePath, finalHtml, 'utf-8');
    }
}
export async function runDocCheck(projectPath) {
    const result = await runArtifactSync({
        projectPath,
        artifactDir: 'docs/en',
        artifactExt: '.html',
        artifactName: 'documentation',
        artifactTemplate: DOC_TEMPLATE,
    });
    if (!result.ok) {
        return result;
    }
    await normalizeDocs(path.resolve(projectPath));
    return result;
}
