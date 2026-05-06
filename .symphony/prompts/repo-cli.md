## Repository context

This is the **kata-mono** monorepo. The Kata CLI app lives at `apps/cli/`.

- Build: `cd apps/cli && npx tsc`
- Test: `cd apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/tests/*.test.ts'`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Validate all: `bun run validate`
- Base branch: `{{ workspace.base_branch }}`. All merges, rebases, and PR base targets use this branch.

Read `apps/cli/AGENTS.md` and `apps/cli/README.md` for full architecture reference, directory structure, and development conventions.
Read the root `AGENTS.md` for monorepo-level build, test, and CI commands.
