#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { execSync } from "node:child_process"
import path from "node:path"
import { PIPELINE_FILES, syncPipelineFiles } from "./pipeline-sync.js"

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

    await syncPipelineFiles(srcPipelines, dstPipelines)
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
