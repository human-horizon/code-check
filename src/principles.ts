export const HUMAN_HORIZON_PRINCIPLES = `Human Horizon Development Standards (distilled):

Languages: TypeScript (preferred), Go, Rust.
TypeScript: no semicolons, 4-space indentation, single quotes, trailing commas.
Never use 'any' — use 'unknown' with type guards.
Never use 'as' — use type guards (except 'as const').
Explicit return types on all functions.
'interface' for objects, 'type' for unions.
'import type' for type-only imports.
Result<T, E> for errors instead of throwing.
Union types instead of enums.
Function declarations at top level, not const arrow functions.
Destructure params object when >3 parameters.

Go: table-driven tests, go fmt/gofumpt, golangci-lint.

Tools: pnpm (preferred over npm/yarn), Vitest for TS tests, StrykerJS for mutation testing.

Philosophy: correctness over convenience, explicit over implicit, make invalid states unrepresentable, parse don't validate, errors as values, KISS, YAGNI, DRY only after meaning stabilizes, composition over inheritance, local reasoning, no hidden magic.

Agents: follow TDD (Red-Green-Refactor), treat existing specs as single source of truth, stop and ask when solution is missing.`
