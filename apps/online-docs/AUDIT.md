# Docs site audit and source inventory

Date: 2026-05-04
Issue: [S901]#469

## Scope

Audit of `apps/online-docs` content to identify stale documentation areas and produce a short refresh checklist.

## Source inventory

Primary docs sections and likely code ownership:

- `cli/*` → `apps/cli`
- `symphony/*` and Symphony reference pages → `apps/symphony`
- `context/*` → `apps/context`
- `orchestrator/*` and Orchestrator reference pages → `apps/orchestrator-legacy` (archived)
- Site config and navigation → `apps/online-docs/docs.json`

Repository signals used in this audit:

- `pnpm-workspace.yaml` excludes `apps/orchestrator-legacy` and `apps/online-docs` from workspace tasks.
- Top-level `apps/` contains `orchestrator-legacy` and no active `orchestrator` app directory.

## Outdated areas

1. Template boilerplate files are still uncustomized.
   - `apps/online-docs/README.md` (`Mintlify Starter Kit` template)
   - `apps/online-docs/CONTRIBUTING.md` (template preface)
   - `apps/online-docs/AGENTS.md` (first-time setup/template instructions)

2. Navigation still presents Orchestrator as a primary product section.
   - `apps/online-docs/docs.json` includes `Kata Orchestrator` and `Orchestrator Reference` groups.
   - Content lives under `apps/online-docs/orchestrator/*` and `apps/online-docs/reference/orchestrator-*` while repo app is archived under `apps/orchestrator-legacy`.

3. Core pages are heavily Linear-centric and need current tracker wording review.
   - Landing and intro pages: `apps/online-docs/index.mdx`, `apps/online-docs/introduction.mdx`
   - CLI overview and integration pages: `apps/online-docs/cli/overview.mdx`, `apps/online-docs/cli/linear-integration.mdx`
   - Symphony pages already mention GitHub in places, so terminology is currently mixed across docs.

4. Symphony workflow reference appears in two locations and should be consolidated or clearly scoped.
   - `apps/online-docs/symphony/workflow-config.mdx`
   - `apps/online-docs/reference/symphony-workflow.mdx`

5. Docs drift risk is high because `apps/online-docs` is excluded from workspace validation by default.

## Short update checklist

- [ ] Replace template boilerplate in `README.md`, `CONTRIBUTING.md`, and `AGENTS.md` with project-specific docs guidance.
- [ ] Decide Orchestrator docs status (archive, legacy section, or active) and update `docs.json` navigation accordingly.
- [ ] Normalize tracker language across landing, intro, and CLI pages to match current supported tracker modes.
- [ ] Merge or explicitly differentiate the two Symphony workflow reference pages to remove overlap.
- [ ] Add docs validation into routine checks for this repo path (at minimum broken-link checks for `apps/online-docs`).
