export const HUMAN_HORIZON_PRINCIPLES = `Human Horizon Development Standards

PRIORITIES: 1) correctness/safety 2) explicitness 3) simplicity 4) maintainability 5) development speed

PHILOSOPHY:
- Explicit over implicit — dependencies, state, errors, boundaries, runtime assumptions must be explicit
- Correctness over convenience — never sacrifice type safety, tests, validation/parsing, or architectural boundaries
- Make invalid states unrepresentable — prefer types and state models where impossible states cannot be expressed
- Parse, don't validate — transform unknown input into validated domain types at boundaries
- Errors as values — expected failures must be represented explicitly and handled deliberately
- KISS — simplest solution that preserves correctness, explicitness, and future maintainability
- YAGNI — don't add behavior, extension points, abstractions, or dependencies not needed by current use case
- DRY — avoid duplication only after duplicated meaning has stabilized; two repetitions may stay, three need review
- SOLID as heuristics for modules/interfaces, not OOP dogma; no DI containers, deep inheritance, or abstract factories
- Composition over inheritance — prefer composition, functions, small modules, explicit interfaces
- Local reasoning — a module should be understandable without knowing the entire project
- No hidden magic — no global side effects, auto-registration, monkey patching, implicit DI, undocumented conventions

FORBIDDEN BY DEFAULT (everything is forbidden unless explicitly allowed in specs):
- New languages, frameworks, libraries, tools, architectural patterns, runtime assumptions, network protocols, storage mechanisms, build systems without explicit permission
- TypeScript: no 'any', no disabling type checks, no suppressing type errors, no second test framework
- Architecture: no hidden global mutable state, no implicit DI, no monkey patching, no undocumented conventions, no duplicated source of truth, no platform-specific code leaking into shared layers
- Process: no skipping TDD for production code, no abstractions without current use case, no dependencies without updating allowed/decisions, no changing public behavior without updating docs
- Package managers: pnpm only for new projects (npm and yarn not allowed)

ALLOWED LANGUAGES:
- TypeScript (preferred): frontend, backend, tooling, shared logic, webview UI, runtime adapters
- Go: CLI utilities, TUI apps, system tools, bridge layer, network services, compilers/interpreters
- Rust: (when explicitly chosen)

TYPESCRIPT STYLE:
- 4-space indentation, no semicolons, single quotes, trailing commas, 100 char max line
- Never 'any' — use 'unknown' with type guards
- Never 'as' — use type guards (except 'as const')
- Explicit return types on all functions
- 'interface' for objects, 'type' for unions
- 'import type' for type-only imports
- Result<T, E> for errors instead of throwing
- Union types instead of enums
- Function declarations at top level, not const arrow functions
- Destructure params object when >3 parameters
- No prefix 'I' on interfaces

ALLOWED TOOLS:
- pnpm (preferred package manager)
- Vitest (test runner for TypeScript)
- StrykerJS (mutation testing)
- Go toolchain: go test, go fmt/gofumpt, golangci-lint, go vet

AGENT RULES:
- Follow TDD: Red, Green, Refactor
- Treat existing specs as single source of truth
- Stop and ask when solution is missing — do not invent
- No introducing new languages/frameworks/libraries/tools/patterns without explicit permission
- Prefer correctness, explicitness, local reasoning, testability, minimal safe implementation`
