#!/usr/bin/env node
import { mkdir, copyFile, readFile, rm } from "node:fs/promises"
import { execSync } from "node:child_process"
import path from "node:path"

const PIPELINE_FILES = [
    ["generate-specs.ts", "01-generate-specs.ts"],
    ["generate-project-specs.ts", "02-generate-project-specs.ts"],
    ["generate-tests.ts", "03-generate-tests.ts"],
    ["generate-integration-e2e.ts", "04-generate-integration-e2e.ts"],
    ["generate-docs.ts", "05-generate-docs.ts"],
    ["generate-doc-translations.ts", "06-generate-doc-translations.ts"],
    ["check-problems.ts", "07-check-problems.ts"],
] as const

const LEGACY_PIPELINE_FILES = [
    "generate-specs.ts",
    "generate-project-specs.ts",
    "generate-tests.ts",
    "generate-integration-e2e.ts",
    "generate-docs.ts",
    "generate-doc-translations.ts",
    "check-problems.ts",
    "check-specs.ts",
    "check-project-specs.ts",
    "check-tests.ts",
    "check-integration-e2e.ts",
    "check-docs.ts",
    "check-doc-translations.ts",
    "check-dead-code.ts",
] as const

async function install(
    projectPath: string,
    command: "install" | "update",
): Promise<void> {
    const absPath = path.resolve(projectPath)
    const dstPipelines = path.join(
        absPath,
        ".lore",
        "weft",
        "pipelines",
        "code-check",
    )
    const weftDir = path.join(absPath, ".lore", "weft")
    const hasPnpm = await readFile(path.join(weftDir, "pnpm-lock.yaml"))
        .then(() => true)
        .catch(() => false)
    const packageManagerCommand = hasPnpm
        ? "pnpm add --config.minimumReleaseAge=0"
        : "npm install"
    const packageName = "@human-horizon/code-check@latest"
    const action = command === "update" ? "updating" : "installing"

    console.log(`  ${action}: ${packageManagerCommand} ${packageName}`)
    execSync(`${packageManagerCommand} ${packageName}`, {
        cwd: weftDir,
        stdio: "inherit",
    })

    const srcPipelines = path.join(
        weftDir,
        "node_modules",
        "@human-horizon",
        "code-check",
        "pipelines",
    )

    // Remove previous unnumbered entries so installs do not leave duplicates.
    await mkdir(dstPipelines, { recursive: true })
    for (const entry of LEGACY_PIPELINE_FILES) {
        await rm(path.join(dstPipelines, entry), { force: true })
    }
    for (const [sourceName, installedName] of PIPELINE_FILES) {
        await copyFile(
            path.join(srcPipelines, sourceName),
            path.join(dstPipelines, installedName),
        )
    }
    console.log(
        `  pipelines: .lore/weft/pipelines/code-check/ (${PIPELINE_FILES.length} files)`,
    )

    const completedAction = command === "update" ? "updated" : "installed"
    console.log(`\ncode-check ${completedAction} at ${absPath}`)
}

async function main(args: string[]): Promise<void> {
    const command = args[0]

    if (command === "install" || command === "update") {
        const projectPath = args[1] ?? process.cwd()
        await install(projectPath, command)
        process.exit(0)
    }

    console.error("Usage: code-check install|update [project-path]")
    process.exit(1)
}

await main(process.argv.slice(2))
