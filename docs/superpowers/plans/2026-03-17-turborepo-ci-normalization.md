# Turborepo Adoption, CI Restructure & Toolchain Normalization — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Turborepo for dependency-aware CI filtering, normalize toolchains across the monorepo, integrate Symphony (Rust), and re-enable local/CI validation gates.

**Architecture:** Turborepo orchestrates all JS/TS lint/typecheck/test/build tasks via `turbo.json`. Symphony (Rust) gets a separate CI job with path filters. A single "gate" GitHub Actions job aggregates all results for branch protection. Local pre-push hook runs the same Turborepo command as CI.

**Tech Stack:** Turborepo, Bun (test runner + package manager), ESLint 9 flat config, GitHub Actions, Playwright (E2E), Cargo (Rust)

**Spec:** `docs/superpowers/specs/2026-03-17-turborepo-ci-normalization-design.md`

---

## Phase 1: Turborepo Foundation

### Task 1.1: Install Turborepo and create turbo.json

**Files:**
- Create: `turbo.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Install turbo as root devDependency**

Run: `bun add -d turbo`

- [ ] **Step 2: Create turbo.json**

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "globalDependencies": ["tsconfig.json"],
  "globalEnv": ["NODE_ENV", "CI"],
  "tasks": {
    "lint": {
      "outputs": [],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.mjs", "eslint.config.*"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"],
      "outputs": [],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"]
    },
    "test": {
      "outputs": [],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "test/**/*.ts"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Note: `test` does NOT depend on `^build`. Per spec, validate during this phase whether any package actually needs built dependencies for tests. If none do (likely), this avoids unnecessary serial work.

- [ ] **Step 3: Add turbo output directories to .gitignore**

Append to `.gitignore`:
```
# Turborepo
.turbo
```

- [ ] **Step 4: Verify turbo is installed and recognizes workspaces**

Run: `bunx turbo ls`
Expected: Lists all workspace packages (cli, context, electron, orchestrator, viewer, core, mermaid, shared, ui)

- [ ] **Step 5: Commit**

```bash
git add turbo.json package.json bun.lock .gitignore
git commit -m "feat: add Turborepo with task graph configuration"
```

---

### Task 1.2: Create shared ESLint flat config at root

**Files:**
- Create: `eslint.config.ts`
- Modify: `package.json` (root — add eslint devDep if not present)

- [ ] **Step 1: Verify ESLint is already a root devDependency**

Check `package.json` — ESLint 9, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` are already in root devDependencies. No install needed.

- [ ] **Step 2: Create root eslint.config.ts**

```typescript
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "apps/symphony/**",
      "apps/online-docs/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
```

Note: This requires `typescript-eslint` as a devDependency. Install it: `bun add -d typescript-eslint`

- [ ] **Step 3: Run ESLint from root to verify config loads**

Run: `bunx eslint --max-warnings=1000 packages/core/src/ --no-error-on-unmatched-pattern`
Expected: ESLint runs without config errors (warnings/errors in code are fine at this stage)

- [ ] **Step 4: Commit**

```bash
git add eslint.config.ts
git commit -m "feat: add shared ESLint flat config at root"
```

---

### Task 1.3: Add per-package lint scripts

For each package/app, add a `lint` script to its `package.json` that runs ESLint on its source files. Electron already has one; update it to extend the root config.

**Files:**
- Modify: `apps/cli/package.json`
- Modify: `apps/context/package.json`
- Modify: `apps/electron/eslint.config.mjs`
- Modify: `apps/orchestrator/package.json`
- Modify: `apps/viewer/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/mermaid/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Add lint script to apps/cli/package.json**

Add to scripts:
```json
"lint": "eslint src/ --max-warnings=0"
```

- [ ] **Step 2: Add lint script to apps/context/package.json**

Add to scripts:
```json
"lint": "eslint src/ --max-warnings=0"
```

- [ ] **Step 3: Update apps/electron/eslint.config.mjs to extend root**

The electron app already has a comprehensive ESLint config with custom rules. Keep its custom rules but import the root config as a base. The electron config already uses flat config format, so prepend the root config array.

At the top of `apps/electron/eslint.config.mjs`, add:
```javascript
import rootConfig from "../../eslint.config.ts";
// Note: If .ts import fails, rename root config to eslint.config.mjs and adjust this import.
// Alternatively, install jiti for TS config support: bun add -d jiti
```

Then spread `...rootConfig` as the first elements of the exported array, before electron's custom config entries. This gives electron the shared rules plus its own custom rules.

Electron already has a `lint` script — no change needed there.

- [ ] **Step 4: Add lint script to apps/orchestrator/package.json**

Note: Orchestrator is pure JavaScript (CJS). The shared ESLint config targets `.ts`/`.tsx` files. Add lint script but it will be a no-op until orchestrator is migrated or a JS rule is added to root config.

Add to scripts:
```json
"lint": "eslint . --max-warnings=0 --no-error-on-unmatched-pattern"
```

- [ ] **Step 5: Add lint script to apps/viewer/package.json**

Add to scripts:
```json
"lint": "eslint src/ --max-warnings=0"
```

- [ ] **Step 6: Add lint script to packages that have TypeScript source**

For `packages/core/package.json`, `packages/mermaid/package.json`, `packages/shared/package.json`, `packages/ui/package.json`, add to scripts:
```json
"lint": "eslint src/ --max-warnings=0"
```

- [ ] **Step 7: Test turbo lint**

Run: `bunx turbo run lint`
Expected: Runs lint across all packages. May have warnings/errors — that's expected. The important thing is that the task graph runs correctly.

- [ ] **Step 8: Fix any lint errors that block the pipeline**

If any package fails to lint (config errors, missing deps), fix them. Reduce severity of existing violations to warnings (`--max-warnings` can be raised temporarily) so the pipeline passes. Do NOT fix all lint warnings now — that's out of scope.

- [ ] **Step 9: Commit**

```bash
git add -A apps/*/package.json packages/*/package.json apps/electron/eslint.config.mjs
git commit -m "feat: add lint scripts to all packages for Turborepo"
```

---

### Task 1.4: Add per-package typecheck scripts

**Files:**
- Modify: `apps/cli/package.json` (already has build which runs tsc, need explicit typecheck)
- Modify: `apps/context/package.json` (already has typecheck)
- Modify: `apps/electron/package.json` (already has typecheck)
- Modify: `apps/orchestrator/package.json` (pure JS, no typecheck — skip)
- Modify: `apps/viewer/package.json` (already has typecheck)
- Modify: `packages/core/package.json`
- Modify: `packages/mermaid/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Add typecheck scripts where missing**

For `apps/cli/package.json`, add:
```json
"typecheck": "tsc --noEmit"
```

For `packages/core/package.json`, `packages/mermaid/package.json`, `packages/shared/package.json`, `packages/ui/package.json`, add:
```json
"typecheck": "tsc --noEmit"
```

`apps/context`, `apps/electron`, `apps/viewer` already have `typecheck` scripts. `apps/orchestrator` is pure JS — skip.

- [ ] **Step 2: Test turbo typecheck**

Run: `bunx turbo run typecheck`
Expected: Runs typecheck across all packages with TypeScript. Orchestrator is skipped (no script).

- [ ] **Step 3: Fix any typecheck errors that block the pipeline**

If any package fails typecheck, investigate. These may be pre-existing errors that were masked by the old root-level `typecheck:all` running only a subset.

- [ ] **Step 4: Commit**

```bash
git add apps/*/package.json packages/*/package.json
git commit -m "feat: add typecheck scripts to all packages for Turborepo"
```

---

### Task 1.5: Add per-package test scripts where missing

**Files:**
- Modify: `packages/core/package.json` (no tests yet — add placeholder)
- Modify: `packages/ui/package.json` (tests exist in monorepo root suite but no local script)
- Modify: `apps/viewer/package.json` (no tests yet — add placeholder)

- [ ] **Step 1: Add test scripts where missing**

For `packages/core/package.json`:
```json
"test": "echo 'No tests yet'"
```

For `packages/ui/package.json` (tests are in `src/components/**/__tests__/`):
```json
"test": "bun test src/"
```

For `apps/viewer/package.json`:
```json
"test": "echo 'No tests yet'"
```

Other packages already have test scripts: `apps/cli` (test), `apps/context` (test), `apps/electron` (tests run via root), `apps/orchestrator` (test), `packages/mermaid` (test), `packages/shared` (test).

Note: `apps/electron` unit tests currently run via the root `test:desktop` script (`bun test ./apps/electron/src/`). Add a local test script:

For `apps/electron/package.json`, add:
```json
"test": "bun test src/"
```

- [ ] **Step 2: Test turbo test**

Run: `bunx turbo run test`
Expected: Runs test across all packages. Some may fail (pre-existing) — note which ones.

- [ ] **Step 3: Commit**

```bash
git add apps/*/package.json packages/*/package.json
git commit -m "feat: add test scripts to all packages for Turborepo"
```

---

### Task 1.6: Verify full Turborepo pipeline locally

- [ ] **Step 1: Run full pipeline**

Run: `bunx turbo run lint typecheck test`
Expected: All tasks run. Note any failures — these are pre-existing issues, not Turborepo problems.

- [ ] **Step 2: Run with --affected**

Run: `bunx turbo run lint typecheck test --affected`
Expected: Only runs tasks for packages affected by changes on current branch vs main. Since we're on `chore/mono-admin`, this should include most packages (we've modified their package.json files).

- [ ] **Step 3: Run again to verify caching**

Run: `bunx turbo run lint typecheck test`
Expected: Most tasks show "cache hit" (FULL TURBO) since nothing changed since last run.

- [ ] **Step 4: Document any pre-existing failures**

Create a note of which packages/tasks fail. These will be fixed in Phase 3 (test normalization) or addressed separately. The Turborepo infrastructure itself is working.

- [ ] **Step 5: Commit any remaining adjustments**

```bash
git add -A
git commit -m "chore: fix pipeline issues discovered during Turborepo verification"
```

---

## Phase 2: Pull in Symphony

### Task 2.1: Move Symphony into the monorepo

**Files:**
- Create: `apps/symphony/` (entire directory from `/Volumes/EVO/kata/kata-symphony-rust/`)
- Modify: `.gitignore` (add Rust build artifacts)

- [ ] **Step 1: Copy Symphony source into apps/symphony**

Run:
```bash
cp -r /Volumes/EVO/kata/kata-symphony-rust/ apps/symphony/
rm -rf apps/symphony/.git apps/symphony/target apps/symphony/node_modules
```

- [ ] **Step 2: Exclude Symphony from Bun workspaces**

In root `package.json`, add `!apps/symphony` to the workspaces array:
```json
"workspaces": [
  "packages/*",
  "apps/*",
  "!apps/online-docs",
  "!apps/symphony"
]
```

- [ ] **Step 3: Add Rust artifacts to .gitignore**

Append to root `.gitignore`:
```
# Rust
apps/symphony/target/
```

- [ ] **Step 4: Verify Cargo builds in new location**

Run:
```bash
cd apps/symphony && cargo build
```
Expected: Successful build.

- [ ] **Step 5: Verify Cargo tests pass**

Run:
```bash
cd apps/symphony && cargo test
```
Expected: All tests pass.

- [ ] **Step 6: Verify Cargo clippy and fmt**

Run:
```bash
cd apps/symphony && cargo clippy -- -D warnings && cargo fmt --check
```
Expected: Clean output.

- [ ] **Step 7: Update any hardcoded paths in Symphony**

Search for absolute paths or references to the old repo location:
```bash
grep -r "kata-symphony-rust" apps/symphony/
```
Fix any found references.

- [ ] **Step 8: Commit**

```bash
git add apps/symphony/ .gitignore package.json
git commit -m "feat: integrate Symphony (Rust) into monorepo"
```

---

## Phase 3: Test Runner Normalization

### Task 3.1: Migrate apps/context from Vitest to Bun test

**Files:**
- Modify: `apps/context/package.json` (remove vitest dep, update test script)
- Delete: `apps/context/vitest.config.ts`
- Modify: `apps/context/test/**/*.test.ts` (update imports if needed)

- [ ] **Step 1: Audit current test files for Vitest-specific imports**

Run: `grep -r "from 'vitest'" apps/context/test/` and `grep -r "import.*vitest" apps/context/test/`
Note which files import from vitest (e.g., `describe`, `it`, `expect`, `vi` for mocking).

- [ ] **Step 2: Update test files**

Bun test provides `describe`, `it`/`test`, `expect` as globals (same as Vitest with `globals: true`). The context app uses `globals: false`, so tests likely import from vitest explicitly.

For each test file that imports from vitest:
- Remove `import { describe, it, expect, ... } from 'vitest'` — Bun provides these as globals
- Replace `vi.fn()` with `jest.fn()` (Bun test uses Jest-compatible mock API, available as `mock` from `bun:test`)
- Replace `vi.spyOn()` with `jest.spyOn()` or `import { spyOn } from 'bun:test'`
- If `beforeAll`/`afterAll`/`beforeEach`/`afterEach` are imported from vitest, remove the import (Bun provides these as globals)

- [ ] **Step 3: Update apps/context/package.json**

Change test script from:
```json
"test": "vitest run"
```
To:
```json
"test": "bun test test/"
```

Remove vitest from devDependencies.

- [ ] **Step 4: Delete vitest.config.ts**

Run: `rm apps/context/vitest.config.ts`

The test timeout (30s) can be set per-test with `test.timeout(30_000)` or via `bunfig.toml` if needed globally.

- [ ] **Step 5: Run tests to verify migration**

Run: `cd apps/context && bun test test/`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/context/
git commit -m "refactor(context): migrate from Vitest to Bun test"
```

---

### Task 3.2: Migrate apps/orchestrator from Node --test CJS to Bun test

**Files:**
- Modify: `apps/orchestrator/package.json`
- Modify: `apps/orchestrator/tests/**/*.test.cjs` (rename to `.test.ts` or `.test.js`)
- Delete or modify: `apps/orchestrator/scripts/run-tests.cjs` (custom test runner)

- [ ] **Step 1: Audit current test structure**

Run: `ls apps/orchestrator/tests/` and examine a few test files to understand the CJS test patterns used.

- [ ] **Step 2: Rename .test.cjs files to .test.js**

Bun test can run `.js` files. Rename all test files:
```bash
find apps/orchestrator/tests -name "*.test.cjs" -exec bash -c 'mv "$0" "${0%.cjs}.js"' {} \;
```

- [ ] **Step 3: Update test files for Bun test**

Node `--test` uses `node:test` and `node:assert`. Replace:
- `const { describe, it } = require('node:test')` → remove (Bun globals)
- `const assert = require('node:assert')` → replace with `expect()` from Bun, or keep `assert` (Bun supports node:assert)

Pragmatic approach: keep `node:assert` for now since Bun supports it. Just remove the `node:test` import and use Bun's global `describe`/`it`/`test`.

- [ ] **Step 4: Update apps/orchestrator/package.json**

Change test script from the custom runner to:
```json
"test": "bun test tests/"
```

- [ ] **Step 5: Run tests to verify migration**

Run: `cd apps/orchestrator && bun test tests/`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/orchestrator/
git commit -m "refactor(orchestrator): migrate from Node --test to Bun test"
```

---

### Task 3.3: Migrate apps/cli from Node --test to Bun test

**Files:**
- Modify: `apps/cli/package.json`
- Modify: `apps/cli/src/**/*.test.ts` and `apps/cli/src/**/*.test.mjs` (update imports)

- [ ] **Step 1: Audit current test structure**

Run: `find apps/cli -name "*.test.*" | head -20` and examine test patterns.

The CLI uses Node `--test` with experimental TypeScript via a custom loader. Tests import from `node:test` and `node:assert`.

- [ ] **Step 2: Update test files**

Same pattern as orchestrator:
- Remove `import { describe, it, test } from 'node:test'` — Bun provides these as globals
- Keep `import assert from 'node:assert'` — Bun supports it (or migrate to `expect()`)
- Replace `import { mock } from 'node:test'` with `import { mock } from 'bun:test'` if mock API is used
- Rename `.test.mjs` files to `.test.ts` where possible

- [ ] **Step 3: Update apps/cli/package.json test script**

Change from the Node --test invocation to:
```json
"test": "bun test src/"
```

- [ ] **Step 4: Run tests to verify migration**

Run: `cd apps/cli && bun test src/`
Expected: All tests pass. If some fail due to Node-specific APIs, investigate and fix.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/
git commit -m "refactor(cli): migrate from Node --test to Bun test"
```

---

### Task 3.4: Add minimal smoke tests for apps/viewer and packages/core

**Files:**
- Create: `apps/viewer/src/__tests__/smoke.test.ts`
- Create: `packages/core/src/__tests__/smoke.test.ts`
- Modify: `apps/viewer/package.json` (update test script from placeholder)
- Modify: `packages/core/package.json` (update test script from placeholder)

- [ ] **Step 1: Create viewer smoke test**

```typescript
// apps/viewer/src/__tests__/smoke.test.ts
import { describe, test, expect } from "bun:test";

describe("viewer", () => {
  test("package.json is valid", () => {
    const pkg = require("../../package.json");
    expect(pkg.name).toBe("@craft-agent/viewer");
  });
});
```

- [ ] **Step 2: Update viewer test script**

In `apps/viewer/package.json`, change:
```json
"test": "bun test src/"
```

- [ ] **Step 3: Create core smoke test**

```typescript
// packages/core/src/__tests__/smoke.test.ts
import { describe, test, expect } from "bun:test";

describe("core", () => {
  test("package.json is valid", () => {
    const pkg = require("../../package.json");
    expect(pkg.name).toBe("@craft-agent/core");
  });
});
```

- [ ] **Step 4: Update core test script**

In `packages/core/package.json`, change:
```json
"test": "bun test src/"
```

- [ ] **Step 5: Run both tests**

Run: `cd apps/viewer && bun test src/` and `cd packages/core && bun test src/`
Expected: Both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/viewer/src/__tests__/ apps/viewer/package.json packages/core/src/__tests__/ packages/core/package.json
git commit -m "test: add smoke tests for viewer and core packages"
```

---

### Task 3.5: Verify full test suite under Turborepo

- [ ] **Step 1: Run turbo test across all packages**

Run: `bunx turbo run test`
Expected: All packages pass. If any fail, fix them before proceeding.

- [ ] **Step 2: Run full pipeline**

Run: `bunx turbo run lint typecheck test`
Expected: Full pipeline green.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures after runner normalization"
```

---

## Phase 4: CI Rewrite

### Task 4.1: Rewrite ci.yml with Turborepo gate pattern

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace ci.yml contents**

```yaml
name: CI

on:
  pull_request:
    branches:
      - main

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    env:
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
      TURBO_TEAM: ${{ vars.TURBO_TEAM }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.3.8'

      - name: Install dependencies
        run: bun install

      - name: Run Turborepo validation
        run: bunx turbo run lint typecheck test --affected

  validate-symphony:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check if Symphony files changed
        id: changes
        run: |
          CHANGED=$(git diff --name-only origin/main...HEAD -- apps/symphony/)
          if [ -z "$CHANGED" ]; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Setup Rust
        if: steps.changes.outputs.changed == 'true'
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt

      - name: Cache Cargo
        if: steps.changes.outputs.changed == 'true'
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            apps/symphony/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('apps/symphony/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-cargo-

      - name: Check formatting
        if: steps.changes.outputs.changed == 'true'
        run: cd apps/symphony && cargo fmt --check

      - name: Run clippy
        if: steps.changes.outputs.changed == 'true'
        run: cd apps/symphony && cargo clippy -- -D warnings

      - name: Run tests
        if: steps.changes.outputs.changed == 'true'
        run: cd apps/symphony && cargo test

  e2e-mocked:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check if desktop version bumped
        id: version-check
        run: |
          CURRENT_VERSION=$(node -p "require('./apps/electron/package.json').version")
          if git ls-remote --tags origin | grep -q "refs/tags/desktop-v$CURRENT_VERSION"; then
            echo "Version $CURRENT_VERSION already tagged, skipping E2E"
            echo "should_run=false" >> $GITHUB_OUTPUT
          else
            echo "New version $CURRENT_VERSION detected, running E2E"
            echo "should_run=true" >> $GITHUB_OUTPUT
          fi

      - name: Setup Bun
        if: steps.version-check.outputs.should_run == 'true'
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1.3.8'

      - name: Setup Node.js
        if: steps.version-check.outputs.should_run == 'true'
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        if: steps.version-check.outputs.should_run == 'true'
        run: bun install

      - name: Install Playwright browsers
        if: steps.version-check.outputs.should_run == 'true'
        run: npx playwright install --with-deps chromium

      - name: Build Electron app
        if: steps.version-check.outputs.should_run == 'true'
        run: bun run electron:build

      - name: Run mocked E2E tests
        if: steps.version-check.outputs.should_run == 'true'
        run: xvfb-run --auto-servernum -- bun run test:e2e
        env:
          CI: 'true'
          KATA_TEST_MODE: '1'

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/electron/playwright-report/
          retention-days: 7

  gate:
    needs: [validate, validate-symphony, e2e-mocked]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Check job results
        run: |
          echo "validate: ${{ needs.validate.result }}"
          echo "validate-symphony: ${{ needs.validate-symphony.result }}"
          echo "e2e-mocked: ${{ needs.e2e-mocked.result }}"

          if [[ "${{ needs.validate.result }}" == "failure" || \
                "${{ needs.validate-symphony.result }}" == "failure" || \
                "${{ needs.e2e-mocked.result }}" == "failure" ]]; then
            echo "One or more jobs failed"
            exit 1
          fi

          echo "All jobs passed or were skipped"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: rewrite CI with Turborepo --affected and gate pattern"
```

---

### Task 4.2: Create symphony-release.yml

**Files:**
- Create: `.github/workflows/symphony-release.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Symphony Release

on:
  push:
    branches:
      - main
    paths:
      - 'apps/symphony/**'

concurrency:
  group: symphony-release-${{ github.sha }}
  cancel-in-progress: false

jobs:
  check-version:
    runs-on: ubuntu-latest
    outputs:
      should_release: ${{ steps.check.outputs.should_release }}
      version: ${{ steps.check.outputs.version }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Check if Symphony version changed
        id: check
        run: |
          CURRENT_VERSION=$(grep '^version' apps/symphony/Cargo.toml | head -1 | sed 's/.*"\(.*\)"/\1/')
          echo "version=$CURRENT_VERSION" >> $GITHUB_OUTPUT

          if git ls-remote --tags origin | grep -q "refs/tags/symphony-v$CURRENT_VERSION"; then
            echo "Tag symphony-v$CURRENT_VERSION already exists, skipping release"
            echo "should_release=false" >> $GITHUB_OUTPUT
          else
            echo "New Symphony version $CURRENT_VERSION detected, will release"
            echo "should_release=true" >> $GITHUB_OUTPUT
          fi

  build-and-release:
    needs: check-version
    if: needs.check-version.outputs.should_release == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache Cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            apps/symphony/target
          key: ${{ runner.os }}-cargo-release-${{ hashFiles('apps/symphony/Cargo.lock') }}

      - name: Run tests
        run: cd apps/symphony && cargo test

      - name: Build release binary
        run: cd apps/symphony && cargo build --release

      - name: Create Git tag
        run: |
          VERSION=${{ needs.check-version.outputs.version }}
          git tag "symphony-v$VERSION"
          git push origin "symphony-v$VERSION"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: symphony-v${{ needs.check-version.outputs.version }}
          name: Symphony v${{ needs.check-version.outputs.version }}
          files: apps/symphony/target/release/symphony
          generate_release_notes: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/symphony-release.yml
git commit -m "feat: add Symphony release workflow"
```

---

### Task 4.3: Update existing release workflows to use Turborepo builds

**Files:**
- Modify: `.github/workflows/cli-release.yml`
- Modify: `.github/workflows/desktop-release.yml`
- Modify: `.github/workflows/orc-release.yml`

- [ ] **Step 1: Update cli-release.yml build step**

In the `publish` job, replace the build step:

From:
```yaml
- name: Build
  run: cd apps/cli && npx tsc && npm run copy-themes
```

To:
```yaml
- name: Build
  run: bunx turbo run build --filter=@kata-sh/cli
```

Note: The CLI's `build` script in its package.json must handle both `tsc` and `copy-themes`. Verify this is the case; if not, update the CLI's build script to include both.

- [ ] **Step 2: Update desktop-release.yml build step**

In the build/package job, replace the electron build step to use:
```yaml
- name: Build Electron app
  run: bunx turbo run build --filter=@kata-sh/desktop
```

Note: Verify the electron `build` script in its package.json produces the full build output needed for electron-builder.

- [ ] **Step 3: Update orc-release.yml build step**

Replace the publish dry-run or build step to use:
```yaml
- name: Build
  run: bunx turbo run build --filter=@kata-sh/orc
```

- [ ] **Step 4: Add TURBO_TOKEN and TURBO_TEAM env vars to all release workflows**

Add to each release workflow's job-level env:
```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/cli-release.yml .github/workflows/desktop-release.yml .github/workflows/orc-release.yml
git commit -m "feat: update release workflows to use Turborepo builds"
```

---

### Task 4.4: Set up Turborepo remote caching

- [ ] **Step 1: Link repo to Vercel for remote caching**

Run: `bunx turbo login`
Follow the prompts to authenticate with Vercel.

- [ ] **Step 2: Link the repo**

Run: `bunx turbo link`
Select the Vercel team/account to use for remote caching.

- [ ] **Step 3: Add GitHub secrets for CI**

In the GitHub repo settings, add:
- Secret: `TURBO_TOKEN` — the token from `turbo login`
- Variable: `TURBO_TEAM` — the Vercel team slug

(This is a manual step in the GitHub UI.)

- [ ] **Step 4: Verify remote caching works locally**

Run: `bunx turbo run lint typecheck test --force`
Then run again: `bunx turbo run lint typecheck test`
Expected: Second run shows remote cache hits.

- [ ] **Step 5: Commit any generated config**

```bash
git add -A
git commit -m "chore: configure Turborepo remote caching"
```

---

### Task 4.5: Configure GitHub branch protection

This is a manual step in the GitHub UI.

- [ ] **Step 1: Go to repo Settings > Branches > Branch protection rules**

- [ ] **Step 2: Edit the rule for `main`**

Set required status checks to:
- `gate` (the aggregating job from ci.yml)

Remove any old required checks (`validate`, `validate-cli`, `orc-publish-dry-run`, `e2e-mocked`).

- [ ] **Step 3: Verify by opening a test PR**

Push the current branch and open a PR. Verify:
- `validate` job runs Turborepo tasks
- `validate-symphony` detects no Rust changes and skips
- `e2e-mocked` checks version and skips (or runs if version bumped)
- `gate` job passes
- PR is mergeable

---

## Phase 5: Local DX

### Task 5.1: Update pre-push hook

**Files:**
- Modify: `.githooks/pre-push` (or create if doesn't exist)

- [ ] **Step 1: Check current pre-push hook**

Run: `cat .githooks/pre-push 2>/dev/null || echo "no pre-push hook"`

- [ ] **Step 2: Create/update pre-push hook**

```bash
#!/bin/bash
# Pre-push hook: run the same validation as CI
# Uses Turborepo --affected to only check what changed

echo "Running pre-push validation..."
bunx turbo run lint typecheck test --affected

if [ $? -ne 0 ]; then
  echo ""
  echo "Pre-push validation failed. Fix the issues above before pushing."
  exit 1
fi
```

- [ ] **Step 3: Make executable**

Run: `chmod +x .githooks/pre-push`

- [ ] **Step 4: Commit**

```bash
git add .githooks/pre-push
git commit -m "feat: update pre-push hook to use Turborepo --affected"
```

---

### Task 5.2: Update root package.json scripts

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update root scripts to delegate to Turborepo**

Replace/update these scripts:
```json
{
  "scripts": {
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:affected": "turbo run test --affected",
    "build": "turbo run build",
    "validate": "turbo run lint typecheck test",
    "validate:affected": "turbo run lint typecheck test --affected",
    "test:e2e": "cd apps/electron && bun run test:e2e",
    "test:e2e:ui": "cd apps/electron && bun run test:e2e:ui",
    "test:e2e:debug": "cd apps/electron && bun run test:e2e:debug",
    "test:e2e:headed": "cd apps/electron && bun run test:e2e:headed",
    "test:e2e:live": "cd apps/electron && bun run test:e2e:live",
    "test:e2e:live:debug": "cd apps/electron && bun run test:e2e:live:debug",
    "test:e2e:live:headed": "cd apps/electron && bun run test:e2e:live:headed",
    "githooks:install": "bash scripts/install-githooks.sh"
  }
}
```

Remove old scripts that Turborepo replaces:
- `test:packages`
- `test:desktop`
- `test:cli`
- `test:all`
- `test:watch` (keep if useful for dev, or replace with `turbo run test --filter=...`)
- `test:coverage` (keep — coverage is a separate concern)
- `test:coverage:summary` (keep)
- `typecheck` (replaced by `turbo run typecheck`)
- `typecheck:all` (replaced by `turbo run typecheck`)
- `lint:electron` (replaced by `turbo run lint --filter=@kata-sh/desktop`)
- `validate:ci` (replaced by `validate`)
- `validate:local` (replaced by `validate` + E2E)

Keep all electron:*, viewer:*, marketing:*, docs:*, demo:*, and other app-specific scripts as-is.

- [ ] **Step 2: Verify updated scripts work**

Run:
```bash
bun run validate
bun run test:affected
```
Expected: Both delegate to Turborepo and complete.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "refactor: update root scripts to delegate to Turborepo"
```

---

## Phase 6: Monorepo Agent Skills

### Task 6.1: Create monorepo agent skills

This task uses the `/skill-creator` skill to create skills that encode the conventions established in Phases 1-5.

- [ ] **Step 1: Invoke /skill-creator to create a Turborepo validation skill**

Skill purpose: Run lint/typecheck/test with `--affected` flag, handle Turborepo cache, interpret output.

- [ ] **Step 2: Invoke /skill-creator to create a release workflow skill**

Skill purpose: Guide agents through version bumps, changelog updates, and release PR creation for each app.

- [ ] **Step 3: Invoke /skill-creator to create a Symphony-specific skill**

Skill purpose: Cargo build/test/clippy/fmt commands, Rust-specific conventions in the monorepo.

- [ ] **Step 4: Commit all new skills**

```bash
git add .agents/skills/
git commit -m "feat: add monorepo agent skills for Turborepo and release workflows"
```
