# Phase 18: Channel Fit and Finish - Research

**Researched:** 2026-02-13
**Domain:** Slack mrkdwn conversion, Slack API (threads, slash commands), system prompt injection, Slack app setup
**Confidence:** HIGH

## Summary

Phase 18 builds on the completed channel infrastructure (Phases 10-17) to polish the Slack integration with four focused improvements: markdown-to-mrkdwn conversion for outbound messages, channel context injection into the system prompt, chat lifecycle features (thread replies, conversation resets), and end-user setup documentation.

The outbound message path flows: `sendMessageHeadless()` -> `processDaemonMessage()` -> daemon `message_processed` command -> `channelRunner.deliverOutbound()` -> `SlackChannelAdapter.send()` -> `chat.postMessage()`. Markdown conversion should happen before `chat.postMessage()` in the adapter's `send()` method, keeping the conversion adapter-specific (WhatsApp has different formatting rules).

Channel context injection follows the existing pattern used by `getDateTimeContext()` and `formatGitContext()` in `buildTextPrompt()` and `buildSDKUserMessage()`. The CraftAgent already receives channel info via `ManagedSession.channel` and can propagate it to the prompt builder.

**Primary recommendation:** Use `md-to-slack` for markdown conversion (zero new transitive dependencies since `marked` is already installed). Keep slash commands out of scope for Phase 18 since they require Socket Mode (`@slack/socket-mode`), a new token type (app-level `xapp-` token), and architectural changes to the adapter model. Thread reply support via `conversations.replies` fits within the existing polling architecture and should be implemented.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| `md-to-slack` | 1.1.7 | Markdown -> Slack mrkdwn conversion | Only dependency is `marked` (already installed). TypeScript. MIT license. Handles headings, bold, italic, strikethrough, code blocks, links, lists, blockquotes. |
| `@slack/web-api` | ^7.13.0 | Slack API client | Already installed. Used by `SlackChannelAdapter`. Provides `conversations.replies`, `chat.postMessage`. |

### Supporting

| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| `@slack/socket-mode` | latest | WebSocket-based Slack event delivery | Future phase: slash commands, app mentions, real-time events. Requires app-level token. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| `md-to-slack` | `slackify-markdown` v5 | 7 transitive deps (unified/remark ecosystem). Node >= 22 required. More mature (168 stars, 14 contributors) but heavier. |
| `md-to-slack` | Hand-rolled converter | Zero deps. Full control. But `md-to-slack` already handles edge cases (nested lists, HTML entities, GFM checkboxes) that a hand-rolled solution would miss. |
| Polling + `conversations.replies` | Socket Mode (`@slack/socket-mode`) | Socket Mode enables slash commands, app mentions, real-time delivery. But requires new token type (app-level token), adapter architecture change from poll to subscribe, and credential model changes. Better as a follow-up phase. |

**Installation:**
```bash
bun add md-to-slack
```

**Note on Node >= 22 requirement:** `md-to-slack` specifies `engines.node >= 22.16.0`. The daemon runs as a Bun subprocess (Bun handles ESM natively and ignores Node engine constraints). The Electron main process bundles via esbuild, which compiles ESM to CJS at build time. Neither path is affected by the Node engine field.

## Architecture Patterns

### Markdown Conversion Placement

The conversion should happen in the adapter's `send()` method, not in the daemon entry or session manager. This keeps the conversion adapter-specific:

```
SlackChannelAdapter.send() {
  // Convert markdown -> mrkdwn before posting
  const mrkdwnContent = markdownToSlack(message.content);
  await this.client.chat.postMessage({
    channel: message.channelId,
    text: mrkdwnContent,
    thread_ts: message.threadId,
  });
}
```

**Rationale:** Different adapters have different formatting requirements. Slack uses mrkdwn. WhatsApp uses its own formatting (bold = `*text*`, italic = `_text_`). Keeping conversion in the adapter layer means the daemon and session manager always work with standard markdown.

### Markdown-to-Slack mrkdwn Conversion Rules

| Standard Markdown | Slack mrkdwn | Notes |
| --- | --- | --- |
| `**text**` / `__text__` | `*text*` | Bold uses single asterisks |
| `*text*` / `_text_` | `_text_` | Italic uses underscores |
| `~~text~~` | `~text~` | Strikethrough uses single tildes |
| `` `code` `` | `` `code` `` | Identical |
| ```` ```code``` ```` | ```` ```code``` ```` | Identical (no syntax highlighting) |
| `[text](url)` | `<url\|text>` | Angle bracket + pipe format |
| `![alt](url)` | *(stripped)* | Images not supported in mrkdwn |
| `# Heading` | `*Heading*` (bold) | No heading syntax; converted to bold |
| `> quote` | `> quote` | Identical |
| `- item` / `* item` | `- item` | Identical |
| `1. item` | `1. item` | Identical |
| `---` / `***` | *(stripped)* | Horizontal rules not supported |
| Tables | *(stripped or flattened)* | Tables not supported in mrkdwn |

**Characters requiring escaping:** `&` -> `&amp;`, `<` -> `&lt;`, `>` -> `&gt;` (in non-quote contexts)

### Channel Context Injection

Follow the existing context injection pattern in `CraftAgent`:

```typescript
// In buildTextPrompt() and buildSDKUserMessage(), add channel context
// similar to gitContext, dateTimeContext, and workingDirectoryContext

function formatChannelContext(channel?: { adapter: string; slug: string }): string {
  if (!channel) return '';
  return `<channel_context>
You are responding via a ${channel.adapter} channel (${channel.slug}).
Your responses will be delivered to the user through this channel's messaging interface.
Keep responses concise and conversational. Avoid large code blocks or complex formatting
that may not render well in the messaging client. Do not use markdown image syntax.
</channel_context>`;
}
```

**Where to add:** The `CraftAgent` constructor already receives session config. Add an optional `channel` field to the agent config, populated from `ManagedSession.channel` in `getOrCreateAgent()`. Then inject the context in `buildTextPrompt()` after the working directory context.

**Prompt caching consideration:** Channel context is session-stable (doesn't change between messages), so it could go in the system prompt via `getSystemPrompt()`. However, the existing pattern puts dynamic context in user messages. Since channel context is set per-session and never changes, placing it in the system prompt append (like project context files) is also valid and slightly better for caching.

### Thread Reply Support

The existing `SlackChannelAdapter` already handles thread context:
- Inbound: `toChannelMessage()` maps `thread_ts` to `replyTo.threadId` (line 147-154 of slack-adapter.ts)
- Outbound: `send()` passes `thread_ts: message.threadId` to `chat.postMessage()` (line 161 of slack-adapter.ts)
- Session resolution: `resolveSessionKey()` uses `threadId` when present to create thread-specific session keys

Thread reply support for **fetching thread context** requires `conversations.replies`:

```typescript
// Fetch thread history for context when resuming a thread session
const result = await this.client.conversations.replies({
  channel: slackChannelId,
  ts: threadTs,          // Parent message timestamp
  limit: 20,             // Reasonable context window
});
```

**Required scope:** `conversations.replies` uses the same scopes as `conversations.history` (`channels:history`, `groups:history`, etc.). No new OAuth scopes needed.

### Chat Lifecycle: Conversation Reset

For "reset keywords" (e.g., user sends "reset", "/reset", or "new conversation"):

```typescript
// In ChannelRunner.handleMessage() or as a TriggerMatcher pattern
const RESET_KEYWORDS = ['/reset', '/new', 'reset conversation'];

function isResetCommand(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return RESET_KEYWORDS.some(kw => normalized === kw);
}
```

When a reset is detected, the daemon should create a new session key (by varying the threadKey input to `resolveSessionKey`) rather than reusing the existing channel session.

### Anti-Patterns to Avoid

- **Converting in the daemon entry:** The daemon should be format-agnostic. Adapter-specific formatting belongs in the adapter layer.
- **Injecting channel context via system prompt modification at runtime:** Changing the system prompt between messages breaks SDK session resumption. Use user message injection or set it once at session creation.
- **Polling `conversations.replies` on every poll cycle:** Only fetch thread replies when processing a message that has `thread_ts`. Don't poll threads proactively.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Markdown -> mrkdwn | Regex-based converter | `md-to-slack` | Edge cases with nested formatting, HTML entities, GFM checkboxes, list indentation. `marked` parser handles these correctly. |
| Slack API calls | Raw HTTP fetch | `@slack/web-api` | Already installed. Handles rate limiting, retries, pagination, token refresh. |

**Key insight:** The markdown-to-mrkdwn conversion looks simple but has subtle edge cases. Bold in markdown is `**text**` but in mrkdwn is `*text*`. Italic in markdown can be `*text*` or `_text_`. A naive regex replacement of `*text*` would conflict between bold and italic handling. Using a proper parser (`marked`) avoids this entirely.

## Common Pitfalls

### Pitfall 1: Bold/Italic Conflict in Conversion
**What goes wrong:** Naive regex `s/\*\*(.*?)\*\*/*$1*/g` followed by `s/\*(.*?)\*/_$1_/g` would double-convert bold markers.
**Why it happens:** Standard markdown and Slack mrkdwn use overlapping syntax for different purposes.
**How to avoid:** Use a proper markdown parser (`marked`) with a custom renderer. `md-to-slack` does this.
**Warning signs:** Bold text appearing as italic, or formatting being stripped entirely.

### Pitfall 2: Slack Message Length Limit
**What goes wrong:** Slack `chat.postMessage` has a 40,000 character limit for `text` content and a 3,000 character limit per `mrkdwn` text block.
**Why it happens:** Agent responses can be long, especially with code blocks.
**How to avoid:** If the converted content exceeds limits, split into multiple messages or truncate with an indicator. For Block Kit, chunk into multiple section blocks.
**Warning signs:** Slack API returning `msg_too_long` errors.

### Pitfall 3: System Prompt Drift Breaking Session Resumption
**What goes wrong:** SDK session resumption expects a stable system prompt. If channel context changes the system prompt between messages, resumption fails silently.
**Why it happens:** The SDK uses system prompt as part of session identity.
**How to avoid:** Set channel context once at agent creation time (in the `append` string of `getSystemPrompt()`), not dynamically per-message. Or inject via user messages (which are expected to vary).
**Warning signs:** Sessions not resuming, duplicate tool registrations.

### Pitfall 4: Thread Session Proliferation
**What goes wrong:** Every Slack thread creates a new daemon session (via `resolveSessionKey` with distinct `threadId`). Active workspaces could accumulate hundreds of sessions.
**Why it happens:** The session resolver creates unique keys per thread.
**How to avoid:** Consider session cleanup/archival for inactive thread sessions. The existing `ManagedSession` pattern supports this, but Phase 18 should at minimum document this as a known limitation.
**Warning signs:** Growing memory usage, slow session list loading.

### Pitfall 5: Slash Commands Require Server Infrastructure
**What goes wrong:** Attempting to implement slash commands with the current polling architecture fails. Slack sends slash command payloads via HTTP POST to a Request URL.
**Why it happens:** The current adapter uses `conversations.history` polling, which doesn't receive slash command events.
**How to avoid:** Slash commands require either Socket Mode (`@slack/socket-mode` with app-level token) or an HTTP endpoint. Recommend deferring to a future phase.
**Warning signs:** Slash commands configured in Slack app but never received by the adapter.

## Code Examples

### Markdown to mrkdwn Conversion in Adapter

```typescript
// Source: md-to-slack npm package + existing SlackChannelAdapter
import { markdownToSlack } from 'md-to-slack';

// In SlackChannelAdapter.send():
async send(message: OutboundMessage): Promise<void> {
  if (!this.client) throw new Error('SlackChannelAdapter not configured');

  // Convert standard markdown to Slack mrkdwn
  const mrkdwnContent = markdownToSlack(message.content);

  await this.client.chat.postMessage({
    channel: message.channelId,
    text: mrkdwnContent,
    thread_ts: message.threadId,
  });
}
```

### Channel Context Injection in CraftAgent

```typescript
// In packages/shared/src/prompts/system.ts (new export)
export function formatChannelContext(channel?: { adapter: string; slug: string }): string {
  if (!channel) return '';

  const adapterLabel = channel.adapter.charAt(0).toUpperCase() + channel.adapter.slice(1);

  return `<channel_context adapter="${channel.adapter}" slug="${channel.slug}">
You are responding through a ${adapterLabel} channel. Your responses are delivered as
${adapterLabel} messages, not rendered markdown. Adjust your output:
- Keep responses concise and conversational
- Avoid tables (not supported in Slack mrkdwn)
- Avoid image markdown syntax (not supported)
- Minimize large code blocks (hard to read in chat)
- Use simple formatting: bold, italic, code, lists, quotes
- Do not include HTML tags
</channel_context>`;
}
```

### Conversation Reset Detection

```typescript
// In packages/shared/src/channels/trigger-matcher.ts or new file
const RESET_PATTERNS = [
  /^\/reset$/i,
  /^\/new$/i,
  /^reset\s*conversation$/i,
  /^start\s*over$/i,
];

export function isResetCommand(content: string): boolean {
  const trimmed = content.trim();
  return RESET_PATTERNS.some(pattern => pattern.test(trimmed));
}
```

### Fetching Thread Replies for Context

```typescript
// In SlackChannelAdapter (new method)
async fetchThreadReplies(
  slackChannelId: string,
  threadTs: string,
  limit = 20,
): Promise<Array<{ user: string; text: string; ts: string }>> {
  if (!this.client) throw new Error('SlackChannelAdapter not configured');

  const result = await this.client.conversations.replies({
    channel: slackChannelId,
    ts: threadTs,
    limit,
  });

  return (result.messages ?? [])
    .filter(msg => msg.bot_id !== this.botId && msg.user !== this.botUserId)
    .map(msg => ({
      user: msg.user ?? 'unknown',
      text: msg.text ?? '',
      ts: msg.ts ?? '',
    }));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Classic Slack apps / custom bots | New Slack app model only | June 2024 (creation disabled), March 2025 (legacy stopped) | All new Slack integrations must use the new app model |
| HTTP Request URL for events | Socket Mode (WebSocket) available | 2020+ | Desktop apps can receive events without public endpoints |
| Simple text messages | Block Kit with mrkdwn sections | Ongoing | Richer formatting via `blocks` array in `chat.postMessage` |

**Deprecated/outdated:**
- Classic Slack bot creation: No longer possible as of June 2024. Existing bots stopped working March 2025.
- `rtm.start` / RTM API for bots: Deprecated in favor of Events API + Socket Mode.

## Scope Recommendation

### In Scope for Phase 18
1. **Markdown stripping** - `md-to-slack` integration in `SlackChannelAdapter.send()`
2. **Channel context** - `formatChannelContext()` injected into agent prompts
3. **Thread reply support** - Already partially implemented; add `conversations.replies` for thread context fetching
4. **Conversation reset** - Detect reset keywords, create new session
5. **Setup documentation** - Step-by-step Slack app creation guide

### Deferred (Recommend Separate Phase)
1. **Slash commands** - Requires Socket Mode, app-level token, adapter architecture changes
2. **App mentions** (`@bot`) - Same Socket Mode dependency as slash commands
3. **Block Kit rich formatting** - More complex than plain mrkdwn text; optional enhancement
4. **Message length splitting** - Handle when response exceeds 40K chars

### Rationale for Deferring Slash Commands
The roadmap lists "slash commands" as in-scope, but implementing them requires:
- Adding `@slack/socket-mode` dependency
- Changing the adapter from poll-based to subscribe-based (or hybrid)
- A new credential type (app-level token `xapp-`)
- Changes to the credential storage model (currently stores a single string per channel credential; would need to store both `xoxb-` and `xapp-` tokens)
- Changes to `ChannelConfig` to include app-level token reference

This is a meaningful architectural change that aligns better with a dedicated "Socket Mode" phase. The existing polling architecture already supports thread replies and conversation reset without these changes.

## Open Questions

1. **Message length handling**
   - What we know: Slack limits `text` to ~40K chars, mrkdwn blocks to 3K chars
   - What's unclear: How often will agent responses exceed these limits?
   - Recommendation: Add length check and truncation with "... (response truncated)" as a guard. Split into multiple messages as a follow-up.

2. **Thread session cleanup**
   - What we know: Each Slack thread creates a unique session via `resolveSessionKey`
   - What's unclear: How many thread sessions accumulate in practice? What's the memory impact?
   - Recommendation: Document as known limitation. Address in a future phase with session archival/cleanup.

3. **Slash command scope boundary**
   - What we know: Slash commands require Socket Mode + app-level token
   - What's unclear: Does the user expect slash commands in this phase?
   - Recommendation: Confirm with user. The roadmap scope says "slash commands" but the infrastructure cost is significant. Suggest deferring to a "Socket Mode" phase.

## Sources

### Primary (HIGH confidence)
- `/slackapi/node-slack-sdk` (Context7) - `chat.postMessage`, `conversations.replies`, `MrkdwnElement`, `SocketModeClient`, slash commands handling
- `@slack/web-api` v7.13.0 - Already installed in project, API verified against Context7 docs
- `md-to-slack` source (GitHub: nicoespeon/md-to-slack) - Conversion logic uses `marked` with custom renderer
- Existing codebase: `slack-adapter.ts`, `channel-runner.ts`, `daemon/entry.ts`, `sessions.ts`, `craft-agent.ts`, `system.ts`

### Secondary (MEDIUM confidence)
- Slack Developer Docs (docs.slack.dev) - OAuth scopes, Socket Mode setup, app manifest
- Knock.app guide - Comprehensive markdown-to-mrkdwn conversion table
- `slackify-markdown` package.json (GitHub) - Node >= 22 requirement confirmed via raw package.json

### Tertiary (LOW confidence)
- WebSearch results for Slack app setup steps - General guidance, should be verified against current Slack dashboard UI

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - `md-to-slack` verified against source code; `marked` already installed; Slack API already in use
- Architecture: HIGH - Conversion placement and context injection follow established codebase patterns
- Pitfalls: HIGH - Based on Slack API documentation and codebase analysis
- Slash command deferral: MEDIUM - Architectural assessment is sound, but user may have different expectations about scope

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (Slack API is stable; library versions may update)
