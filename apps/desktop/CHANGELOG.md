# Changelog

## 0.1.1

### Fixes

- **Session isolation** — Desktop sidebar now only shows sessions owned by this instance. Subagent child processes and external CLI sessions sharing the same workspace no longer pollute the session list or cause silent session switching.

## 0.1.0

Initial release of Kata Desktop — the native GUI for the Kata coding agent platform.

### Features

- **Chat** — Streaming chat with tool rendering, thinking blocks, permission modes (Explore/Ask/Auto), multi-provider support (Anthropic, OpenAI)
- **Sessions** — Multi-session sidebar with persistence, workspace picker, model selector, thinking level control
- **Onboarding** — 4-step first-launch wizard (welcome → provider → API key → model)
- **Planning View** — Right-pane live rendering of planning artifacts (ROADMAP, REQUIREMENTS, DECISIONS)
- **Workflow Kanban** — Right-pane kanban board for Linear workflow state with task expansion
- **Symphony Integration** — Start/stop/restart Symphony from the GUI, live worker dashboard, escalation handling, Symphony-aware kanban cards with worker assignment and live tool indicators
- **Settings** — Provider management, Symphony configuration, appearance settings
