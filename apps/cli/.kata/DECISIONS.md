# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | integration | MCP delivery model | Auto-seed pi-mcp-adapter in settings.json packages | Users get MCP out of the box; pi's package manager auto-installs on startup | Yes — if bundling source directly is preferred later |
| D002 | M001 | config | MCP config path | `~/.kata-cli/agent/mcp.json` via `--mcp-config` injection | Kata's config dir is `~/.kata-cli/`; adapter defaults to `~/.pi/agent/` which is wrong for Kata users | No — must stay in Kata's config dir |
| D003 | M001 | convention | mcp.json scaffold strategy | Create only if absent; never overwrite | Preserve user's MCP server config across Kata updates | No |
