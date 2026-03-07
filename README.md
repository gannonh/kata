# Kata Agents

[![Version](https://img.shields.io/badge/version-0.6.0-green.svg)](https://github.com/gannonh/kata-agents/releases/tag/v0.6.0)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Kata Agents is a powerful productivity app for working with AI agents. Built on the Claude Agent SDK, it enables intuitive multitasking, seamless connection to APIs and services, and a document-centric workflow in a polished, natural language driven UI. **It's like Claude Code meets Slack.**

Part of the Kata ecosystem, alongside [Kata Orchestrator](https://github.com/gannonh/kata), [Kata Agents](https://github.com/gannonh/kata-agents), and [Kata Context](https://github.com/gannonh/kata-context).

[kata.sh](https://kata.sh/)

![Kata Agents Demo](assets/supercut.gif)

## Features

- **Multi-Session Inbox**: Desktop app with session management, status workflow, and flagging
- **Claude Code Experience**: Streaming responses, tool visualization, real-time updates
- **Git Integration**: Live branch display, PR status badge, real-time updates, worktree and submodule support
- **Agent Skills**: Specialized agent instructions stored per-workspace
- **MCP Integration**: Connect to any MCP server (Linear, GitHub, Notion, and more)
- **Sources**: Connect to REST APIs (Google, Slack, Microsoft), and local filesystems
- **Permission Modes**: Three-level system (Explore, Ask to Edit, Auto) with customizable rules
- **Background Tasks**: Run long-running operations with progress tracking
- **Dynamic Status System**: Customizable session workflow states (Todo, In Progress, Done, etc.)
- **Theme System**: Cascading themes at app and workspace levels
- **Multi-File Diff**: VS Code-style window for viewing all file changes in a turn
- **File Attachments**: Drag-drop images, PDFs, Office documents with auto-conversion

## Installation

### Download from GitHub Releases

Download the latest release for your platform from [GitHub Releases](https://github.com/gannonh/kata-agents/releases).

- **macOS**: `Kata-Agents-arm64.dmg` (Apple Silicon) or `Kata-Agents-x64.dmg` (Intel)
- **Windows**: `Kata-Agents-x64.exe`
- **Linux**: `Kata-Agents-x64.AppImage`

### Build from Source

```bash
git clone https://github.com/gannonh/kata-agents.git
cd kata-agents
bun install
bun run electron:start
```

## Quick Start

1. **Launch the app** after installation
2. **Choose API Connection**: Use your own Anthropic API key or Claude Max subscription
3. **Create a workspace**: Set up a workspace to organize your sessions
4. **Connect sources** (optional): Add MCP servers, REST APIs, or local filesystems
5. **Start chatting**: Create sessions and interact with Claude

## Desktop App Features

### Session Management

- **Inbox/Archive**: Sessions organized by workflow status
- **Flagging**: Mark important sessions for quick access
- **Status Workflow**: Todo -> In Progress -> Needs Review -> Done
- **Session Naming**: AI-generated titles or manual naming
- **Session Persistence**: Full conversation history saved to disk

### Sources

Connect external data sources to your workspace:

| Type            | Examples                                          |
| --------------- | ------------------------------------------------- |
| **MCP Servers** | Linear, GitHub, Notion, custom servers            |
| **REST APIs**   | Google (Gmail, Calendar, Drive), Slack, Microsoft |
| **Local Files** | Filesystem, Obsidian vaults, Git repos            |

### Channels

Connect communication platforms for always-on, background message processing:

| Channel   | Mode              | Features                              |
| --------- | ----------------- | ------------------------------------- |
| **Slack** | Poll + Subscribe  | Channel messages, slash commands       |

See [Slack Setup Guide](docs/slack-setup.md) for configuration instructions.

### Permission Modes

| Mode        | Display     | Behavior                               |
| ----------- | ----------- | -------------------------------------- |
| `safe`      | Explore     | Read-only, blocks all write operations |
| `ask`       | Ask to Edit | Prompts for approval (default)         |
| `allow-all` | Auto        | Auto-approves all commands             |

Use **SHIFT+TAB** to cycle through modes in the chat interface.

### Git Integration

Git context is displayed in the chat input toolbar and injected into agent conversations:

- **Branch badge**: Current git branch name, updates in real-time via file watching
- **PR badge**: Linked pull request title and status (open/draft/merged/closed), click to open in browser
- **AI awareness**: Agent receives branch and PR context per message
- **Worktree/submodule support**: Handles `.git` file gitdir pointers transparently
- **Graceful degradation**: No git indicator for non-git directories, helpful message when `gh` CLI is unavailable

### Keyboard Shortcuts

| Shortcut      | Action                    |
| ------------- | ------------------------- |
| `Cmd+N`       | New chat                  |
| `Cmd+1/2/3`   | Focus sidebar/list/chat   |
| `Cmd+/`       | Keyboard shortcuts dialog |
| `SHIFT+TAB`   | Cycle permission modes    |
| `Enter`       | Send message              |
| `Shift+Enter` | New line                  |

## Architecture

```
kata-agents/
├── apps/
│   └── electron/              # Desktop GUI (primary)
│       └── src/
│           ├── main/          # Electron main process
│           ├── preload/       # Context bridge
│           └── renderer/      # React UI (Vite + shadcn)
└── packages/
    ├── core/                  # Shared types
    └── shared/                # Business logic
        └── src/
            ├── agent/         # Kata agent, permissions
            ├── auth/          # OAuth, tokens
            ├── config/        # Storage, preferences, themes
            ├── credentials/   # AES-256-GCM encrypted storage
            ├── git/           # Git service, PR service
            ├── sessions/      # Session persistence
            ├── sources/       # MCP, API, local sources
            └── statuses/      # Dynamic status system
```

## Development

```bash
# Hot reload development
bun run electron:dev

# Build and run
bun run electron:start

# Type checking
bun run typecheck:all

# Debug logging (writes to ~/Library/Logs/Kata Agents/)
# Logs are automatically enabled in development
```

### Environment Variables

OAuth integrations (Google, Slack, Microsoft) require credentials. Create a `.env` file:

```bash
MICROSOFT_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
SLACK_OAUTH_CLIENT_ID=your-slack-client-id
SLACK_OAUTH_CLIENT_SECRET=your-slack-client-secret
```

See [Google Cloud Console](https://console.cloud.google.com/apis/credentials) to create OAuth credentials.

## Configuration

Configuration is stored at `~/.kata-agents/`:

```
~/.kata-agents/
├── config.json              # Main config (workspaces, auth type)
├── credentials.enc          # Encrypted credentials (AES-256-GCM)
├── preferences.json         # User preferences
├── theme.json               # App-level theme
└── workspaces/
    └── {id}/
        ├── config.json      # Workspace settings
        ├── theme.json       # Workspace theme override
        ├── sessions/        # Session data (JSONL)
        ├── sources/         # Connected sources
        ├── skills/          # Custom skills
        └── statuses/        # Status configuration
```

## Advanced Features

### Large Response Handling

Tool responses exceeding ~60KB are automatically summarized using Claude Haiku with intent-aware context. The `_intent` field is injected into MCP tool schemas to preserve summarization focus.

### Deep Linking

External apps can navigate using `kataagents://` URLs:

```
kataagents://allChats                    # All chats view
kataagents://allChats/chat/session123    # Specific chat
kataagents://settings                    # Settings
kataagents://sources/source/github       # Source info
kataagents://action/new-chat             # Create new chat
```

## Tech Stack

| Layer       | Technology                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Runtime     | [Bun](https://bun.sh/)                                                                         |
| AI          | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) |
| Desktop     | [Electron](https://www.electronjs.org/) + React                                                |
| UI          | [shadcn/ui](https://ui.shadcn.com/) + Tailwind CSS v4                                          |
| Build       | esbuild (main) + Vite (renderer)                                                               |
| Credentials | AES-256-GCM encrypted file storage                                                             |

## License

Apache License 2.0 - see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

### Local MCP Server Isolation

When spawning local MCP servers (stdio transport), sensitive environment variables are filtered out to prevent credential leakage to subprocesses. Blocked variables include:

- `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` (app auth)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- `GITHUB_TOKEN`, `GH_TOKEN`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `STRIPE_SECRET_KEY`, `NPM_TOKEN`

To explicitly pass an env var to a specific MCP server, use the `env` field in the source config.

To report security vulnerabilities, please see [SECURITY.md](SECURITY.md).
