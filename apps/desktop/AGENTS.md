# Kata Desktop (apps/desktop)

Fresh Electron shell for Kata Desktop.

## Stack

- Electron main + preload bundled with esbuild
- Renderer: Vite + React 19 + Tailwind CSS v4 + Radix UI
- State: Jotai
- Agent runtime: `kata --mode rpc` subprocess managed by `PiAgentBridge`

## Key files

- `src/main/pi-agent-bridge.ts` — spawn/lifecycle + JSONL command/event bridge
- `src/main/rpc-event-adapter.ts` — maps RPC events to renderer chat events
- `src/main/ipc.ts` — session/chat/auth/workspace IPC handlers (`session:list`, `session:new`, `workspace:set`, etc.)
- `src/main/session-manager.ts` — reads `~/.kata-cli/sessions/*.jsonl` and derives sidebar metadata
- `src/shared/types.ts` — cross-process IPC and chat event contracts
- `src/renderer/components/` — app shell + chat UI (`SessionSidebar`, `WorkspaceIndicator`)

## Guardrails

- Keep all product naming as **Kata Desktop**.
- Never add legacy `@craft-*` imports in this app.
- Never log API keys or auth file content.
- Main process runs on Node.js (no Bun-only APIs).
