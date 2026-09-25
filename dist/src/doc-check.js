import { runArtifactSync, } from "./artifact-sync.js";
const VITEPRESS_MARKDOWN_INSTRUCTIONS = [
    "Write valid VitePress Markdown, not a standalone HTML document.",
    "Use Markdown headings, lists, tables, and fenced code blocks with language identifiers.",
    "Preserve existing YAML frontmatter and VitePress syntax, including containers and Vue components.",
    "Do not add an HTML document wrapper, page-level CSS, or script tags.",
].join(" ");
export function runDocCheck(projectPath) {
    return runArtifactSync({
        projectPath,
        artifactDir: "docs",
        artifactExt: ".md",
        artifactName: "documentation",
        artifactLanguage: "English",
        artifactInstructions: VITEPRESS_MARKDOWN_INSTRUCTIONS,
        artifactExcludedDirs: ["ru"],
        ignoreArtifactOnly: true,
    });
}
