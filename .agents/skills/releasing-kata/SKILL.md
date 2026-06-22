---
name: releasing-kata
description: Use this skill when releasing Kata CLI, Symphony, or the Pi Symphony extension, bumping versions, updating changelogs, or creating release PRs. Triggers include "release", "bump version", "publish", "create release PR", "ship it", "cut a release".
---

# Releasing Kata

Kata has three active independently versioned release targets. Ask which target if not clear from context.

| Target                    | Package                         | Tag Format              | Reference                                      |
| ------------------------- | ------------------------------- | ----------------------- | ---------------------------------------------- |
| **CLI**                   | `@kata-sh/cli`                  | `cli-vX.Y.Z`            | `references/cli-release.md`                    |
| **Symphony**              | `symphony` (Rust binary)        | `symphony-vX.Y.Z`       | `references/symphony-release.md`               |
| **Pi Symphony Extension** | `@kata-sh/pi-symphony-extension` | `pi-symphony-vX.Y.Z`    | `references/pi-symphony-extension-release.md`  |

Root `package.json` version is `0.0.0` — never touch it. The root may contain Pi package manifest metadata for monorepo git installs, but it is not the version source for any release. Each app or package owns its own version. Versions are independent and do not need to match.

## Version semantics

| Type    | When                              | Example        |
| ------- | --------------------------------- | -------------- |
| `patch` | Bug fixes, small improvements     | 0.4.9 → 0.4.10 |
| `minor` | New features, backward compatible | 0.4.9 → 0.5.0  |
| `major` | Breaking changes                  | 0.4.9 → 1.0.0  |

## Workflow

Once the target is identified, read the corresponding reference file for the full release steps, CI behavior, and acceptance criteria. Then follow it.

## Troubleshooting

For build failures and CI issues, read `release-troubleshooting.md`.

Quick checks:

- **CI didn't trigger**: Version in `package.json` (or `Cargo.toml` for Symphony) must differ from existing git tags
- **CLI publish fails**: Ensure `NPM_TOKEN` secret is set and `private: false` in `apps/cli/package.json`
- **Symphony CI didn't trigger**: Changes must be under `apps/symphony/**`; version in `Cargo.toml` must differ from existing `symphony-v*` tags
- **Symphony build fails**: Ensure Rust toolchain is installed; check `cargo build --release` locally first
- **Pi Symphony extension release didn't trigger**: Changes must be under `apps/symphony/pi-extension/**`; version in `apps/symphony/pi-extension/package.json` must differ from existing `pi-symphony-v*` tags and npm versions
- **Pi Symphony extension npm publish fails**: Ensure `NPM_TOKEN` secret is set, package is `private: false`, and runtime dependencies are in `dependencies`
- **Pi Symphony extension git install fails**: Ensure root `package.json` has a `pi` manifest pointing at the extension and root runtime deps include extension runtime deps such as `ws`
