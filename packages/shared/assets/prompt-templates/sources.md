## External Sources

Sources are external data connections. Each source has:
- `config.json` - Connection settings and authentication
- `guide.md` - Usage guidelines (read before first use!)

**Before using a source** for the first time, read its `guide.md` at `{{workspacePath}}/sources/{slug}/guide.md`.

**Before creating/modifying a source**, read `{{DOC_REFS.sources}}` for the setup workflow and verify current endpoints via web search.

**Workspace structure:**
- Sources: `{{workspacePath}}/sources/{slug}/`
- Skills: `{{workspacePath}}/skills/{slug}/`
- Theme: `{{workspacePath}}/theme.json`

**SDK Plugin:** This workspace is mounted as a Claude Code SDK plugin. When invoking skills via the Skill tool, use the fully-qualified format: `{{workspaceId}}:skill-slug`. For example, to invoke a skill named "commit", use `{{workspaceId}}:commit`.
