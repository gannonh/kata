# Stargazer TUI

## What This Is

A Rust terminal application that displays your GitHub repositories sorted by star count. Built primarily as a learning vehicle for ratatui and TUI patterns, with GitHub data providing interesting content to display.

## Core Value

Learn ratatui patterns through building a real, functional TUI application.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Display user's public GitHub repos in a list, ordered by stars
- [ ] Navigate the list with keyboard (up/down, scroll)
- [ ] Show details panel for selected repo (description, language, last updated, star count)
- [ ] Open selected repo in browser via keybind
- [ ] Authenticate via gh CLI token (preferred) or PAT env var

### Out of Scope

- Private repos — requires more auth scopes, adds complexity without learning value
- Forked repos — keep focus on owned source repos
- Publishing to crates.io — learning project, not a product
- Complex filtering/search — keep UI simple to focus on TUI fundamentals
- Live refresh — one-time fetch is sufficient for learning

## Context

This is a learning project. The goal is building comfort with:
- ratatui widget system and layout
- Event handling and keyboard input
- State management in TUI applications
- Async API calls in Rust

The GitHub API is well-documented and has a simple auth story via `gh` CLI, making it a good data source for a learning project.

User has completed Rust tutorials and is ready for a real project to solidify understanding.

## Constraints

- **Tech stack**: Rust with ratatui — this is the point of the project
- **Scope**: Keep simple — learning trumps features
- **Auth**: Leverage existing `gh` CLI auth when available to minimize setup friction

## Key Decisions

| Decision                     | Rationale                                   | Outcome   |
| ---------------------------- | ------------------------------------------- | --------- |
| Use ratatui over tui-rs      | ratatui is the actively maintained fork     | — Pending |
| gh CLI token as primary auth | User likely already has gh installed/authed | — Pending |
| Public repos only            | Simpler auth, sufficient for learning       | — Pending |

---
*Last updated: 2026-01-25 after initialization*
