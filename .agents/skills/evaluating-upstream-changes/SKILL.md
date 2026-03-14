---
name: evaluating-upstream-changes
description: Evaluate changes from upstream sources (gsd-pi and pi-mono) for potential integration into kata-mono's CLI app. Use when the user mentions upstream changes, syncing from gsd-pi or pi-mono, checking what's new upstream, evaluating features to cherry-pick, comparing gsd-pi extensions with kata's, checking for pi-coding-agent updates, or asks "what's new in gsd/pi-mono". Also use when the user says "upstream eval", "sync check", "feature delta", "what should we pull in", or references /Volumes/EVO/kata/gsd-pi or /Volumes/EVO/kata/pi-mono in a change-evaluation context.
---

# Evaluating Upstream Changes

Evaluate changes from two upstream sources and produce actionable integration recommendations for kata-mono's CLI app (`apps/cli`).

## First: Create a task list

Before doing anything else, create a task list to track progress through this evaluation. Use TodoWrite (or TaskCreate if available) with these items:

1. Pull latest from upstream repos (git pull --ff-only)
2. Check marker for previous evaluation baseline
3. Run normalize.sh to create comparable snapshots
4. Run delta-report.sh to generate feature delta
5. Review delta report -- drill into diverged files to identify feature clusters
6. Present numbered pick-list of candidates to user
7. Ask user which items to create tickets for (e.g., "1,3,5,7" or "all")
8. Create Linear tickets for selected candidates (Kata CLI project, upstream label)
9. Set ticket dependencies (blockedBy)
10. Check pi-mono SDK version (local clone + npm registry)
11. Save evaluation marker (marker.sh write)
12. Archive delta report to .planning/upstream-evals/
13. Commit marker and report

Check off each step as you complete it. If the user scopes the evaluation to a subset (e.g., "just gsd-pi" or "just check for new commits"), skip irrelevant steps.

## Upstream Sources

| Source | Path | Relationship |
|--------|------|-------------|
| **gsd-pi** | `/Volumes/EVO/kata/gsd-pi` | Peer project wrapping pi-coding-agent. Has extensions, patterns, and workflows worth cherry-picking. |
| **pi-mono** | `/Volumes/EVO/kata/pi-mono` | Upstream SDK. The `@mariozechner/pi-coding-agent` package kata-mono depends on. Version bumps, new APIs, bug fixes. |

## Architecture Context

All three projects wrap `@mariozechner/pi-coding-agent`:

- **kata-mono** (`apps/cli`): `@kata-sh/cli`, extends pi-coding-agent with custom extensions in `src/resources/extensions/`
- **gsd-pi**: `gsd-pi` package, extends pi-coding-agent with 14+ extensions in `src/resources/extensions/gsd/`
- **pi-mono**: Source of truth for `pi-coding-agent`, `pi-ai`, `pi-tui`, `pi-agent-core`

Key structural differences:
- kata uses `~/.kata-cli/` config dir, gsd uses `~/.gsd/`
- kata names things `kata-*`, gsd names things `gsd-*`
- kata-mono nests the CLI under `apps/cli/`, gsd-pi is flat at root
- kata-mono is a Bun monorepo; gsd-pi is a standalone npm package
- kata was file-copied from gsd-pi (no shared git ancestry), so `git merge` / `git cherry-pick` don't work directly

## Tracking Between Evaluations

Evaluations are tracked with a marker file committed to the repo at `.planning/upstream-evals/LAST-EVAL.json`. This file records the HEAD commits of gsd-pi and pi-mono at the time of the last evaluation, so subsequent runs only look at new changes.

### PR naming convention

When creating PRs that integrate upstream changes, use this commit message prefix:

```
upstream(gsd-pi): <description>
upstream(pi-mono): <description>
```

Examples:
```
upstream(gsd-pi): port git-service extension
upstream(gsd-pi): adopt pipeline right-sizing pattern
upstream(pi-mono): bump pi-coding-agent to 0.58.0
```

Branch naming: `upstream/gsd-pi/<feature>` or `upstream/pi-mono/<version>`

The marker file should be committed as part of the integration PR so it's always in sync with what was actually merged.

### scripts/marker.sh -- Evaluation tracking

```bash
# Check when the last evaluation was and how many new commits exist
bash "$SKILL_DIR/scripts/marker.sh" read

# After completing an evaluation, save the marker
bash "$SKILL_DIR/scripts/marker.sh" write [eval-output-dir]

# Get git log ranges for changes since last evaluation
bash "$SKILL_DIR/scripts/marker.sh" range
```

The marker file is stored at `.planning/upstream-evals/LAST-EVAL.json` and contains:
```json
{
  "date": "2026-03-13T20:00:00Z",
  "gsd_pi": { "commit": "abc123", "version": "2.5.1" },
  "pi_mono": { "commit": "def456", "version": "0.57.1" },
  "kata_mono_head_at_eval": "789abc"
}
```

## Bundled Scripts

All scripts resolve relative to this skill's directory. Set `SKILL_DIR` before use:

```bash
SKILL_DIR="/Volumes/EVO/kata/kata-mono/.agents/skills/evaluating-upstream-changes"
```

### scripts/normalize.sh — Create comparable snapshots

Copies gsd-pi and kata CLI into a temp directory with naming and paths aligned so diffs are meaningful.

What it does:
1. Copies `src/`, `docs/`, `package.json` from both projects
2. Renames all gsd files/dirs to kata equivalents
3. Applies content-level sed transforms (env vars, config dirs, package names, slash commands)
4. Saves metadata (HEAD commits, versions, timestamps)

```bash
bash "$SKILL_DIR/scripts/normalize.sh" [output-dir]
# Default output: /tmp/upstream-eval-<timestamp>
```

Output structure:
```
/tmp/upstream-eval-<timestamp>/
├── normalized-gsd/     # gsd-pi with naming transformed to kata
├── normalized-kata/    # kata CLI as-is
└── eval-metadata.json  # commit SHAs, versions, timestamp
```

### scripts/delta-report.sh — Categorized feature delta

Reads normalized output and produces a structured markdown report.

```bash
bash "$SKILL_DIR/scripts/delta-report.sh" /tmp/upstream-eval-<timestamp>
```

Produces `DELTA-REPORT.md` with:
- Files only in gsd-pi (integration candidates)
- Files only in kata (kata-specific work)
- Diverged files (same name, different content, with diff-line counts)
- Identical files (no action needed)
- Extension comparison table

### scripts/transform-patch.sh — Convert gsd-pi commits to kata patches

Takes a gsd-pi commit or range, generates patches, transforms paths and names, then dry-runs `git apply --check` against kata-mono.

```bash
bash "$SKILL_DIR/scripts/transform-patch.sh" <commit-or-range> [output-dir]

# Examples:
bash "$SKILL_DIR/scripts/transform-patch.sh" abc123f
bash "$SKILL_DIR/scripts/transform-patch.sh" v2.4.0..v2.5.0
bash "$SKILL_DIR/scripts/transform-patch.sh" abc123f..def456g /tmp/my-patches
```

Transforms applied:
- Path mapping: `src/` -> `apps/cli/src/`, `docs/` -> `apps/cli/docs/`, etc.
- Name mapping: `gsd` -> `kata`, `GSD` -> `KATA`, `.gsd/` -> `.kata-cli/`
- Env vars: `GSD_CODING_AGENT_DIR` -> `KATA_CODING_AGENT_DIR`, etc.
- Extension paths: `extensions/gsd/` -> `extensions/kata/`

Output:
```
/tmp/kata-patches-<timestamp>/
├── raw/            # original gsd-pi patches
├── transformed/    # patches with kata naming/paths
└── apply-results.txt  # which patches apply cleanly vs need manual work
```

For patches that apply cleanly:
```bash
git -C /Volumes/EVO/kata/kata-mono apply <transformed-patch>
```

For patches that fail, try `--3way` for conflict markers, or port manually.

## Workflow

### Phase 0: Pull latest

Before any evaluation, pull the latest from both upstream repos so the comparison reflects current state:

```bash
git -C /Volumes/EVO/kata/gsd-pi pull --ff-only 2>/dev/null || echo "gsd-pi: pull failed or not on tracking branch"
git -C /Volumes/EVO/kata/pi-mono pull --ff-only 2>/dev/null || echo "pi-mono: pull failed or not on tracking branch"
```

Use `--ff-only` to avoid creating merge commits in repos we don't own. If the pull fails (detached HEAD, no remote, etc.), proceed with the local state and note it in the report.

### Phase 1: Assessment

Start by checking the marker to see if there's a previous evaluation:

```bash
bash "$SKILL_DIR/scripts/marker.sh" read
```

If a previous evaluation exists, use the range command to scope the work:
```bash
bash "$SKILL_DIR/scripts/marker.sh" range
```
Then pass that range to `transform-patch.sh` for targeted evaluation of just the new commits.

For a first evaluation (or a full re-baseline), use normalize + delta-report:

```bash
# 1. Create normalized snapshots
bash "$SKILL_DIR/scripts/normalize.sh"

# 2. Generate delta report
bash "$SKILL_DIR/scripts/delta-report.sh" /tmp/upstream-eval-<timestamp>

# 3. Read the report
cat /tmp/upstream-eval-<timestamp>/DELTA-REPORT.md
```

Present the delta report to the user. Focus on:
- The extension comparison table (most portable features live here)
- Files only in gsd-pi with high line counts (substantial features)
- Diverged files with low diff-line counts (easy to reconcile)

### Phase 2: Selection

Present the findings as a numbered pick-list so the user can select which items to create tickets for. Group related files into logical features and assign each an ID.

Format the list like this:

```
## Integration Candidates

### New extensions (gsd-pi has, kata doesn't)
  [1] git-service — programmatic git ops (1 file + tests) — High value, blocks #3 and #4
  [2] google-search — Gemini-powered search (2 files) — Low value, kata has search-the-web
  [3] worktree-manager — parallel slice development (2 files + tests) — Medium, depends on #1
  [4] remote-questions — Slack/Discord for headless mode (9 files) — Low
  ...

### Feature expansions (gsd-pi expanded shared extensions)
  [5] search-the-web: tavily + native search + provider abstraction (4 new + 3 diverged files)
  [6] subagent: expanded dispatch modes (1 diverged file, 2149 diff lines)
  ...

### Diverged core files (shared files with improvements worth reviewing)
  [7] auto.ts feature clusters: idempotent dispatch, step mode, merge guards, crash recovery
  [8] Small deltas: doctor.ts (85 lines), crash-recovery.ts (20 lines), types.ts (38 lines)
  ...

### pi-mono SDK
  [9] pi-coding-agent version bump: ^0.57.1 -> check npm for latest published version
```

After presenting, ask: **"Which items do you want me to create tickets for? (e.g., 1,3,5,7 or 'all')"**

For each selected item, assess:
1. **Effort**: standalone file copy vs diverged manual merge
2. **Dependencies**: does it require another item first?
3. **Priority**: High (core infra, blocks others), Medium (valuable UX/reliability), Low (nice-to-have)

Then create Linear tickets per the template in the Linear Integration section.

### Phase 3: Integration

For selected features, use transform-patch to generate kata-ready patches.

If the feature spans multiple gsd-pi commits, identify the commit range:
```bash
git -C /Volumes/EVO/kata/gsd-pi log --oneline --all -- <relevant-files>
```

Then transform:
```bash
bash "$SKILL_DIR/scripts/transform-patch.sh" <first-commit>..<last-commit>
```

Review the apply results. For patches that apply cleanly, apply them. For patches that fail, read the transformed patch and the target file side by side and port manually.

After applying, run kata's tests:
```bash
cd /Volumes/EVO/kata/kata-mono/apps/cli && npm test
```

### Phase 4: pi-mono SDK evaluation

Separate from gsd-pi. Check if kata should bump its pi-coding-agent version. Compare three sources: kata's pin, the local pi-mono clone, and the npm registry.

```bash
# Current pin
grep "pi-coding-agent" /Volumes/EVO/kata/kata-mono/apps/cli/package.json

# Local pi-mono clone version
grep '"version"' /Volumes/EVO/kata/pi-mono/packages/coding-agent/package.json

# Latest published on npm
npm view @mariozechner/pi-coding-agent version 2>/dev/null || echo "npm check failed"

# Changes since kata's version (local clone)
git -C /Volumes/EVO/kata/pi-mono log --oneline v<kata-version>..HEAD -- packages/coding-agent/
```

Report all three versions. If npm has a newer published version than the local clone, note that the local clone may need a `git pull`. If there are changes worth pulling in, update the version in `apps/cli/package.json` and test.

### Phase 5: Record

Save the marker so the next evaluation picks up where this one left off:

```bash
# Save marker (uses eval metadata if dir provided, otherwise reads current HEADs)
bash "$SKILL_DIR/scripts/marker.sh" write /tmp/upstream-eval-<timestamp>

# Also save the delta report for reference
mkdir -p /Volumes/EVO/kata/kata-mono/.planning/upstream-evals
cp /tmp/upstream-eval-<timestamp>/DELTA-REPORT.md \
   /Volumes/EVO/kata/kata-mono/.planning/upstream-evals/$(date +%Y-%m-%d)-delta-report.md
```

Commit both `LAST-EVAL.json` and the delta report as part of the integration PR (or as a standalone evaluation commit if no integration is done this cycle):

```bash
git add .planning/upstream-evals/
git commit -m "upstream(eval): evaluate gsd-pi@<version> and pi-mono@<version>"
```

## Translation Reference

| gsd-pi | kata-mono |
|--------|-----------|
| `gsd-*` names | `kata-*` names |
| `~/.gsd/` | `~/.kata-cli/` |
| `GSD_*` env vars | `KATA_*` env vars |
| `src/resources/extensions/gsd/` | `apps/cli/src/resources/extensions/kata/` |
| `/gsd` slash commands | `/kata` slash commands |
| `.gsd/` project dir | `.kata-cli/` or equivalent |
| `gsd-pi` npm package | `@kata-sh/cli` npm package |
| `GSD_CODING_AGENT_DIR` | `KATA_CODING_AGENT_DIR` |
| `GSD_WORKFLOW_PATH` | `KATA_WORKFLOW_PATH` |
| `PI_PACKAGE_DIR` points to `pkg/` | Same pattern, different paths |
| `src/` (root) | `apps/cli/src/` |
| `docs/` (root) | `apps/cli/docs/` |
| `package.json` (root) | `apps/cli/package.json` |

## What NOT to Port

- gsd-pi's branding, marketing copy, README content
- Features kata already implements differently (compare before porting)
- gsd-pi's patch-package patches (evaluate if kata needs the same fix independently)
- gsd-pi's test infrastructure (kata uses Bun's test runner, gsd uses Node's)
- Chore/auto-commit noise (filter with `--grep` to skip these)

## Linear Integration

After identifying integration candidates, create Linear tickets to track the work. Use the Linear MCP tools.

### Linear identifiers

| Field | Value |
|-------|-------|
| Team | `Kata-sh` |
| Project | `Kata CLI` |
| Label | `upstream` (ID: `90005426-9942-444f-97f4-13d76ad2328f`) |

### Issue title convention

```
upstream(<source>): <action> <feature>
```

Where `<source>` is `gsd-pi` or `pi-mono`, and `<action>` is typically `port`, `bump`, `reconcile`, or `adopt`.

Examples:
- `upstream(gsd-pi): port git-service extension`
- `upstream(gsd-pi): reconcile diverged core files`
- `upstream(pi-mono): bump pi-coding-agent to 0.58.0`

### Issue template

Every upstream integration ticket should follow this structure:

```markdown
## Context

One-paragraph description of what the upstream project added and why it matters to kata.

## Source

- Repo: `/Volumes/EVO/kata/gsd-pi` or `/Volumes/EVO/kata/pi-mono`
- Files: list source files in the upstream repo
- Tests: list test files if they exist
- Upstream milestone/PR: reference if known (e.g., "gsd-pi M001/S05")

## What to port

Numbered list of specific functions, files, or changes to bring over.
Include integration points (where the new code hooks into existing code).

## Dependencies

List any other upstream tickets that must be completed first.
Reference by ticket ID (e.g., "Depends on KAT-343 (git-service)").

## Adaptation notes

- Path and naming transforms needed (handled by transform-patch.sh for clean copies)
- Whether files are standalone (clean copy) or diverged (manual merge)
- New dependencies kata would need to add (e.g., `@clack/prompts`)
- Test infrastructure differences (kata uses Bun, gsd uses Node)
```

### Priority guidelines

| Priority | Criteria |
|----------|----------|
| **High (2)** | Core infrastructure other features depend on, or fixes to issues kata actively hits |
| **Medium (3)** | Valuable features that improve UX or reliability but aren't blocking |
| **Low (4)** | Nice-to-have, small additions, or features kata may not need yet |

### Setting dependencies

When one upstream port depends on another, use the `blockedBy` field:

```
blockedBy: ["KAT-XXX"]
```

Common dependency patterns:
- git-service (KAT-343) blocks merge guards (KAT-341) and worktree management (KAT-344)
- Standalone extensions (remote-questions, google-search, voice, mcporter) have no upstream dependencies
- Diverged file reconciliation should happen after the features that modified those files are ported

### Creating tickets from evaluation results

After Phase 2 (Selection), create tickets for all non-skip candidates:

1. Group related changes into single tickets (e.g., all search-the-web expansions in one ticket)
2. Always set `team: "Kata-sh"`, `project: "Kata CLI"`, `labels: ["upstream"]`
3. Set `blockedBy` for any ticket that depends on another upstream port
4. Use priority guidelines above to assign priority
5. For standalone new files, note "clean copy with naming transforms" in adaptation notes
6. For diverged files, note the diff line count and whether manual merge is needed
