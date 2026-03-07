# External Integrations

**Analysis Date:** 2026-01-29

## APIs & External Services

**Anthropic (Claude AI):**
- Claude API for message generation
  - SDK: `@anthropic-ai/sdk` ^0.71.1
  - Auth: `ANTHROPIC_API_KEY` (required)
  - Models: Opus 4.6, Sonnet 4.5, Haiku 4.5 (200K context window)
  - Configuration: `packages/shared/src/config/models.ts` defines available models and defaults
  - Base URL: Configurable via `process.env.ANTHROPIC_BASE_URL` (defaults to `https://api.anthropic.com`)
  - Location: `packages/shared/src/auth/claude-token.ts` for token management

**Model Context Protocol (MCP):**
- MCP server connections for tool/resource access
  - SDK: `@modelcontextprotocol/sdk` ^1.24.3
  - Config: Workspace-level MCP URL + auth type (workspace_oauth, workspace_bearer, public)
  - Client: `packages/shared/src/mcp/client.ts`
  - Validation: `packages/shared/src/mcp/validation.ts` (schema validation, basic auth handling)
  - Required env: `CRAFT_MCP_URL`, `CRAFT_MCP_TOKEN` (bearer token for default MCP server)
  - Sources storage: `~/.craft-agent/workspaces/{id}/sources/{slug}/`

## Data Storage

**Local Filesystem:**
- Configuration: `~/.craft-agent/config.json` - Multi-workspace configuration
- Credentials: `~/.craft-agent/credentials.enc` - AES-256-GCM encrypted credential store
  - Location: `packages/shared/src/credentials/` with pluggable backends
  - Manager: `packages/shared/src/credentials/manager.ts`
- Sessions: `~/.craft-agent/sessions/{sessionId}/` - Session transcripts and metadata
  - Persistence: `packages/shared/src/sessions/persistence-queue.ts` (debounced async writes)
- Workspaces: `~/.craft-agent/workspaces/{id}/` - Per-workspace configs
- Permissions: `~/.craft-agent/workspaces/{id}/permissions.json` - Safety rule overrides
- Statuses: `~/.craft-agent/workspaces/{id}/statuses/config.json` - Custom workflow states
- Themes: `~/.craft-agent/theme.json` (app), `~/.craft-agent/workspaces/{id}/theme.json` (workspace)
- Sources: `~/.craft-agent/workspaces/{id}/sources/{slug}/config.json`, `guide.md`
- Logs: `~/.craft-agent/logs/` and Electron logs to `~/Library/Logs/Craft Agents/` (macOS)
- API Errors: `~/.craft-agent/api-error.json` - Cross-process error sharing via fetch interceptor

**Databases:**
- None configured - All data is file-based in user home directory

**File Storage:**
- Local filesystem only - No cloud storage integration

**Caching:**
- TTL Cache via `@isaacs/ttlcache` ^2.1.4 - In-memory caching with expiration
- Extended cache TTL preference configurable in config.json

## Authentication & Identity

**Auth Provider:**
- Multi-provider OAuth system with workspace-scoped and service-specific OAuth

**OAuth Providers Integrated:**

1. **Google OAuth** (Gmail, Calendar, Drive, Docs, Sheets)
   - Implementation: `packages/shared/src/auth/google-oauth.ts`
   - Client ID: `GOOGLE_OAUTH_CLIENT_ID` (required, injected at build time)
   - Client Secret: `GOOGLE_OAUTH_CLIENT_SECRET` (required, injected at build time)
   - Auth Flow: Standard OAuth 2.0 with callback server
   - Callback Server: `packages/shared/src/auth/callback-server.ts` (ephemeral local server)
   - Storage: Credentials in encrypted `credentials.enc`
   - Scopes: Configurable per service (gmail, calendar, drive, docs, sheets)

2. **Slack OAuth** (Workspace Integration)
   - Implementation: `packages/shared/src/auth/slack-oauth.ts`
   - Client ID: `SLACK_OAUTH_CLIENT_ID` (required, injected at build time)
   - Client Secret: `SLACK_OAUTH_CLIENT_SECRET` (required, injected at build time)
   - Auth Flow: Standard OAuth 2.0 with callback server
   - Storage: Encrypted credentials storage
   - Workspace-scoped access tokens

3. **Microsoft OAuth** (Outlook, OneDrive, Teams)
   - Implementation: `packages/shared/src/auth/microsoft-oauth.ts`
   - Client ID: `MICROSOFT_OAUTH_CLIENT_ID` (required, injected at build time)
   - No Client Secret: Uses PKCE flow (mobile/desktop auth pattern)
   - Auth Flow: PKCE-based OAuth 2.0
   - Callback handling: Deep link via `craftagents://` scheme (dev: `CRAFT_DEEPLINK_SCHEME` configurable)
   - Scopes: Configurable per service

4. **Craft OAuth** (Internal - Craft.do Platform)
   - Implementation: `packages/shared/src/auth/claude-oauth.ts`
   - Configuration: `packages/shared/src/auth/claude-oauth-config.ts`
   - Purpose: API key setup for Craft platform (separate from MCP auth)
   - Flow: Workspace-scoped OAuth via callback server
   - Auth Type: `api_key` or `oauth_token` (config schema)

**API Key Authentication:**
- Claude API: ANTHROPIC_API_KEY
- MCP Server: Bearer token (CRAFT_MCP_TOKEN)

**Callback System:**
- Callback Server: `packages/shared/src/auth/callback-server.ts` - Ephemeral local server for OAuth redirects
- Callback Page: `packages/shared/src/auth/callback-page.ts` - HTML callback page with token extraction
- Deep Links: `apps/electron/src/main/deep-link.ts` - Handle craftagents:// URLs for auth completion
- Session-scoped callbacks: `packages/shared/src/agent/session-scoped-tools.ts` - onOAuthBrowserOpen, onOAuthSuccess, onOAuthError

## Monitoring & Observability

**Error Tracking:**
- Sentry (Error tracking and crash reporting)
  - Main process: `@sentry/electron` ^7.7.0
  - Renderer process: `@sentry/react` ^10.36.0
  - DSN: `SENTRY_ELECTRON_INGEST_URL` (injected at build time)
  - Initialization: `apps/electron/src/main/index.ts` (lines 9-64)
  - Scrubbing: Redacts auth headers, API keys, tokens, passwords, credentials before sending
  - Machine ID: Anonymous hash of hostname + homedir (no PII)
  - Enabled: Only in production builds or when DSN is configured
  - Source Maps: Currently disabled (can be re-enabled with CI config)

**Logs:**
- Electron Log: `electron-log` ^5.4.3 - Structured logging
  - Location: `~/Library/Logs/Craft Agents/main.log` (macOS)
  - Tail logs: `scripts/tail-electron-logs.sh` for development monitoring
  - Debug mode: Enabled via `CRAFT_DEBUG=1` or `--debug` flag
  - Interceptor logs: `~/.craft-agent/logs/interceptor.log` (fetch patch debug logs)

## CI/CD & Deployment

**Hosting:**
- Distribution: `https://agents.craft.do/electron/latest` - Update manifest server
- Electron Updater: Fetches `.yml` update manifests and `dmg`/`exe`/`AppImage` artifacts

**CI Pipeline:**
- Not detected in codebase (likely configured in external CI system, possibly GitHub Actions)
- Build scripts: Available in `scripts/` for release/distribution
  - `scripts/release.ts` - Release automation
  - `scripts/build.ts` - Monorepo build orchestration
  - `scripts/electron-build-*.ts` - Platform-specific builds

**Build Targets:**
- macOS: DMG installer with notarization hooks (currently disabled)
- Windows: NSIS installer (per-user installation)
- Linux: AppImage format

## Environment Configuration

**Required env vars:**
```
ANTHROPIC_API_KEY              # Claude API key
CRAFT_MCP_URL                  # MCP server endpoint (workspace-specific)
CRAFT_MCP_TOKEN                # Bearer token for MCP authentication
GOOGLE_OAUTH_CLIENT_ID         # Google Cloud Console credentials
GOOGLE_OAUTH_CLIENT_SECRET     # Google Cloud Console credentials
SLACK_OAUTH_CLIENT_ID          # Slack API credentials
SLACK_OAUTH_CLIENT_SECRET      # Slack API credentials
MICROSOFT_OAUTH_CLIENT_ID      # Azure Portal credentials
SENTRY_ELECTRON_INGEST_URL     # Sentry DSN (optional)
```

**Build-time Injection:**
- OAuth credentials injected via esbuild `--define` in `apps/electron/scripts/build-main.ts`
- Sentry DSN injected via esbuild `--define`
- Pattern: `--define:process.env.VAR_NAME=\"${VAR_NAME:-}\"`

**Secrets location:**
- `.env` file in project root (git-ignored)
- Sync via `scripts/sync-secrets.sh` (1Password integration implied)
- Development: `ANTHROPIC_BASE_URL` can override API endpoint

## Webhooks & Callbacks

**Incoming:**
- None detected (app is client-side only)

**Outgoing - OAuth Callbacks:**
- Google: Standard OAuth redirect to localhost callback server
- Slack: Standard OAuth redirect to localhost callback server
- Microsoft: Deep link redirect to `craftagents://oauth-callback` scheme
- Craft: OAuth redirect to localhost callback server

**Deep Link Scheme:**
- Scheme: `craftagents://` (configurable via `CRAFT_DEEPLINK_SCHEME` for multi-instance dev)
- Handler: `apps/electron/src/main/deep-link.ts`
- Use Cases: OAuth completion, session sharing (viewer links)

**Session-Scoped Tool Callbacks:**
- onPlanSubmitted - Plan submission from agent
- onOAuthBrowserOpen - Open OAuth login URL
- onOAuthSuccess - OAuth token received
- onOAuthError - OAuth error occurred
- onCredentialRequest - Request user credential input
- onSourcesChanged - Sources configuration changed
- onSourceActivated - Source activated/switched

## API Integrations by Type

**MCP Servers (Via Model Context Protocol):**
- Workspace-configurable MCP servers
- Auth types: workspace_oauth, workspace_bearer, public
- Tool validation and filtering via `packages/shared/src/mcp/validation.ts`

**Direct APIs (Via SDK):**
- Anthropic Claude API - Messages, models, token counting
- No direct integrations to third-party APIs besides OAuth providers

---

*Integration audit: 2026-01-29*
