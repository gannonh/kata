# Kata CLI Manual Validation Runbook (Pi + GitHub Projects v2)

Date: `2026-04-27`
Owner: Kata CLI migration stabilization

## Goal

Validate the golden path end to end:

1. Pi harness setup via `setup --pi`
2. Health validation via `doctor`
3. Skill discovery and one core skill invocation
4. Backend read/write validation through the typed JSON runtime contract

## Prerequisites

- Node 20+
- `pnpm`
- Pi coding agent available (`pi` command or `npx @mariozechner/pi-coding-agent`)
- GitHub token with access to the target repo/project

## Test Environment

```bash
export KATA_REPO=/Users/gannonhall/.codex/worktrees/edf7/kata-mono
export KATA_TMP="$(mktemp -d)"
export PI_AGENT_DIR="$KATA_TMP/pi-agent"
export TEST_WORKSPACE="$KATA_TMP/workspace"
export KATA_SKILLS_SOURCE_DIR="$KATA_REPO/apps/orchestrator/dist/skills"
export GITHUB_TOKEN="<token-with-project-access>"
mkdir -p "$TEST_WORKSPACE/.kata"
```

Build required artifacts:

```bash
pnpm --dir "$KATA_REPO/apps/orchestrator" run build:skills
pnpm --dir "$KATA_REPO/apps/cli" run build
```

## 1) Configure GitHub backend (Projects v2 only)

Create `"$TEST_WORKSPACE/.kata/preferences.md"`:

```yaml
---
workflow:
  mode: github
github:
  repoOwner: <owner>
  repoName: <repo>
  stateMode: projects_v2
  githubProjectNumber: <project-number>
---
```

Expected:
- `stateMode: projects_v2` is accepted
- no label-mode fallback is used

## 2) Run setup + doctor

```bash
PI_CODING_AGENT_DIR="$PI_AGENT_DIR" \
KATA_CLI_SKILLS_SOURCE_DIR="$KATA_SKILLS_SOURCE_DIR" \
node "$KATA_REPO/apps/cli/dist/loader.js" setup --pi
```

Expected:
- JSON output with `"ok": true` and `"mode": "pi-install"`
- files exist:
  - `"$PI_AGENT_DIR/skills/"`
  - `"$PI_AGENT_DIR/settings.json"`
  - `"$PI_AGENT_DIR/kata-setup-manifest.json"`

Run doctor:

```bash
cd "$TEST_WORKSPACE"
PI_CODING_AGENT_DIR="$PI_AGENT_DIR" \
KATA_CLI_SKILLS_SOURCE_DIR="$KATA_SKILLS_SOURCE_DIR" \
node "$KATA_REPO/apps/cli/dist/loader.js" doctor
```

Expected:
- `summary` shows `kata doctor ok (pi)` (or at minimum no `invalid` checks)
- checks include `cli-binary`, `skills-source`, `pi-skills-dir`, `pi-settings`, `backend-config`

## 3) Verify skill discovery and invoke one core skill

Quick discovery check:

```bash
ls "$PI_AGENT_DIR/skills" | rg "kata-(plan-phase|execute-phase|progress|health)"
```

Expected:
- core skill directories are present

Interactive invocation (manual):

```bash
cd "$TEST_WORKSPACE"
PI_CODING_AGENT_DIR="$PI_AGENT_DIR" pi
```

At the Pi prompt, run:

```text
/skill:kata-health
```

Expected:
- skill loads successfully
- output references the canonical workflow source and uses CLI contract guidance

## 4) Validate backend read/write via JSON runtime contract

Read check (`project.getContext`):

```bash
cat > "$KATA_TMP/project-context.json" <<'JSON'
{
  "operation": "project.getContext",
  "payload": {}
}
JSON

cd "$TEST_WORKSPACE"
node "$KATA_REPO/apps/cli/dist/loader.js" json "$KATA_TMP/project-context.json"
```

Expected:
- JSON `{ "ok": true, "data": { "backend": "github", ... } }`

Write check (`artifact.write`) and read-back:

```bash
cat > "$KATA_TMP/write-artifact.json" <<'JSON'
{
  "operation": "artifact.write",
  "payload": {
    "scopeType": "project",
    "scopeId": "PROJECT",
    "artifactType": "roadmap",
    "title": "PROJECT-ROADMAP",
    "content": "Manual golden-path validation marker",
    "format": "markdown"
  }
}
JSON

cat > "$KATA_TMP/read-artifact.json" <<'JSON'
{
  "operation": "artifact.read",
  "payload": {
    "scopeType": "project",
    "scopeId": "PROJECT",
    "artifactType": "roadmap"
  }
}
JSON

node "$KATA_REPO/apps/cli/dist/loader.js" json "$KATA_TMP/write-artifact.json"
node "$KATA_REPO/apps/cli/dist/loader.js" json "$KATA_TMP/read-artifact.json"
```

Expected:
- both calls return `"ok": true`
- read-back content includes `Manual golden-path validation marker`

## Cleanup

```bash
rm -rf "$KATA_TMP"
```

## Evidence (2026-04-27)

Automated evidence captured in this branch:

1. `pnpm --dir apps/cli exec vitest run src/tests/golden-path.pi-github.vitest.test.ts`
Result: `1 passed`
2. `pnpm --dir apps/cli run test:vitest -- golden-path`
Result: `45 passed`
3. `bash scripts/ci/build-kata-distributions.sh`
Result: passed; artifact checks + golden-path smoke gate succeeded
4. `pnpm --dir apps/desktop run test`
Result: `61 files, 680 tests passed`
5. `pnpm run validate:affected`
Result: passed (`11 successful, 11 total`)

Desktop integration evidence (direct Pi RPC path) from source inspection:

1. Desktop bridge spawns Pi directly with `--mode rpc` in [apps/desktop/src/main/pi-agent-bridge.ts](/Users/gannonhall/.codex/worktrees/edf7/kata-mono/apps/desktop/src/main/pi-agent-bridge.ts:221)
2. Desktop board client calls the shared typed domain API (`project`, `milestone`, `slice`, `task`, `execution`) in [apps/desktop/src/main/kata-backend-client.ts](/Users/gannonhall/.codex/worktrees/edf7/kata-mono/apps/desktop/src/main/kata-backend-client.ts:17)

## Pass Criteria

- setup succeeds with Pi install metadata and settings
- doctor reports no invalid checks for the prepared environment
- one core skill can be discovered and invoked in Pi
- JSON runtime read and write operations succeed against GitHub Projects v2 backend
