---
name: releasing-kata
description: Use this skill when releasing Kata Desktop, Kata CLI, Kata Orchestrator, Kata Context, or Symphony, bumping versions, updating changelogs, or creating release PRs. Triggers include "release", "bump version", "publish", "create release PR", "ship it", "cut a release".
---

# Releasing Kata

Kata has five independently versioned release targets. Ask which target if not clear from context.

| Target           | Package                  | Tag Format        | Reference                        |
| ---------------- | ------------------------ | ----------------- | -------------------------------- |
| **Desktop**      | `@kata-sh/desktop`       | `desktop-vX.Y.Z`  | `references/desktop-release.md`  |
| **CLI**          | `@kata-sh/cli`           | `cli-vX.Y.Z`      | `references/cli-release.md`      |
| **Orchestrator** | `@kata-sh/orc`           | `orc-vX.Y.Z`      | `references/orc-release.md`      |
| **Context**      | `@kata/context`          | `context-vX.Y.Z`  | `references/context-release.md`  |
| **Symphony**     | `symphony` (Rust binary) | `symphony-vX.Y.Z` | `references/symphony-release.md` |

Root `package.json` version is `0.0.0` — never touch it. Each app owns its own version. Versions are independent and do not need to match.

## Version semantics

| Type    | When                              | Example        |
| ------- | --------------------------------- | -------------- |
| `patch` | Bug fixes, small improvements     | 0.4.9 → 0.4.10 |
| `minor` | New features, backward compatible | 0.4.9 → 0.5.0  |
| `major` | Breaking changes                  | 0.4.9 → 1.0.0  |

## Workflow

Once the target is identified, read the corresponding reference file for the full release steps, CI behavior, and acceptance criteria. Then follow it.

## Troubleshooting

For build failures, code signing, notarization, and CI issues, read `release-troubleshooting.md`.

Quick checks:

- **CI didn't trigger**: Version in `package.json` must differ from existing git tags
- **Desktop CI fails**: `gh run list --workflow=desktop-release.yml --limit 3`
- **CLI publish fails**: Ensure `NPM_TOKEN` secret is set and `private: false` in `apps/cli/package.json`
- **Orchestrator CI didn't trigger**: Changes must be under `apps/orchestrator/**`; version must differ from existing `orc-v*` tags
- **Orchestrator publish fails**: Ensure `NPM_TOKEN` secret is set; check `apps/orchestrator/package.json` has no `private: true`
- **macOS notarization fails**: Verify `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` secrets
