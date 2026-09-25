# code-check

Weft pipelines for keeping code, specs, docs, tests, and translations in sync across Human Horizon projects.

All agents use `model: 'code-check-model'` (configured in `.lore/weft/.env`). Agents write files directly via the `write` tool; the pipeline classifies the result by comparing file state before and after the agent step.

## Architecture

```
code-check/
├── src/
│   ├── index.ts                   # re-exports all runners
│   ├── artifact-sync.ts           # generic code ↔ artifact sync engine
│   ├── doc-template.ts            # legacy HTML template, unused by VitePress pipelines
│   ├── spec-check.ts              # code-specs ↔ code
│   ├── doc-check.ts               # VitePress Markdown ↔ code
│   ├── doc-translation-check.ts   # docs/ru ← English docs Markdown
│   ├── test-check.ts              # unit tests next to source
│   ├── integration-e2e-check.ts   # integration + e2e tests
│   └── project-spec-check.ts      # specs/*.md from code
├── pipelines/                         # Installed in this order with numeric prefixes
│   ├── generate-specs.ts               # 01-generate-specs.ts
│   ├── generate-project-specs.ts        # 02-generate-project-specs.ts
│   ├── generate-tests.ts               # 03-generate-tests.ts
│   ├── generate-integration-e2e.ts     # 04-generate-integration-e2e.ts
│   ├── generate-docs.ts                # 05-generate-docs.ts
│   ├── generate-doc-translations.ts    # 06-generate-doc-translations.ts
│   └── check-problems.ts               # 07-check-problems.ts
└── specs/
    └── Spec.md                    # project specification
```

### Engine: `artifact-sync`

The core is `runArtifactSync()`. It scans code and artifact files, builds pairs, runs an agent for each, and collects a report.

**Task types:**
- `matched` — both code and artifact exist → agent checks alignment
- `code-only` — code exists, no artifact → agent generates artifact
- `artifact-only` — artifact exists, no code → agent generates code

**Result classification:**
- `generated-artifact` — file created (before: null, after: exists)
- `updated-artifact` / `updated-code` — file changed (before ≠ after)
- `matched` — file unchanged

If the agent returns `generated`/`updated` but the file is not on disk, the pipeline reports an error.

## Directories

| Directory | Purpose | Language |
|---|---|---|
| `code-specs/` | Per-file specs tied to source files | Russian |
| `docs/**/*.md` except `docs/ru/` | English VitePress pages | English |
| `docs/ru/**/*.md` | Russian VitePress translations | Russian |
| `specs/` | Free-form project specs (architecture, design, API overview) | Russian |
| `tests/` | Unit tests next to source; integration/e2e in `tests/integration/` and `tests/e2e/` | — |

### Conventions

- `code-specs/*.md` and `specs/*.md` — written in Russian
- `docs/**/*.md` except `docs/ru/` and `.vitepress/` — written in English
- `docs/ru/**/*.md` — written in Russian (translated from the matching English page)
- Source code — written in English
- VitePress frontmatter, components, containers, Markdown links, and fenced code blocks are preserved; code-check does not wrap pages in HTML

## Pipelines

| Order | Weft filename | Source file | Function | Purpose |
|---:|---|---|---|---|
| 1 | `01-generate-specs` | `pipelines/generate-specs.ts` | `runSpecCheck` | Sync `code-specs/` with source |
| 2 | `02-generate-project-specs` | `pipelines/generate-project-specs.ts` | `runProjectSpecCheck` | Generate `specs/*.md` |
| 3 | `03-generate-tests` | `pipelines/generate-tests.ts` | `runTestCheck` | Verify unit test coverage |
| 4 | `04-generate-integration-e2e` | `pipelines/generate-integration-e2e.ts` | `runIntegrationE2eCheck` | Generate integration/e2e tests |
| 5 | `05-generate-docs` | `pipelines/generate-docs.ts` | `runDocCheck` | Generate/sync English VitePress Markdown in `docs/` |
| 6 | `06-generate-doc-translations` | `pipelines/generate-doc-translations.ts` | `runDocTranslationCheck` | Translate English Markdown in `docs/` → `docs/ru/` |
| 7 | `07-check-problems` | `pipelines/check-problems.ts` | `runProblemCheck` | Analyze code problems |

The numeric prefixes determine the alphabetical order in `weft list`; these remain independent pipelines and are not automatically chained.

### 01-generate-specs

Scans source files, for each finds or generates `code-specs/<path>.md`. The agent reads the code and writes a specification in Russian describing behavior, public API, types, and implementation details.

### 02-generate-project-specs

Generates free-form project specs `specs/*.md` in Russian. The agent reads all source files and `code-specs/`, writes a high-level specification: architecture, design decisions, API overview, data flow.

### 03-generate-tests

Verifies every source file has a unit test:

- TypeScript: `*.test.ts`
- Go: `*_test.go`
- Rust: `#[cfg(test)]` block inside the file

If a test is missing, the agent generates one.

### 04-generate-integration-e2e

Two-stage pipeline:

1. **Plan**: agent reads code, `code-specs`, and English Markdown pages under `docs/`, produces a test plan
2. **Generate**: for each file in the plan, agent writes the test

- `tests/integration/` — based on `code-specs/`
- `tests/e2e/` — based on English VitePress Markdown, excluding `docs/ru/`

### 05-generate-docs

Scans source files and synchronizes each one with a VitePress Markdown page at `docs/<source-path>.md` (for example, `src/greet.ts` ↔ `docs/src/greet.md`). The English scan excludes `docs/ru/`; hidden VitePress configuration under `docs/.vitepress/` is excluded by the file walker. Standalone pages with no matching source file are left alone rather than converted into source code. The agent writes Markdown directly without an HTML document wrapper.

### 06-generate-doc-translations

For every English page `docs/<path>.md`, reads the existing Russian page `docs/ru/<path>.md` (if present) and decides whether translation is needed. It preserves YAML frontmatter, Markdown, VitePress components/containers, and code; translates visible text and human-facing metadata; localizes internal links according to the site's VitePress locale configuration while preserving external URLs and anchors. No HTML post-processing is applied.

### 07-check-problems

Analyzes source files and records code problems in `problems/`.

## Usage

### Install and update

Run from the project root:

```bash
code-check install [project-path]
code-check update [project-path]
```

`update` upgrades `@human-horizon/code-check` to `latest` in `.lore/weft` and refreshes the numbered pipeline entry points. `install` also installs the latest package version and synchronizes those entry points.

### CLI (via weft)

After `code-check install`, the numbered entry points appear in `.lore/weft/pipelines/code-check/` and sort in the required order:

```bash
cd /path/to/project

weft run .lore/weft/pipelines/code-check/01-generate-specs.ts
weft run .lore/weft/pipelines/code-check/02-generate-project-specs.ts
weft run .lore/weft/pipelines/code-check/03-generate-tests.ts
weft run .lore/weft/pipelines/code-check/04-generate-integration-e2e.ts
weft run .lore/weft/pipelines/code-check/05-generate-docs.ts
weft run .lore/weft/pipelines/code-check/06-generate-doc-translations.ts
weft run .lore/weft/pipelines/code-check/07-check-problems.ts
```

### Library

```typescript
import {
    runSpecCheck,
    runDocCheck,
    runDocTranslationCheck,
    runTestCheck,
    runIntegrationE2eCheck,
    runProjectSpecCheck,
} from 'code-check'

const result = await runDocCheck('/path/to/project')
if (result.ok) {
    console.log(result.value)
}
```

Via subpath exports:

```typescript
import { runSpecCheck } from 'code-check/spec-check'
import { runDocCheck } from 'code-check/doc-check'
import { runDocTranslationCheck } from 'code-check/doc-translation-check'
import { runTestCheck } from 'code-check/test-check'
import { runIntegrationE2eCheck } from 'code-check/integration-e2e-check'
import { runProjectSpecCheck } from 'code-check/project-spec-check'
```

### Report format

```typescript
interface ArtifactSyncReport {
    projectPath: string
    totalTasks: number
    matched: number
    updated: ReportEntry[]
    generatedArtifacts: ReportEntry[]
    generatedCode: ReportEntry[]
    unchanged: ReportEntry[]
    errors: Array<{ path: string; error: string }>
}
```

For `generate-doc-translations`:

```typescript
interface DocTranslationCheckReport {
    projectPath: string
    totalFiles: number
    generated: TranslationEntry[]
    updated: TranslationEntry[]
    matched: TranslationEntry[]
    errors: Array<{ path: string; error: string }>
}
```

## Development

```bash
cd /path/to/code-check
pnpm install
pnpm test       # vitest (28 tests)
pnpm check      # tsc --noEmit
pnpm build      # tsc → dist/src/
```

## Code style

- TypeScript, no semicolons, 4-space indentation, single quotes
- Explicit return types on exported functions
- `Result<T, E>` for errors (no throws in public API)
- No `any`/`as` except `as const`
- Agents write files directly — no base64 round-trip

## Dependencies

- `@human-horizon/weft` — pipeline framework
- `zod` — agent response validation schemas

