# M001: Rebrand — Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

## Project Description

kata-orchestrator (previously get-shit-done-cc) is a structured workflow system for AI coding agents, distributed as an npm package.

## Why This Milestone

The product is being renamed from `get-shit-done` / `gsd` / TÂCHES to `kata` / `kata-orchestrator`. This is a prerequisite for all downstream milestones — M002-M005 build distribution formats for the rebranded product. The statusline feature is also being removed as part of this cleanup.

## User-Visible Outcome

### When this milestone is complete, the user can:
- `npm install -g kata-orchestrator` (or the chosen package name)
- Run `kata` bin command instead of `get-shit-done-cc`
- See no references to gsd/get-shit-done anywhere in the installed package
- All agent names, command names, hook names use `kata-` prefix

### Entry point / environment
- Entry point: `bin/install.js` (renamed bin entry)
- Environment: local dev / npm publish
- Live dependencies: npm registry

## Completion Class

- Contract complete means: package.json name updated, bin renamed, all internal files renamed/updated, tests pass, statusline hook gone
- Integration complete means: `npm pack` produces a clean archive with no gsd references
- Operational complete means: n/a

## Final Integrated Acceptance

- `npm pack` and inspect the tarball — zero occurrences of `gsd`, `get-shit-done`, or `TÂCHES` (except CHANGELOG attribution)
- `npm install` the packed tarball and run the bin — it works under the new name
- No `gsd-statusline.js` file exists anywhere in the project

## Key Risks / Unknowns

- Scope of rename: `gsd` appears in agent names, workflow filenames, hook filenames, bin scripts, package.json, README, CHANGELOG, tests — thorough grep required before planning tasks
- npm package name availability: `kata-orchestrator` may be taken on npm

## Implementation Decisions

- Keep CHANGELOG attribution to original project (rename context, not erasure)
- Rename all `gsd-*` prefixed files to `kata-*`
- Rename bin from `get-shit-done-cc` to `kata`
- Package name: `kata-orchestrator`
- Remove `gsd-statusline.js` entirely (no replacement)
