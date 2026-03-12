# Changelog

## 0.2.1

- Fix `/changelog` command — symlink `pkg/CHANGELOG.md` so Kata can find it
- Rewrite README for consumers: quick start with `npx`, getting started flow, how it works, mode comparison, full command reference

## 0.2.0

- Add MCP (Model Context Protocol) support via `pi-mcp-adapter` — connect to any MCP server (Linear, Figma, custom tools) from Kata
- Auto-install `pi-mcp-adapter` on startup and scaffold starter `mcp.json` config
- Inject `mcp-config` flag into extension runtime for seamless MCP server discovery
- Fix inline `[]` and `{}` literal handling in preferences YAML parser
- Add comprehensive MCP documentation and setup guide to README
- Add MCP smoke tests to CI
- Install `pi-mcp-adapter` globally in CI for test coverage

## 0.1.2

- Fix `~/.kata/` paths to `~/.kata-cli/` to avoid collision with Kata Desktop config directory

## 0.1.1

- Rename `@kata/*` to `@kata-sh/*` npm scope
- Initial public release to npm
