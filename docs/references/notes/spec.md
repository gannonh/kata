---
id: spec
title: Spec
tags: [spec]
pinned: true
created: "2026-02-19T23:44:17.216Z"
task:
  status: not_started
---

## Goal

Build a Rust TUI application using Ratatui that lets users browse, view, and manage GitHub Issues from their terminal.

## Architecture

```diagram
{
  "id": "arch-overview",
  "type": "diagram",
  "version": 1,
  "createdAt": "2026-02-19T00:00:00Z",
  "createdBy": "agent",
  "grammar": "architecture",
  "model": {
    "nodes": [
      {"id": "tui", "label": "TUI Layer\n(Ratatui + Crossterm)", "kind": "service"},
      {"id": "app", "label": "App State\n(Model)", "kind": "service"},
      {"id": "github", "label": "GitHub Client\n(octocrab)", "kind": "service"},
      {"id": "api", "label": "GitHub API", "kind": "external"},
      {"id": "auth", "label": "Auth\n(GITHUB_TOKEN)", "kind": "datastore"}
    ],
    "edges": [
      {"id": "e1", "from": "tui", "to": "app", "label": "events / render"},
      {"id": "e2", "from": "app", "to": "github", "label": "requests"},
      {"id": "e3", "from": "github", "to": "api", "label": "REST API"},
      {"id": "e4", "from": "auth", "to": "github", "label": "token"}
    ]
  },
  "baseView": {
    "layout": {"type": "layered", "direction": "LR", "spacing": 120}
  }
}
```

## Tasks

- [x] [Scaffold Rust project with dependencies](intent://local/task/782727e8-2318-4ebe-8aec-6404e64b9158)

- [x] [Implement GitHub API client module](intent://local/task/1378f3bd-90c1-4dcc-bbda-7b69b9123505)

- [x] [Build app state and event handling](intent://local/task/6de225f1-1978-4770-8164-ffca63f32abf)

- [x] [Build TUI rendering with Ratatui widgets](intent://local/task/49760bc2-1923-4f89-88c5-f2e12573f36b)

- [x] [Wire everything together in main and test end-to-end](intent://local/task/1120c558-dbb7-4b39-bf4f-58b836c9374e)

## Acceptance Criteria
- App compiles and runs with `cargo run -- owner/repo`
- Authenticates via `GITHUB_TOKEN` env var
- Lists issues with number, title, state, labels, author
- `j`/`k` or arrow keys navigate the list
- `Enter` opens issue detail with full body text
- `Esc` returns to list, `q` quits
- `o`/`c` filter by open/closed issues
- `r` refreshes the issue list
- Errors (missing token, network) display in the TUI instead of crashing

## Non-goals
- Creating, editing, or closing issues (read-only for v1)
- Comment viewing or posting
- Markdown rendering in terminal (plain text wrapping is sufficient)
- Pagination beyond first page (keep it simple for v1)

## Assumptions
- User has Rust toolchain installed (`cargo`, `rustc`)
- User has a GitHub personal access token available as `GITHUB_TOKEN`
- Target: macOS/Linux terminals with standard ANSI support

## Verification Plan
1. `cargo check` — compiles cleanly
2. `cargo build` — binary builds
3. `GITHUB_TOKEN=... cargo run -- ratatui/ratatui` — manual smoke test against a public repo
4. Verify navigation, filtering, detail view, quit all work

## Rollback Plan
All work is on the `tui-app` branch. Reset to `c1ec281` (initial commit) to revert.


- [x] [Fix verification findings](intent://local/task/1e6ea16b-9b01-4485-8805-0a9fd9c031ec)