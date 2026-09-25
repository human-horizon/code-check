import { describe, it, expect } from "vitest"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
    buildSyncTasks,
    detectLang,
    removeExt,
    artifactRelativePathForCode,
    scanArtifactFiles,
    buildReport,
} from "./artifact-sync.js"
import type { CodeFile, ArtifactFile } from "./artifact-sync.js"

function codeFile(relativePath: string, lang = "typescript"): CodeFile {
    return {
        lang: lang as CodeFile["lang"],
        relativePath,
        absolutePath: `/project/${relativePath}`,
    }
}

function artifactFile(relativePath: string): ArtifactFile {
    return {
        relativePath,
        absolutePath: `/project/${relativePath}`,
    }
}

describe("detectLang", () => {
    it("recognizes typescript", () => {
        expect(detectLang("src/main.ts")).toBe("typescript")
    })

    it("recognizes go", () => {
        expect(detectLang("src/main.go")).toBe("go")
    })

    it("recognizes rust", () => {
        expect(detectLang("src/main.rs")).toBe("rust")
    })

    it("ignores test files", () => {
        expect(detectLang("src/main.test.ts")).toBeNull()
        expect(detectLang("src/main.spec.ts")).toBeNull()
        expect(detectLang("src/main_test.go")).toBeNull()
    })
})

describe("removeExt", () => {
    it("removes extension", () => {
        expect(removeExt("src/main.ts")).toBe("src/main")
    })

    it("returns path without extension as is", () => {
        expect(removeExt("src/main")).toBe("src/main")
    })
})

describe("artifactRelativePathForCode", () => {
    it("maps code path to spec path", () => {
        expect(
            artifactRelativePathForCode("src/main.ts", "code-specs", ".md"),
        ).toBe("code-specs/src/main.md")
    })

    it("maps code path to VitePress Markdown path", () => {
        expect(artifactRelativePathForCode("src/main.ts", "docs", ".md")).toBe(
            "docs/src/main.md",
        )
    })
})

describe("scanArtifactFiles", () => {
    it("excludes locale directories while scanning VitePress Markdown", async (): Promise<void> => {
        const projectPath = await mkdtemp(
            path.join(tmpdir(), "code-check-docs-"),
        )
        const docsPath = path.join(projectPath, "docs")
        try {
            await mkdir(path.join(docsPath, "ru"), { recursive: true })
            await mkdir(path.join(docsPath, ".vitepress"), { recursive: true })
            await writeFile(
                path.join(docsPath, "index.md"),
                "# English",
                "utf-8",
            )
            await writeFile(
                path.join(docsPath, "ru", "index.md"),
                "# Русский",
                "utf-8",
            )
            await writeFile(
                path.join(docsPath, ".vitepress", "guide.md"),
                "# Config",
                "utf-8",
            )

            const files = await scanArtifactFiles(projectPath, "docs", ".md", [
                "ru",
            ])

            expect(files.map((file) => file.relativePath)).toEqual([
                "docs/index.md",
            ])
        } finally {
            await rm(projectPath, { recursive: true, force: true })
        }
    })
})

describe("buildSyncTasks", () => {
    it("returns empty tasks for empty inputs", () => {
        expect(buildSyncTasks([], [], "code-specs", ".md")).toEqual([])
    })

    it("creates code-only task when artifact is missing", () => {
        const code = codeFile("src/main.ts")
        const tasks = buildSyncTasks([code], [], "code-specs", ".md")
        expect(tasks).toHaveLength(1)
        expect(tasks[0]).toEqual({ kind: "code-only", code })
    })

    it("creates artifact-only task when code is missing", () => {
        const artifact = artifactFile("code-specs/src/main.md")
        const tasks = buildSyncTasks([], [artifact], "code-specs", ".md")
        expect(tasks).toHaveLength(1)
        expect(tasks[0]).toEqual({ kind: "artifact-only", artifact })
    })

    it("can ignore standalone VitePress pages instead of generating source code", () => {
        const artifact = artifactFile("docs/index.md")
        const tasks = buildSyncTasks([], [artifact], "docs", ".md", false)
        expect(tasks).toEqual([])
    })

    it("creates matched task when both files exist", () => {
        const code = codeFile("src/main.ts")
        const artifact = artifactFile("code-specs/src/main.md")
        const tasks = buildSyncTasks([code], [artifact], "code-specs", ".md")
        expect(tasks).toHaveLength(1)
        expect(tasks[0]).toEqual({ kind: "matched", code, artifact })
    })
})

describe("buildReport", () => {
    it("classifies matched entries", () => {
        const report = buildReport(
            "/project",
            [],
            [
                {
                    path: "src/main.ts",
                    action: "matched",
                    description: "ok",
                },
            ],
            [],
        )
        expect(report.matched).toBe(1)
        expect(report.updated).toHaveLength(0)
    })
})
