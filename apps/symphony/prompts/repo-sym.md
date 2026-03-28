
## Repository context

This is the **kata-mono** monorepo. The Symphony crate lives at `apps/symphony/`.

- Build: `cd apps/symphony && cargo build`
- Test: `cd apps/symphony && cargo test`
- Lint: `cd apps/symphony && cargo clippy -- -D warnings`
- Format check: `cd apps/symphony && cargo fmt --check`
- Base branch: `{{ workspace.base_branch }}`. All merges, rebases, and PR base targets use this branch.

Read `apps/symphony/AGENTS.md` for full architecture reference, module map, and test harness layout.
