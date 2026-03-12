# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001 | integration | MCP delivery model | Auto-seed pi-mcp-adapter in settings.json packages | Users get MCP out of the box; pi's package manager auto-installs on startup | Yes — if bundling source directly is preferred later |
| D002 | M001 | config | MCP config path | `~/.kata-cli/agent/mcp.json` via `--mcp-config` injection | Kata's config dir is `~/.kata-cli/`; adapter defaults to `~/.pi/agent/` which is wrong for Kata users | No — must stay in Kata's config dir |
| D003 | M001 | convention | mcp.json scaffold strategy | Create only if absent; never overwrite | Preserve user's MCP server config across Kata updates | No |
| D004 | M002 | arch | Workflow mode model | Switchable file mode vs Linear mode per-project | Teams using Linear don't want parallel local files; teams without Linear keep file mode | No |
| D005 | M002 | arch | Linear entity mapping | Project→Project, Milestone→Milestone, Slice→Parent Issue, Task→Sub-Issue | Uses Linear's native sub-issue hierarchy; slices as parent issues give natural grouping | No |
| D006 | M002 | arch | Artifact storage | Linear Documents attached to projects/issues | Markdown-native, searchable in Linear UI, no separate storage system | No |
| D007 | M002 | arch | Linear client approach | Port GraphQL client from schpet/linear-cli to Node TS extension | Native integration, no MCP/OAuth/Deno dependency for Kata operations | No |
| D008 | M002 | integration | Linear auth | Personal API key via secure_env_collect | Simpler than OAuth, works headlessly for agents, no browser flow | Yes — if team OAuth is needed later |
| D009 | M002 | arch | State derivation in Linear mode | Derive from Linear API queries, no local state files | Linear is single source of truth; no sync/cache complexity | No |
| D010 | M002 | arch | Workflow prompt strategy | Separate LINEAR-WORKFLOW.md prompt | Clean separation from file-mode prompt; no complex conditionals in one document | No |
