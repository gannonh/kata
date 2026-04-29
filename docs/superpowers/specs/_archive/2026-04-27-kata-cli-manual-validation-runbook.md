# Kata CLI Manual Validation Runbook (Two-Phase)

Date: `2026-04-27`  
Owner: Kata CLI migration stabilization

## Goal

Validate the new `@kata-sh/cli` + Skills model in two passes:

1. Monorepo validation (use this repo itself as the project)
2. UAT validation (separate todo-app repo on GitHub)

This runbook is intentionally manual and pragmatic so we can quickly confirm what works, what does not, and what to spec next.

## Scope and Constraints

- Pi remains the harness for this validation.
- GitHub backend is **Projects v2 only**.
- Setup uses one skills source policy:
  - Local monorepo/dev: `apps/orchestrator/dist/skills`
  - Packaged CLI usage: bundled skills shipped with the CLI package

## Prerequisites

- Node 20+
- `pnpm`
- Pi coding agent installed and runnable via `pi`
- GitHub token in environment:

```bash
export GITHUB_TOKEN="<token-with-repo-and-project-access>"
```

## One-Time Build (from monorepo root)

Run from:

`/Users/gannonhall/.codex/worktrees/edf7/kata-mono`

```bash
pnpm --dir apps/orchestrator run build:skills
pnpm --dir apps/cli run build
```

## Phase 1: Monorepo as Project Under Test

### 1) Install Kata skills into Pi (no extra directory env vars)

```bash
node apps/cli/dist/loader.js setup --pi
```

Expected:

- JSON output with `"ok": true`
- `mode` should be `"pi-install"`
- Pi agent integration files exist under `~/.pi/agent`:
  - `~/.pi/agent/skills/`
  - `~/.pi/agent/settings.json`
  - `~/.pi/agent/kata-setup-manifest.json`

### 2) Configure backend for this repo

Create or update:

`/Users/gannonhall/.codex/worktrees/edf7/kata-mono/.kata/preferences.md`

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

### 3) Run doctor in the monorepo

```bash
node apps/cli/dist/loader.js doctor
```

Expected:

- `summary` includes `kata doctor ok` (or at worst `warn`, but not `invalid`)
- `backend-config` parses as GitHub `projects_v2`
- `skills-source` resolves successfully

### 4) Validate skills are installed and invokable in Pi

```bash
ls ~/.pi/agent/skills | rg "^kata-"
```

Start Pi from monorepo root:

```bash
pi
```

Manual skill checks in Pi (run each as a separate prompt/command):

```text
/skill:kata-health
/skill:kata-progress
/skill:kata-plan-phase
/skill:kata-execute-phase
```

Expected:

- Skills resolve and run
- Prompts align to the new skill workflow shape (not legacy extension behavior)

### 5) Validate JSON runtime contract in monorepo

Create request:

```bash
cat > /tmp/kata-project-context.json <<'JSON'
{
  "operation": "project.getContext",
  "payload": {}
}
JSON
```

Run:

```bash
node apps/cli/dist/loader.js json /tmp/kata-project-context.json
```

Expected:

- Response contains `"ok": true`
- Backend resolves as GitHub

Write + read-back artifact:

```bash
cat > /tmp/kata-write-roadmap.json <<'JSON'
{
  "operation": "artifact.write",
  "payload": {
    "scopeType": "project",
    "scopeId": "PROJECT",
    "artifactType": "roadmap",
    "title": "PROJECT-ROADMAP",
    "content": "Phase1 monorepo validation marker",
    "format": "markdown"
  }
}
JSON

cat > /tmp/kata-read-roadmap.json <<'JSON'
{
  "operation": "artifact.read",
  "payload": {
    "scopeType": "project",
    "scopeId": "PROJECT",
    "artifactType": "roadmap"
  }
}
JSON

node apps/cli/dist/loader.js json /tmp/kata-write-roadmap.json
node apps/cli/dist/loader.js json /tmp/kata-read-roadmap.json
```

Expected:

- Both return `"ok": true`
- Read-back includes `Phase1 monorepo validation marker`

## Phase 2: Separate UAT Todo App Repo

Purpose: validate real usage on a non-monorepo project with its own GitHub repo.

### 1) Create local UAT repo

```bash
mkdir -p ~/kata-cli-uat-todo
cd ~/kata-cli-uat-todo
pnpm create vite@latest . --template react-ts
pnpm install
git init
git add .
git commit -m "chore: initialize uat todo app"
```

### 2) Create GitHub repo and push

```bash
gh repo create kata-cli-uat-todo --private --source=. --remote=origin --push
```

### 3) Add `.kata/preferences.md` in UAT repo (Projects v2 only)

`~/kata-cli-uat-todo/.kata/preferences.md`

```yaml
---
workflow:
  mode: github
github:
  repoOwner: <owner>
  repoName: kata-cli-uat-todo
  stateMode: projects_v2
  githubProjectNumber: <project-number>
---
```

### 4) Validate CLI from UAT repo

From UAT repo, run the monorepo-built CLI directly:

```bash
node /Users/gannonhall/.codex/worktrees/edf7/kata-mono/apps/cli/dist/loader.js doctor
```

Then run JSON contract checks:

```bash
cat > /tmp/kata-uat-project-context.json <<'JSON'
{
  "operation": "project.getContext",
  "payload": {}
}
JSON

node /Users/gannonhall/.codex/worktrees/edf7/kata-mono/apps/cli/dist/loader.js json /tmp/kata-uat-project-context.json
```

Expected:

- Doctor does not report `invalid`
- Context request returns `"ok": true`

### 5) Validate skills workflows in Pi against UAT repo

Open Pi from UAT repo:

```bash
cd ~/kata-cli-uat-todo
pi
```

Run a workflow slice manually:

```text
/skill:kata-new-project
/skill:kata-plan-phase
/skill:kata-progress
/skill:kata-verify-work
```

Expected:

- Skills execute cleanly in a fresh non-monorepo repository
- Skill instructions and CLI backend behavior stay consistent with Phase 1

## Test Log Template (fill during execution)

For each step, capture:

- Command/prompt
- Result (`pass` / `fail`)
- Evidence (stdout snippet, screenshot, issue link)
- Follow-up (if fail: bug ticket + owner)

## Pass Criteria

- Phase 1 completes without `invalid` health state and confirms working skills + JSON contract.
- Phase 2 completes in independent todo-app repo with the same core behavior.
- Issues discovered are documented with concrete reproduction steps.
