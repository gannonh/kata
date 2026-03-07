# Feature Landscape: Always-On Assistant

**Domain:** Desktop AI assistant with daemon process, communication channels, and service plugins
**Researched:** 2026-02-07
**Confidence:** HIGH (based on shipping products: ChatGPT Agent, Claude Desktop, Microsoft Copilot, Lindy AI)

## 1. Communication Channel Features (Slack/Discord/WhatsApp)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Receive messages from channels** | Users expect the agent to see incoming messages. Every Slack AI bot and ChatGPT integration does this. Without it, the channel is decorative. | Medium | Slack MCP servers already exist (both official and community). Kata already has Slack OAuth. |
| **Send messages to channels** | Bidirectional communication. Slack Agentforce, Discord bots, and WhatsApp chatbots all reply in-channel. Users expect the assistant to respond where it was asked. | Medium | Slack API `chat.postMessage`. Must post as the user's bot, not impersonate the user. |
| **Channel selector / routing** | Users need to choose which channels the agent monitors. Lindy, ClearFeed, and Runbear all require explicit channel configuration. Unsolicited monitoring of all channels is a trust violation. | Low | Config-level: list of channel IDs/names. Per-workspace setting. |
| **Message threading** | Responses must thread properly. Slack's threading model is foundational to its UX. Flat replies to threaded conversations break context. | Low | Slack API supports `thread_ts`. Discord has reply chains. |
| **Mention/trigger mode** | Agent should respond to @mentions or explicit triggers, not every message. This is standard for Slack bots (Agentforce, eesel.ai) and Discord bots. | Low | Filter on `app_mention` events or configurable keywords. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Channel-to-session mapping** | Each Slack thread or channel becomes a Kata session with full context, tools, and MCP access. No competitor maps channel conversations into a rich desktop session. ChatGPT Agent is web-only. Lindy has no desktop session concept. | High | New session type: `channel-session`. Needs bidirectional sync: messages from channel appear in Kata UI, agent responses go back to channel. |
| **Cross-channel context** | Agent can reference information from one channel when responding in another. "Check #engineering for the deploy status" and the agent actually does it. | High | Requires multi-channel read access and context aggregation. Privacy implications. |
| **Desktop notification bridge** | Slack/Discord messages that need agent attention surface as native macOS notifications with quick-reply. Microsoft Copilot is heading this direction with taskbar agent status. | Medium | Electron `Notification` API. Must respect Do Not Disturb. |
| **Rich message formatting** | Agent sends Slack Block Kit / Discord embed messages, not plain text. Tables, code blocks, interactive buttons. | Medium | Slack Block Kit API. Discord embeds. Platform-specific formatting. |

### Anti-Features for v0.7.0

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **WhatsApp integration** | WhatsApp's January 2026 AI policy blocks general-purpose AI chatbots, bans open-ended AI conversations, and prohibits sending user messages to AI providers. Compliance risk is high. | Defer entirely. Slack and Discord first. WhatsApp only if purpose-specific use case emerges. |
| **Discord bot hosting** | Running a Discord bot requires a persistent server process, bot token management, and Discord Developer Portal setup. Heavy operational burden for v0.7.0. | Support Discord via webhook-based read/write, not a full bot. Or defer to v0.8.0. |
| **Auto-reply to all messages** | Slack users hate noisy bots. ClearFeed and eesel.ai both default to mention-only mode. Unsolicited replies erode trust fast. | Default to @mention or keyword trigger. Explicit opt-in for auto-reply per channel. |
| **Voice/audio channel support** | Discord voice, Slack huddles. Requires speech-to-text, adds massive complexity. No competitor does this well yet. | Text channels only. Voice is a separate feature area. |
| **Message editing/deletion** | Modifying or deleting channel messages raises trust and audit concerns. Slack's audit log expectations conflict with this. | Send-only for v0.7.0. Agent can send new messages, not edit or delete existing ones. |

## 2. Service Plugin Features (Gmail)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Read emails** | Gmail MCP servers already support search and retrieval by sender, subject, label, date, keywords. Gemini 3 in Gmail does this natively. Users expect read access as baseline. | Low | Gmail MCP server (community, multiple implementations). Kata already has Google OAuth with Gmail scopes defined in `types.ts`. |
| **Search inbox** | "Find emails from Alice about the contract" is the canonical AI email use case. Every Gmail AI assistant (Lindy, Gmelius, Gemini) supports search. | Low | Gmail API search operators. Already supported by existing MCP servers. |
| **Draft emails** | Composing drafts (not sending) is safe and expected. Gmail's "Help Me Write" and Gemini's draft suggestions set this expectation. | Low | Gmail API `drafts.create`. Draft stays in Drafts folder until user sends. |
| **Email thread context** | Full thread retrieval, not just individual messages. Gmail's thread model groups related messages. AI assistants that miss thread context feel broken. | Medium | Gmail API `threads.get`. Returns all messages in a thread. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Send emails with confirmation** | Agent drafts the email, shows it to user in Kata UI, user clicks confirm, then it sends. ChatGPT Agent requests permission before consequential actions. This is the trust-building pattern. | Medium | Two-step: `drafts.create` then `drafts.send` after UI confirmation. Maps to existing permission mode system. |
| **Cross-source context** | "Summarize the emails from Alice and create a Linear ticket." Agent uses Gmail source + Linear MCP source in one session. This is the multi-source advantage of Kata's architecture. | Medium | Already architecturally supported. Multiple sources per workspace. The differentiator is making it seamless. |
| **Label management** | Apply/remove labels, archive messages. Gemini 3 does this. Lindy supports inbox organization. | Low | Gmail API `messages.modify`. Labels are non-destructive. |
| **Attachment handling** | Read attachments from emails, attach files to drafts. Gmail MCP servers support this. | Medium | File download to temp dir, upload via API. Size limits apply. |

### Anti-Features for v0.7.0

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Auto-send emails** | Sending email without user confirmation is a trust-destroying action. Even Gemini 3's "predictive actions" require confirmation for sending. The Google Antigravity incident (agent deleted a user's entire Drive) is the cautionary tale. | Always require explicit user confirmation before `send`. |
| **Delete emails** | Permanent deletion. No competitor auto-deletes. Gmail's own AI moves to trash at most. | Out of scope. Archive is acceptable with confirmation. |
| **Calendar integration** | Google Calendar is a separate service with different scopes and complexity (recurring events, timezone handling, attendee management). | Separate source plugin. Not bundled with Gmail for v0.7.0. |
| **Contact management** | Editing Google Contacts from an AI agent is high-risk, low-reward. Nobody is asking for this. | Read-only contact lookup at most, for email autocomplete. |
| **Full inbox management** | Gemini 3 is moving toward "autonomous inbox" with bill payments and flight rebooking. This is Google's game to play with their own APIs. | Read, search, draft, label. Not "manage my inbox." |

## 3. Daemon / Background Process Features

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **System tray / menu bar presence** | Claude Desktop lives in the dock. Microsoft Copilot shows in the Windows system tray. PyGPT has tray-icon dropdown. Users expect always-on desktop assistants to have a tray icon. | Low | Electron `Tray` API. macOS menu bar, Windows system tray. Already in Electron app paradigm. |
| **Background process survival** | App continues running when all windows are closed. Standard pattern: listen to `window-all-closed`, hide dock icon, keep tray. Claude Desktop does this. | Low | Electron `app.on('window-all-closed')` + `app.dock.hide()` on macOS. Well-documented pattern. |
| **Quick launch from tray** | Click tray icon or keyboard shortcut to open main window instantly. Claude Desktop's "quick entry from anywhere" is the benchmark. | Low | `globalShortcut.register()` + `mainWindow.show()`. |
| **Status indicator** | Tray icon shows daemon state: idle, processing, error. Microsoft Copilot shows microphone status in system tray. NVIDIA G-Assist shows status. Users need to know the daemon is alive. | Low | Swap `Tray` icon between states. Green/yellow/red or custom icons. |
| **Graceful shutdown** | Clean shutdown of background tasks, MCP connections, and channel listeners when quitting. No zombie processes. | Medium | Already relevant: `SessionManager` manages Bun subprocesses. Need cleanup on `app.before-quit`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Scheduled tasks** | ChatGPT has Tasks: run later, repeat daily/weekly/monthly. No desktop AI app does this locally. Kata could run scheduled tasks against local MCP servers and files, not just web. | High | Needs a task scheduler (cron-like). Tasks persist to disk. Execute in background session. ChatGPT limits to 10 active tasks. |
| **Event-driven triggers** | Go beyond scheduled time. Trigger agent sessions from: new Slack message, new email, file change, git push. Codex desktop has "automations" feature. | High | Requires event listener framework. Each channel/service plugin registers triggers. Complex state management. |
| **Health dashboard** | Show uptime, active connections, recent activity, error log in a dedicated UI panel. Enterprise agents (BeyondTrust, Strata) provide audit trails. Desktop equivalent is a health/status view. | Medium | New UI panel. Reads from daemon log. Shows MCP connection status (already tracked), channel listener status, last activity timestamps. |
| **Resource-aware throttling** | Daemon detects low battery, high CPU, or metered network and throttles background tasks. No competitor does this. Respect the user's machine. | Medium | Electron `powerMonitor` API. `powerSaveBlocker` for critical tasks. |

### Anti-Features for v0.7.0

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Always-listening voice** | Microsoft Copilot's "Hey Copilot" shows microphone in system tray. Privacy-sensitive. Requires speech-to-text pipeline. | Text-only triggers. No microphone access. |
| **Auto-start on login** | Aggressive behavior. Many users dislike apps that auto-register as login items. | Offer as opt-in setting in preferences. Off by default. |
| **Background model inference** | Running local LLM or doing speculative pre-computation. Battery drain, CPU heat. | Only process when triggered by user action, schedule, or event. |
| **Cross-app screen monitoring** | Reading other app windows, screenshots. Privacy nightmare. NVIDIA G-Assist does this for games but it's purpose-specific. | Only access data through configured sources (MCP, API, filesystem). No screen capture. |

## 4. Permission and Security Features

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Action confirmation for consequential operations** | ChatGPT Agent requests permission before consequential actions. Anthropic's own Claude Desktop blocks destructive operations. The existing Kata permission modes (safe/ask/allow-all) already implement this pattern. Users expect it. | Low | Extend existing permission system. Channel sends and email sends require confirmation in `ask` mode. `allow-all` mode auto-approves. |
| **Per-channel permissions** | Users need to control what the agent can do in each channel. Slack enterprise admins expect this. | Medium | Extension of existing per-source `permissions.json` pattern. Each channel source gets its own permission config. |
| **Credential isolation** | Channel tokens, email tokens must not leak to MCP servers or other sources. Existing `BLOCKED_ENV_VARS` in `client.ts` shows this is already a concern. | Low | Already architecturally addressed. Extend blocked vars list. Ensure channel credentials stay in credential manager, not env. |
| **Audit log** | Record of all autonomous actions taken: messages sent, emails drafted, tasks executed. Enterprise security (BeyondTrust, Strata, CSA) calls this mandatory for AI agents. | Medium | Append-only log file per workspace. Timestamp, action, source, result. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Least-privilege scoping** | Agent gets only the permissions needed for a specific task, for the duration of that task. Just-In-Time access. No competitor does this at the desktop level. Security best practice (BeyondTrust, WSO2). | High | Time-bounded permission grants. Revoke after task completes. Requires rethinking permission model from session-level to task-level. |
| **Human-in-the-loop escalation** | When the agent is uncertain about an action, it escalates to the user with context, not just a yes/no prompt. Shows what it wants to do, why, and what the consequences are. | Medium | Enhanced confirmation dialog. Already partially implemented in `ask` mode. Add consequence description and undo information. |
| **Rate limiting** | Cap autonomous actions per time period. Prevent runaway agents from sending 100 Slack messages or drafting 50 emails. The Google Antigravity incident. | Low | Configurable limits per source per time window. Default: conservative. |
| **Scope visualization** | UI shows exactly what permissions the daemon has right now. What channels it's monitoring, what email access it has, what MCP tools are available. Transparency builds trust. | Medium | New UI panel. Reads from active source configs and permission files. |

### Anti-Features for v0.7.0

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Implicit permission inheritance** | Agent should not inherit the user's full Slack permissions or Gmail access. "Users often have broad permissions accumulated over years" (WSO2). | Explicit scope selection during source setup. Minimum viable permissions. |
| **Autonomous account creation** | Agent should not create accounts, sign up for services, or accept terms on behalf of the user. | Block entirely. User creates accounts themselves. |
| **Cross-workspace credential sharing** | Credentials from one workspace leaking to another. | Credentials are already workspace-scoped (`source_oauth::{workspaceId}::{sourceSlug}`). Maintain this boundary. |

## 5. Session Management: Channel-to-Session Mapping

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **One session per channel thread** | Each Slack thread or Discord conversation maps to one Kata session. Microsoft Agent Framework uses `AgentThread` for this. OpenAI Agents SDK has explicit session objects. | Medium | New session source field: `channelId`, `threadId`. Session created on first message, reused on subsequent. |
| **Session persistence across restarts** | Channel sessions survive daemon restart. ChatGPT Tasks persist. Users expect continuity. | Low | Already solved: sessions are JSONL files on disk. Channel sessions use the same persistence layer. |
| **Context carryover within thread** | Agent remembers earlier messages in the same thread. Every chat AI does this. Microsoft Agent Framework injects full conversation history automatically. | Low | Standard session behavior. Channel messages append to session. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Unified session view** | Channel sessions appear in the same session list as direct chat sessions. User can switch between talking to the agent in Kata UI vs. through Slack, same session. No competitor unifies desktop and channel conversations. | High | Session gets a `channel` metadata field. Renderer shows channel icon badge. Messages have `source: 'slack' | 'direct'` indicator. |
| **Session handoff** | Start a conversation in Slack, continue in Kata desktop with full tools and MCP. Or vice versa. The "omnichannel" pattern from support tools (Zendesk, Intercom) applied to AI agents. | High | Requires message sync in both directions. Desktop messages route back to channel. Channel messages appear in desktop session. |
| **Background session execution** | Agent processes channel requests in background sessions without opening a window. Results post back to the channel. Codex desktop runs background agents with results in a review queue. | Medium | Background `SessionManager` subprocess. No renderer needed. Results go to channel via API. |
| **Session lifecycle from channel** | Slack commands to manage sessions: `/kata new`, `/kata status`, `/kata history`. | Medium | Slack slash commands. Each command maps to session manager operations. |

### Anti-Features for v0.7.0

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **One session per channel** | Mapping an entire channel to one session creates unbounded context. Threads are the right granularity. | One session per thread. New top-level message = new session. |
| **Unlimited concurrent channel sessions** | Memory and API cost explosion. ChatGPT limits to 10 active tasks. | Cap active channel sessions. Queue overflow. Configurable limit (default: 20). |
| **Cross-channel session merging** | Merging conversations from different channels into one session creates confusion and permission boundary violations. | Sessions stay scoped to their source channel. Cross-reference via tools, not merge. |

## Feature Dependencies

```
Daemon (background process)
├── System tray + status indicator
├── Quick launch shortcut
├── Graceful shutdown
│
├── Channel Listeners (requires daemon)
│   ├── Slack listener (requires Slack OAuth - EXISTING)
│   ├── Discord listener (deferred)
│   │
│   ├── Channel-to-Session mapping (requires session persistence - EXISTING)
│   │   ├── Unified session view (requires renderer changes)
│   │   └── Background session execution (requires SessionManager changes)
│   │
│   └── Message routing (requires permission system - EXISTING)
│       ├── @mention trigger filter
│       └── Per-channel permissions
│
├── Service Plugins (requires daemon for background ops)
│   ├── Gmail plugin (requires Google OAuth - EXISTING)
│   │   ├── Read/search (via Gmail MCP server)
│   │   ├── Draft (via Gmail API)
│   │   └── Send with confirmation (requires permission system)
│   │
│   └── Future: Calendar, Drive (separate plugins)
│
├── Scheduled Tasks (requires daemon)
│   ├── Task persistence (new storage layer)
│   ├── Cron-like scheduler
│   └── Background session execution
│
└── Security Layer
    ├── Audit log (new)
    ├── Rate limiting (new)
    ├── Action confirmation (extends EXISTING permission modes)
    └── Credential isolation (extends EXISTING credential manager)
```

### Key Existing Dependencies

These existing Kata features directly accelerate v0.7.0:

| Existing Feature | v0.7.0 Usage |
|-----------------|--------------|
| Slack OAuth (`slack-oauth.ts`) | Channel listener authentication |
| Google OAuth (`google-oauth.ts`) | Gmail plugin authentication |
| Source system (`sources/types.ts`) | Channel and service plugin configuration |
| Permission modes (safe/ask/allow-all) | Action confirmation for sends |
| Session persistence (JSONL) | Channel session storage |
| MCP client (`mcp/client.ts`) | Gmail MCP server connection |
| Credential manager (AES-256-GCM) | Secure token storage for all new integrations |
| Bun subprocess model (`sessions.ts`) | Background session execution |

## MVP Recommendation for v0.7.0

### Phase 1: Daemon Foundation
1. System tray with status indicator
2. Background process survival (close window, keep running)
3. Quick launch shortcut
4. Graceful shutdown with connection cleanup

### Phase 2: Gmail Service Plugin
1. Gmail source via existing MCP server ecosystem
2. Read, search, thread retrieval
3. Draft with confirmation flow
4. Send with explicit user approval (extends permission system)

### Phase 3: Slack Channel Integration
1. Slack listener using existing OAuth tokens
2. @mention trigger mode (default)
3. Channel-to-session mapping (one session per thread)
4. Send response back to thread

### Phase 4: Security and Polish
1. Audit log for all autonomous actions
2. Rate limiting per source
3. Per-channel permission configuration
4. Health dashboard in UI

### Deferred to v0.8.0+
- Scheduled tasks / recurring automations
- Event-driven triggers
- Discord integration
- Session handoff (Slack to desktop)
- Least-privilege scoping
- WhatsApp (policy barriers)

## Competitive Landscape Summary

| Product | Daemon | Channels | Email | Scheduled Tasks | Desktop + Channel Unified |
|---------|--------|----------|-------|-----------------|--------------------------|
| Claude Desktop | Dock presence, quick entry | None | None | None | N/A |
| ChatGPT Agent | Web-only | None native | Web browsing | Yes (10 limit, web) | N/A |
| Codex Desktop | macOS app | None | None | Automations (background) | N/A |
| Microsoft Copilot | System tray, taskbar agents | Teams (native) | Outlook (native) | Copilot Actions | Partial (within M365) |
| Lindy AI | Cloud-only | Slack, Discord | Gmail | Workflow triggers | No desktop app |
| **Kata Agents v0.7.0** | **System tray, background** | **Slack** | **Gmail** | **Deferred** | **Yes (unique)** |

Kata's unique position: the only desktop AI assistant that unifies direct chat sessions with channel conversations and service plugins in a single interface, backed by local MCP servers and workspace-scoped permissions. Microsoft Copilot comes closest but is locked to the M365 ecosystem. Lindy has the multi-channel capability but no desktop app. Claude Desktop has the daemon pattern but no integrations.

## Sources

- [ChatGPT Agent - OpenAI](https://openai.com/index/introducing-chatgpt-agent/)
- [ChatGPT Scheduled Tasks - OpenAI Help Center](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt)
- [OpenAI Codex Desktop App Launch](https://www.adwaitx.com/openai-codex-app-macos-features-2026/)
- [Slack AI Innovations](https://slack.com/blog/news/ai-innovations-in-slack)
- [Slack MCP Server - Official Docs](https://docs.slack.dev/ai/mcp-server/)
- [Gmail MCP Server - GitHub](https://github.com/GongRzhe/Gmail-MCP-Server)
- [Gmail Gemini 3 Integration - Google Blog](https://blog.google/products-and-platforms/products/gmail/gmail-is-entering-the-gemini-era/)
- [Gmail AI Inbox - TechCrunch](https://techcrunch.com/2026/01/08/gmail-debuts-a-personalized-ai-inbox-ai-overviews-in-search-and-more/)
- [WhatsApp 2026 AI Policy - Turn.io](https://learn.turn.io/l/en/article/khmn56xu3a-whats-app-s-2026-ai-policy-explained)
- [Microsoft Copilot Actions - Windows Insider Blog](https://blogs.windows.com/windows-insider/2025/11/17/copilot-on-windows-copilot-actions-begins-rolling-out-to-windows-insiders/)
- [Windows AI Agent Background Toggle](https://www.windowslatest.com/2026/01/07/microsoft-is-encouraging-developers-to-build-next-gen-ai-agents-for-windows-11-as-copilot-alone-isnt-enough/)
- [AI Agent Identity and Security - WSO2](https://wso2.com/library/blogs/why-ai-agents-need-their-own-identity-lessons-from-2025-and-resolutions-for-2026/)
- [Agentic AI Security - Strata](https://www.strata.io/blog/agentic-identity/8-strategies-for-ai-agent-security-in-2025/)
- [Securing Autonomous Agents - BeyondTrust](https://www.beyondtrust.com/blog/entry/securing-autonomous-access-with-pasm)
- [AI Agent Security Report 2026 - Gravitee](https://www.gravitee.io/blog/state-of-ai-agent-security-2026-report-when-adoption-outpaces-control)
- [Lindy AI Review](https://skywork.ai/blog/lindy-ai-review-2025-no-code-agent-platform-automation/)
- [Microsoft Agent Framework Multi-Turn Conversations](https://learn.microsoft.com/en-us/agent-framework/user-guide/agents/multi-turn-conversation)
- [Electron Background Process Pattern](https://moinism.medium.com/how-to-keep-an-electron-app-running-in-the-background-f6a7c0e1ee4f)
- [Electron Tray API](https://www.tutorialspoint.com/electron/electron_system_tray.htm)
- [Electron Notifications](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Slack MCP Server - Composio](https://composio.dev/blog/how-to-use-slack-mcp-server-with-claude-flawlessly)
- [Claude Desktop 2026 Roadmap Predictions](https://skywork.ai/blog/ai-agent/claude-desktop-roadmap-2026-features-predictions/)
