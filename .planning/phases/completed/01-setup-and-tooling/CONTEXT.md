# Phase 1: Setup and Tooling — Context

## Upstream Management Strategy

### Branch Structure
```
main ─────────────────────────────→ (Kata releases, PRs merged here)
          ↑
feature/upstream-xyz ─────────────→ (cherry-picks from sync, PR to main)

upstream/sync ────────────────────→ (mirrors upstream/main, read-only)
```

### Remote Configuration
- Add upstream remote: `git remote add upstream https://github.com/AiCodecraft/craft-agents.git`
- `upstream/sync` branch tracks upstream's main
- Never push to upstream — fetch-only

### Adoption Process
1. Monthly review of upstream commits
2. Evaluate each commit against adoption criteria
3. Create `feature/upstream-[description]` from `main`
4. Cherry-pick relevant commits into feature branch
5. Open PR to `main` — standard review process
6. CI validates, merge to main

### Adoption Criteria
| Change Type | Policy |
|-------------|--------|
| Bug fixes | Adopt readily |
| SDK updates | Evaluate carefully, test before adopting |
| New features | Case-by-case, evaluate fit with Kata direction |
| Refactors | Generally skip (adds merge complexity without user value) |

---

## CI Workflow Configuration

### Triggers
| Event | Action |
|-------|--------|
| Pull requests | Validate build, run tests, produce macOS artifact |
| Push to main | Full build matrix (macOS, Windows, Linux) |
| Tags (v*) | Full release build with all platforms |

### Platform Strategy
- **PRs:** macOS only (fast feedback)
- **Main/Tags:** Full matrix (macOS, Windows, Linux)

### Artifact Retention
- 7 days for all build artifacts
- Release assets (tagged builds) persist indefinitely in GitHub Releases

---

## Decisions Locked

1. Integration branch pattern with `upstream/sync`
2. Cherry-pick to feature branches, never direct to main
3. Monthly upstream review cadence
4. Tiered platform builds (macOS primary)
5. 7-day artifact retention

---
*Created: 2026-01-29*
