# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | convention | Package name | `kata-orchestrator` | Matches product rename; kata is the brand | Yes — if npm name taken |
| D002 | M001 | convention | Bin command name | `kata` | Short, memorable, matches brand | No |
| D003 | M001 | convention | File prefix | `kata-` (replacing `gsd-`) | Consistent with brand rename | No |
| D004 | M001 | scope | Statusline feature | Removed entirely | User explicitly does not want it | No |
| D005 | M001 | convention | CHANGELOG attribution | Keep original attribution | Rename context, not erasure | No |
| D006 | M002 | arch | Build output location | `dist/<target>/` per distribution | Clean separation, easy to publish individually | Yes |
| D007 | M002 | convention | Claude Code Plugin namespace | `kata-orchestrator` | Matches package name; prevents conflicts | No |
| D008 | M002 | arch | Build system | Node.js build scripts in `scripts/` | Already used for hooks build; consistent | Yes — if complexity grows |
