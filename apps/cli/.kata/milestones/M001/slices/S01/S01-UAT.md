# S01 UAT — Wire pi-mcp-adapter into Kata

**Test when convenient. Non-blocking.**

## Setup

Make sure kata is built:
```
cd apps/cli && npx tsc && npm run copy-themes
```

## Test 1: pi-mcp-adapter auto-installs on first launch

1. Check `~/.kata-cli/agent/settings.json` — confirm it contains `"npm:pi-mcp-adapter"` in the packages array
2. Launch `kata`
3. Watch startup — pi should download/install pi-mcp-adapter if not already installed

**Pass if:** No install error; settings.json has the package entry.

## Test 2: mcp tool is available

1. Launch `kata`
2. Ask: "what tools do you have?" or type `/mcp`

**Pass if:** `mcp` tool appears in the tool list OR `/mcp` responds with server status panel.

## Test 3: MCP config uses Kata's dir

1. Check `~/.kata-cli/agent/mcp.json` exists after launch
2. Confirm the file was created (starter template with empty `mcpServers`)

**Pass if:** `~/.kata-cli/agent/mcp.json` exists with valid JSON.

## Test 4: Existing mcp.json not overwritten

1. Edit `~/.kata-cli/agent/mcp.json` and add a dummy server entry
2. Re-launch `kata`
3. Check `~/.kata-cli/agent/mcp.json` still has your custom entry

**Pass if:** Custom content is preserved.

## Test 5: Configure a real MCP server (optional smoke test)

1. Edit `~/.kata-cli/agent/mcp.json`:
   ```json
   {
     "mcpServers": {
       "context7": {
         "command": "npx",
         "args": ["-y", "@upstash/context7-mcp@latest"]
       }
     }
   }
   ```
2. Launch `kata`
3. Type: `mcp({ search: "resolve" })`

**Pass if:** context7 tools appear in search results.
