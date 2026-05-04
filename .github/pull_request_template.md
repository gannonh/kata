## Summary

<!-- What changed, why, and the user or maintainer outcome. -->

## Scope

<!-- Check every area touched by this PR. -->

- [ ] `apps/desktop` - Kata Desktop
- [ ] `apps/cli` - Kata CLI
- [ ] `apps/context` - Context Indexer
- [ ] `apps/symphony` - Kata Symphony
- [ ] `apps/online-docs` - Online Docs
- [ ] `packages/core`
- [ ] `packages/shared`
- [ ] `packages/ui`
- [ ] `packages/mermaid`
- [ ] CI, release, or repository tooling
- [ ] Documentation

## Change Type

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Test coverage
- [ ] Dependency update
- [ ] Release or packaging
- [ ] Documentation

## Verification

<!-- Include the exact commands run and the result. Mark unchecked items that were not applicable. -->

- [ ] `pnpm run validate:affected`
- [ ] `pnpm run lint`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run test`
- [ ] `pnpm run desktop:build`
- [ ] `pnpm run test:e2e`
- [ ] `cargo test` in `apps/symphony`
- [ ] Manual verification:

## Risk

- [ ] Touches shared contracts, prompts, config, auth, daemon, or MCP behavior
- [ ] Touches persistence, migrations, filesystem paths, or bundled assets
- [ ] Touches release packaging or install/update flows
- [ ] Requires follow-up work

Notes:

## Reviewer Notes

<!-- Call out files, flows, screenshots, logs, or decisions reviewers should inspect first. -->
