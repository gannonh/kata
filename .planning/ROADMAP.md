# Roadmap: Kata Agents

## Overview

Native desktop client for the Kata ecosystem with integrated git context. Building v0.7.0 Always-On Assistant to add background daemon, communication channel adapters, and a first-party plugin system.

## Milestones

- ✅ **v0.4.0 Foundation** — Phases 1-2 (shipped 2026-01-30)
- ✅ **v0.6.0 Git Integration** — Phases 3-7 (shipped 2026-02-04)
- ✅ **v0.6.1 Testing Infrastructure** — Phases 8-9 (shipped 2026-02-05)
- 🔄 **v0.7.0 Always-On Assistant** — Phases 10-19 (in progress)

## Current Milestone: v0.7.0 Always-On Assistant

**Goal:** Run a background daemon that monitors Slack and WhatsApp channels, routes inbound messages to agent sessions, and exposes channel conversations in the desktop UI alongside direct chat sessions.

- [x] Phase 10: Foundation Types and Permission Mode (2/2 plans) — completed 2026-02-07
- [x] Phase 11: Daemon Core and SQLite Queue (2/2 plans) — completed 2026-02-07
- [x] Phase 12: Channel Adapters (3/3 plans) — completed 2026-02-08
- [x] Phase 13: Plugin Lifecycle and Task Scheduler (3/3 plans) — completed 2026-02-08
- [x] Phase 14: UI Integration (2/2 plans) — completed 2026-02-09
- [x] Phase 15: Channel Credentials and Session Attribution (2/2 plans) — completed 2026-02-10
- [x] Phase 16: Channel Creation UI and Config Delivery (2/2 plans) — completed 2026-02-10
- [x] Phase 17: End-to-End Message Processing (4/4 plans) — completed 2026-02-12
- [x] Phase 18: Channel Fit and Finish (3/3 plans) — completed 2026-02-13
- [x] Phase 19: Tech Debt Cleanup (1/1 plans) — completed 2026-02-15

## Completed Milestones

<details>
<summary>✅ v0.6.1 Testing Infrastructure (Phases 8-9) — SHIPPED 2026-02-05</summary>

**Goal:** Establish baseline test coverage and live E2E testing capabilities with real credentials.

- [x] Phase 8: Live E2E Test Suite (3 plans) — completed 2026-02-04
- [x] Phase 9: Unit Test Coverage (3 plans) — completed 2026-02-05

[Full archive](milestones/v0.6.1-ROADMAP.md)

</details>

<details>
<summary>✅ v0.6.0 Git Integration (Phases 3-7) — SHIPPED 2026-02-04</summary>

**Goal:** Show developers their git context (branch, PR) in the workspace UI while working with the agent.

- [x] Phase 3: Core Git Service (4 plans) — completed 2026-02-02
- [x] Phase 4: PR Integration (2 plans) — completed 2026-02-02
- [x] Phase 5: Real-Time Updates (4 plans) — completed 2026-02-03
- [x] Phase 6: AI Context Injection (1 plan) — completed 2026-02-03
- [x] Phase 7: Polish and Edge Cases (3 plans) — completed 2026-02-04

[Full archive](milestones/v0.6.0-ROADMAP.md)

</details>

<details>
<summary>✅ v0.4.0 Foundation (Phases 1-2) — SHIPPED 2026-01-30</summary>

**Goal:** Rebrand from Craft Agents to Kata Agents with CI/CD infrastructure and trademark compliance.

- [x] Phase 1: Kata Branding (3 plans) — completed 2026-01-29
- [x] Phase 2: CI/CD Infrastructure (3 plans) — completed 2026-01-30

[Full archive](milestones/v0.4.0-ROADMAP.md)

</details>

---

## Progress Summary

| Milestone                     | Phases | Plans | Status      | Shipped    |
| ----------------------------- | ------ | ----- | ----------- | ---------- |
| v0.4.0 Foundation             | 2      | 6     | Shipped     | 2026-01-30 |
| v0.6.0 Git Integration        | 5      | 14    | Shipped     | 2026-02-04 |
| v0.6.1 Testing Infrastructure | 2      | 6     | Shipped     | 2026-02-05 |
| v0.7.0 Always-On Assistant    | 10     | 24    | In Progress | —          |

---
*Last updated: 2026-02-15 — Phase 19 completed (tech debt cleanup)*
