# Turborepo Adoption, CI Restructure & Toolchain Normalization

**Date:** 2026-03-17
**Status:** Approved
**Scope:** kata-mono monorepo infrastructure

## Problem

The monorepo CI runs all validation jobs on every PR regardless of what changed. This causes unrelated failures to block unrelated PRs, leading to the gates being disabled entirely. The repo also has fragmented toolchains (4 test runners, linting only on one app, inconsistent conventions) that increase maintenance burden and make onboarding harder.

A fifth app (Symphony, Rust) is joining the monorepo, adding another runtime to manage.

## Goals

1. PRs only run validation relevant to the code that changed
2. Adopt Turborepo for task graph management, dependency-aware filtering, and caching
3. Normalize test runners, linting, and conventions across the monorepo
4. Integrate Symphony (Rust) into the monorepo with its own CI path
5. Re-enable local pre-push validation that mirrors CI
6. Maintain existing release automation (npm publish, electron-builder, GitHub Releases)

## Repo Structure (Target)

```
kata-mono/
├── apps/
│   ├── cli/            # Node.js CLI (npm publish)
│   ├── context/        # Context indexing tool
│   ├── electron/       # Desktop app (electron-builder)
│   ├── online-docs/    # Docs (excluded from workspaces + Turborepo)
│   ├── orchestrator/   # Meta-prompting system (npm publish)
│   ├── symphony/       # Rust binary — moved from kata-symphony-rust
│   └── viewer/         # Vite web app
├── packages/
│   ├── core/           # Type definitions
│   ├── mermaid/        # Mermaid renderer
│   ├── shared/         # Core business logic
│   └── ui/             # Shared React components
├── turbo.json          # Task graph definition
├── eslint.config.ts    # Shared ESLint flat config
├── package.json        # Bun workspaces (symphony excluded, not a JS package)
└── .github/workflows/
    ├── ci.yml                 # Turborepo --affected gate + Symphony + E2E + gate job
    ├── cli-release.yml        # Updated to use turbo build
    ├── desktop-release.yml    # Updated to use turbo build
    ├── orc-release.yml        # Updated to use turbo build
    ├── symphony-release.yml   # New — Cargo build + GitHub Release
    ├── claude.yml             # Unchanged
    └── claude-code-review.yml # Unchanged
```

Symphony lives in `apps/symphony` but is not in the Bun workspaces array (it is not a JS package). Turborepo does not orchestrate it. It has its own CI job with path filters and Rust toolchain.

## Turborepo Task Graph

`turbo.json` defines four tasks:

### lint
- No task dependencies
- Runs per-package `lint` script
- Inputs: source files, ESLint configs

### typecheck
- Depends on: `^typecheck` (workspace dependencies first)
- Runs `tsc --noEmit` per package
- Inputs: source files, tsconfig files

### test
- Depends on: `^build` (if any package needs built output for tests)
- Runs per-package `test` script
- Inputs: source files, test files

### build
- Depends on: `^build` (workspace dependencies first)
- Runs per-package `build` script
- Inputs: source files, build config
- Outputs: `dist/`, `build/` (cached)

The `^` prefix means "run this task in my workspace dependencies first." If `apps/electron` depends on `packages/shared`, `turbo run typecheck` typechecks `shared` before `electron`.

Packages without a given script are automatically skipped. `apps/cli` runs its tests via its own `test` script (Node-compatible under Bun). `apps/online-docs` is excluded from workspaces, so Turborepo ignores it.

**Per-package script migration:** Each app/package that does not already have `lint`, `test`, `typecheck`, and `build` scripts needs them added to its local `package.json`. The root-level `validate:ci` becomes `turbo run lint typecheck test build --affected`.

## Toolchain Normalization

### Current State

| App/Package | Test Runner | Linting | Build Tool | Runtime |
|---|---|---|---|---|
| cli | Node `--test` | none | tsc | Node |
| context | Vitest | none | tsc | Node |
| electron | Bun test + Playwright E2E | ESLint flat config (5 custom rules) | esbuild + Vite | Electron/Node/Bun |
| orchestrator | Node `--test` (CJS) | none | esbuild (hooks only) | Node |
| viewer | none | none | Vite | Browser |
| symphony | cargo test | N/A (Rust) | cargo | Rust |
| packages/core | none | none | none (types only) | — |
| packages/mermaid | Bun test | none | Bun | Bun |
| packages/shared | Bun test | none | none (source dist) | Bun/Node |
| packages/ui | Bun test | none | none (source dist) | Browser |

### Target State

**Unit/integration testing: Bun test everywhere (JS/TS)**

Bun test is already the majority runner. Migrations:
- `apps/context`: Vitest to Bun test (similar API, minimal change)
- `apps/orchestrator`: Node `--test` CJS to Bun test (requires CJS to ESM migration for test files)
- `apps/cli`: Node `--test` to Bun test (CLI ships as Node package, but Bun can run Node-compatible code)
- `apps/viewer` and `packages/core`: add minimal smoke tests so `turbo run test` has coverage everywhere

Test file convention: `.test.ts` in `__tests__/` directories.

Symphony stays on `cargo test`.

**E2E testing: Playwright for electron**

- Mocked E2E: runs in CI on electron version bumps (same trigger as today)
- Live E2E: local-only / manual trigger (requires real accounts)
- Other apps: no E2E needed currently; Playwright infrastructure is available if needed later

**Linting: shared ESLint flat config**

- Root `eslint.config.ts` with TypeScript + React rules
- Electron extends root with its 5 custom rules
- All JS/TS apps and packages get linted via `turbo run lint`
- Symphony: `cargo clippy` + `cargo fmt --check` (in its own CI job)

**Build tools stay varied (intentionally):**

Each app has different output requirements. Vite, esbuild, and tsc are all appropriate for their respective apps. No normalization needed here.

## CI Architecture

### ci.yml — PR Gate (on pull_request to main)

**Job 1: validate (JS/TS)**
- Setup Bun
- `bun install`
- `turbo run lint typecheck test --affected`
- Turborepo determines what to run based on changed files and dependency graph

**Job 2: validate-symphony (Rust)**
- Path filter: `apps/symphony/**`
- Setup Rust toolchain
- `cargo test`, `cargo clippy`, `cargo fmt --check`
- Only runs when Symphony files change

**Job 3: e2e-mocked (Desktop)**
- Needs: validate
- Only runs on version bump in `apps/electron/package.json` (same logic as today)
- Playwright mocked E2E
- Uploads Playwright report on failure

**Job 4: gate**
- Needs: [validate, validate-symphony, e2e-mocked]
- `if: always()`
- Passes when all upstream jobs succeeded or were skipped
- Fails if any upstream job failed
- This is the single required check in GitHub branch protection

This gate pattern solves the original problem: jobs that do not run (because their paths were not touched) report as "skipped," and the gate job treats skipped as passing.

### Release Workflows (on push to main)

Same pattern as today, cleaned up to use Turborepo for builds:

- `cli-release.yml`: path filter `apps/cli/**` → version check → `turbo run build --filter=@kata/cli` → npm publish → git tag
- `desktop-release.yml`: path filter `apps/electron/**` → version check → `turbo run build --filter=@kata/electron` → electron-builder → GitHub Release
- `orc-release.yml`: path filter `apps/orchestrator/**` → version check → `turbo run build --filter=@kata/orchestrator` → npm publish → git tag
- `symphony-release.yml` (new): path filter `apps/symphony/**` → version check → `cargo build --release` → GitHub Release

### Pre-push Hook

```bash
#!/bin/bash
# .githooks/pre-push
turbo run lint typecheck test --affected
```

Same command as CI. Locally cached, so repeat pushes on the same branch are fast.

### Remote Caching

Turborepo remote cache enabled via Vercel (free tier). CI and local dev share the cache. If CI already validated a package with identical inputs, a local `turbo run` gets a cache hit and skips it.

## Migration Phases

### Phase 1: Foundation (no CI changes)
- Add `turbo.json` to root
- Install `turbo` as root devDependency
- Add per-package scripts (`lint`, `typecheck`, `test`, `build`) to each app/package `package.json`
- Create root `eslint.config.ts` shared config
- Add local ESLint configs to apps/packages extending root
- Verify `turbo run lint typecheck test --affected` works locally
- Validate whether any package actually needs `^build` as a test dependency; remove if none do to avoid unnecessary serial work in the task graph

### Phase 2: Pull in Symphony
- Move `kata-symphony-rust` into `apps/symphony`
- Archive the `kata-symphony-rust` repo after migration (no further commits there)
- Verify `cargo test` / `cargo clippy` / `cargo fmt --check` pass in new location
- Update any path references in Symphony's code or configs

### Phase 3: Test runner normalization
- Migrate `apps/context` from Vitest to Bun test
- Migrate `apps/orchestrator` from Node `--test` CJS to Bun test
- Migrate `apps/cli` from Node `--test` to Bun test
- Standardize test file naming to `.test.ts` in `__tests__/` dirs
- Add minimal tests for `apps/viewer` and `packages/core`

### Phase 4: CI rewrite
- Replace `ci.yml` with Turborepo-based workflow (validate + validate-symphony + e2e-mocked + gate)
- Update release workflows to use `turbo run build --filter=...`
- Enable Turborepo remote caching in CI
- Configure GitHub branch protection to require only the `gate` job
- Add `symphony-release.yml`

### Phase 5: Local DX
- Re-enable pre-push hook using `turbo run lint typecheck test --affected` (compares against the merge-base with `origin/main`, so it covers all commits on the current branch)
- Set up remote cache for local dev (`turbo login` / Vercel account link)
- Update root `package.json` convenience scripts to delegate to Turborepo
- Clean up old root-level scripts that Turborepo replaces (`validate:ci`, `test:packages`, `typecheck:all`, etc.)

### Risk Mitigation

- Phase 1 is additive-only. Nothing breaks, existing CI keeps working.
- Phase 4 (CI rewrite) happens after everything else is validated locally. Old CI stays in place until the new one is proven.
- Each phase is independently mergeable. If something goes wrong, you can stop and fix without blocking other work.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Turborepo orchestrates Rust builds? | No | Cargo has its own cache; Rust needs separate toolchain setup. Symphony gets its own CI job with path filters. |
| Single initiative or separate? | Single | CI cleanup and Turborepo adoption solve the same problem. Doing CI first with hand-rolled path filters creates throwaway work. |
| Test runner standard | Bun test | Already the majority runner. Consistent API, fast, native to the monorepo's package manager. |
| E2E framework | Playwright | Already in use for electron. Right tool for desktop app testing. |
| Linting approach | Shared root ESLint flat config | One source of truth, per-app extensions for custom rules. |
| Branch protection strategy | Single "gate" job | Handles optional/skipped jobs cleanly. One required check regardless of what ran. |
| CLI testing migration | Bun test (from Node --test) | Consistency wins over runtime purity. Bun runs Node-compatible code. |
