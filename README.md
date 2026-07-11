# code-check

Weft pipelines for keeping code, specs, docs, tests, and translations in sync across Human Horizon projects.

All agents use `model: 'free'` (local model `qwen-3.5-9b`). Agents write files directly via the `write` tool; the pipeline classifies the result by comparing file state before and after the agent step.

## Architecture

```
code-check/
├── src/
│   ├── index.ts                   # re-exports all runners
│   ├── artifact-sync.ts           # generic code ↔ artifact sync engine
│   ├── doc-template.ts            # unified HTML template (dark theme, highlight.js)
│   ├── spec-check.ts              # code-specs ↔ code
│   ├── doc-check.ts               # docs/en ↔ code + HTML post-processing
│   ├── doc-translation-check.ts   # docs/ru ← docs/en (translation)
│   ├── test-check.ts              # unit tests next to source
│   ├── integration-e2e-check.ts   # integration + e2e tests
│   └── project-spec-check.ts      # specs/*.md from code
├── pipelines/
│   ├── check-specs.ts
│   ├── check-docs.ts
│   ├── check-doc-translations.ts
│   ├── check-tests.ts
│   ├── check-integration-e2e.ts
│   └── check-project-specs.ts
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
| `docs/en/` | English HTML documentation | English |
| `docs/ru/` | Russian HTML documentation (translated from `docs/en/`) | Russian |
| `specs/` | Free-form project specs (architecture, design, API overview) | Russian |
| `tests/` | Unit tests next to source; integration/e2e in `tests/integration/` and `tests/e2e/` | — |

### Conventions

- `code-specs/*.md` and `specs/*.md` — written in Russian
- `docs/en/*.html` — written in English
- `docs/ru/*.html` — written in Russian (translated)
- Source code — written in English
- All HTML docs use a unified template: dark theme, highlight.js, `<pre><code class="language-*">`

## Pipelines

| Pipeline | File | Function | Purpose |
|---|---|---|---|
| `check-specs` | `pipelines/check-specs.ts` | `runSpecCheck` | Sync `code-specs/` with source |
| `check-docs` | `pipelines/check-docs.ts` | `runDocCheck` | Generate/sync `docs/en/` |
| `check-doc-translations` | `pipelines/check-doc-translations.ts` | `runDocTranslationCheck` | Translate `docs/en/` → `docs/ru/` |
| `check-tests` | `pipelines/check-tests.ts` | `runTestCheck` | Verify unit test coverage |
| `check-integration-e2e` | `pipelines/check-integration-e2e.ts` | `runIntegrationE2eCheck` | Generate integration/e2e tests |
| `check-project-specs` | `pipelines/check-project-specs.ts` | `runProjectSpecCheck` | Generate `specs/*.md` |

### check-specs

Scans source files, for each finds or generates `code-specs/<path>.md`. The agent reads the code and writes a specification in Russian describing behavior, public API, types, and implementation details.

### check-docs

Scans source files, for each generates `docs/en/<path>.html`. After generation, all HTML files go through post-processing:

1. Extract content from `<article class="doc-container">`
2. Remove `<footer>`
3. Add `class="language-*"` to `<pre><code>` blocks
4. Highlight signatures: `<div class="signature"><code class="language-*">`
5. Wrap in unified template (dark theme, highlight.js)

### check-doc-translations

For each `docs/en/<path>.html`, reads the existing `docs/ru/<path>.html` (if any) and decides whether translation is needed. The agent:

1. Reads the English source
2. Reads the existing Russian translation
3. If the translation is up to date — does nothing (`matched`)
4. If the English changed or no translation exists — generates/updates

Post-processing: same as `check-docs`, but with `<html lang="ru">`.

### check-tests

Verifies every source file has a unit test:

- TypeScript: `*.test.ts`
- Go: `*_test.go`
- Rust: `#[cfg(test)]` block inside the file

If a test is missing, the agent generates one.

### check-integration-e2e

Two-stage pipeline:

1. **Plan**: agent reads code, `code-specs`, and `docs/en/`, produces a test plan
2. **Generate**: for each file in the plan, agent writes the test

- `tests/integration/` — based on `code-specs/`
- `tests/e2e/` — based on `docs/en/`

### check-project-specs

Generates free-form project specs `specs/*.md` in Russian. The agent reads all source files and `code-specs/`, writes a high-level specification: architecture, design decisions, API overview, data flow.

## Usage

### CLI (via weft)

```bash
cd /path/to/code-check

weft run pipelines/check-specs.ts /path/to/project
weft run pipelines/check-docs.ts /path/to/project
weft run pipelines/check-doc-translations.ts /path/to/project
weft run pipelines/check-tests.ts /path/to/project
weft run pipelines/check-integration-e2e.ts /path/to/project
weft run pipelines/check-project-specs.ts /path/to/project
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

For `check-doc-translations`:

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
pnpm test       # vitest (25 tests)
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
- `highlight.js` — syntax highlighting in HTML docs
