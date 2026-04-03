---
name: kata-desktop-uat
description: Run user acceptance testing for Kata Desktop, the Electron app at apps/desktop. Covers launching the app with CDP, connecting agent-browser, walking through UI flows, capturing screenshots, and writing structured UAT reports. Use this skill whenever the user mentions "UAT", "acceptance test", "validate the desktop app", "test the electron app", "walk through the app", "dogfood desktop", "screenshot the app", "verify the milestone", or any request to visually inspect or interactively test Kata Desktop. Also use when finishing a milestone or slice that includes Kata Desktop UI work, or when creating a UAT report for a PR.
---

# Kata Desktop UAT

This skill automates user acceptance testing for **Kata Desktop** — the Electron app at `apps/desktop/`. It uses `agent-browser` connected via Chrome DevTools Protocol to the running Electron process. This is the only reliable way to interact with the app from an agent session.

## Why This Skill Exists

Kata Desktop's renderer depends on `window.api` — an Electron preload bridge that exposes IPC methods. Opening `http://127.0.0.1:5174` in a standalone browser (Playwright, Chrome, etc.) crashes every component that touches IPC. You **must** connect to the actual Electron process via CDP.

The sibling skills `.agents/skills/agent-browser/SKILL.md` and `.agents/skills/electron/SKILL.md` document the general tools. This skill documents how to apply them specifically to Kata Desktop, including launch commands, target selection, known gotchas, and the UAT reporting format.

## Full UAT Sequence

The complete UAT process for a milestone:

1. **Branch** — create a UAT branch from main
2. **Launch** — start the renderer and Electron with CDP
3. **Connect** — attach agent-browser to the Electron window
4. **Test** — walk through acceptance criteria, capture screenshots
5. **Report** — write the UAT doc with pass/fail evidence
6. **Human handoff** — provide the user with manual run instructions
7. **PR + Linear** — while the user tests, create a PR and Linear tickets

## Setup

### Step 0: Create a UAT Branch

Before starting, create a dedicated branch for the UAT artifacts. Branch from the current state (usually `main` after the milestone merged).

```bash
git checkout main && git pull
git checkout -b desktop/uat/<milestone>
# Example: desktop/uat/M001
```

All UAT artifacts (screenshots, report, test fixes) are committed to this branch.

### Step 1: Start the Vite Renderer

The renderer dev server must be running first. It serves the React app that Electron loads.

```bash
cd apps/desktop
bun run build:main && bun run build:preload
```

Then start the renderer in the background:

```bash
bg_shell start "cd apps/desktop && bun run dev:renderer" \
  --label desktop-renderer --type server --ready-port 5174
```

Wait for port 5174 to be ready before proceeding.

### Step 2: Launch Electron with CDP

Launch Electron separately with `--remote-debugging-port`. Use port **9333** (9222 is typically occupied by Chrome).

```bash
bg_shell start "cd apps/desktop && VITE_DEV_SERVER_URL=http://127.0.0.1:5174 npx electron . --remote-debugging-port=9333" \
  --label desktop-electron --type server --ready-port 9333
```

If the port is taken, check with `lsof -i :9333` and pick another.

**The `desktop:dev` script does NOT enable CDP.** Always launch the two pieces separately for automation.

### Step 3: Connect agent-browser to the App Window

Electron exposes multiple CDP targets. The first one is usually DevTools (index 0). The app window is typically index 1.

```bash
# List targets
agent-browser --cdp 9333 tab

# Switch to the Kata Desktop target (usually index 1)
agent-browser --cdp 9333 tab 1
```

Verify you're on the right target — if your snapshot shows DevTools elements (tabs named "Elements", "Console", "Sources"), you're on the wrong target. Switch to index 1.

After switching once, subsequent `--cdp 9333` commands stay on that target for the session.

### Step 4: Verify Connection

```bash
agent-browser --cdp 9333 snapshot -i
```

You should see app elements like buttons, inputs, radio groups — not DevTools chrome. If you see the onboarding wizard, that's correct for a fresh state.

## Core Workflow

Every UAT interaction follows: **snapshot → interact → re-snapshot → screenshot**.

```bash
# 1. Discover interactive elements
agent-browser --cdp 9333 snapshot -i

# 2. Interact using refs from the snapshot
agent-browser --cdp 9333 click @e15
agent-browser --cdp 9333 fill @e3 "some text"

# 3. Re-snapshot (refs are invalidated after DOM changes)
agent-browser --cdp 9333 snapshot -i

# 4. Capture evidence
agent-browser --cdp 9333 screenshot /path/to/evidence.png
```

**Refs are ephemeral.** They invalidate on any DOM change — clicking a button, opening a modal, navigating. Always re-snapshot after interacting before using new refs.

### Waiting for Async Operations

Chat responses, API calls, and bridge startup are async. Wait before snapshotting:

```bash
# Fixed wait (simple, reliable)
agent-browser --cdp 9333 wait 3000

# Wait for specific text
agent-browser --cdp 9333 wait --text "Ready"

# Wait for an element to appear
agent-browser --cdp 9333 wait "#some-element"
```

### Evaluating JS in the Renderer

For checks that aren't visible in the accessibility tree:

```bash
agent-browser --cdp 9333 eval 'document.title'
agent-browser --cdp 9333 eval 'document.querySelectorAll("[role=alert]").length'
```

## UAT Report Format

Reports go in `apps/desktop/docs/uat/<milestone>/`. Each milestone gets its own folder.

### Directory Structure

```
apps/desktop/docs/uat/
├── M001/
│   ├── M001-UAT.md          # Report
│   ├── 01-initial-launch.png
│   ├── 02-onboarding-step2.png
│   └── ...
├── M002/
│   ├── M002-UAT.md
│   └── ...
```

### Screenshot Naming

Use sequential numbered prefixes with descriptive slugs:

```
01-initial-launch.png
02-onboarding-providers.png
03-api-key-input.png
04-chat-response.png
05-tool-card-diff.png
```

### Report Template

```markdown
# <Milestone>: <Title> — UAT Report

**Date:** YYYY-MM-DD
**Milestone:** <ID> <Title>
**Method:** agent-browser --cdp 9333 connected to Electron
**Environment:** Dev mode, apps/desktop

---

## Summary

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Description | ✅ PASS / ❌ FAIL / ⚠️ PARTIAL | [screenshot.png](screenshot.png) |

---

## Detailed Observations

### ✅ Passing
<grouped observations>

### ❌ Failing
<grouped observations with reproduction steps>

### ⚠️ Known Issues
<reference existing Linear tickets>

---

## Test Environment
<platform, automation method, auth state>
```

### Deriving Acceptance Criteria

Pull criteria from these sources in order:

1. **Milestone ROADMAP** success criteria (from `kata_read_document("M00N-ROADMAP")`)
2. **Slice must-haves** from each slice's issue description
3. **Milestone definition of done** from the ROADMAP

Each criterion becomes a row in the summary table.

## Common UAT Flows

### Onboarding (S03)

```bash
agent-browser --cdp 9333 snapshot -i              # Step 1: Welcome
agent-browser --cdp 9333 screenshot .../01-welcome.png
agent-browser --cdp 9333 click @e<get-started>
agent-browser --cdp 9333 snapshot -i              # Step 2: Providers
agent-browser --cdp 9333 screenshot .../02-providers.png
agent-browser --cdp 9333 click @e<provider>
agent-browser --cdp 9333 click @e<continue>
agent-browser --cdp 9333 snapshot -i              # Step 3: API key
# ... continue through all 4 steps
```

### Chat Interaction

```bash
agent-browser --cdp 9333 fill @e<input> "Hello, what can you do?"
agent-browser --cdp 9333 click @e<send>
agent-browser --cdp 9333 wait 5000                # Wait for streaming response
agent-browser --cdp 9333 snapshot -i              # Check response rendered
agent-browser --cdp 9333 screenshot .../chat-response.png
```

### Settings Panel

```bash
agent-browser --cdp 9333 click @e<settings>       # Open settings
agent-browser --cdp 9333 snapshot -i              # See tabs + provider list
agent-browser --cdp 9333 screenshot .../settings.png
agent-browser --cdp 9333 click @e<close>          # Close settings
```

### Permission Mode Switching

```bash
agent-browser --cdp 9333 click @e<auto-radio>     # Switch to Auto
agent-browser --cdp 9333 snapshot -i              # Confirm checked state
agent-browser --cdp 9333 click @e<ask-radio>      # Switch to Ask
```

## After Agent Testing: Human Handoff

Once the agent has completed its automated walkthrough and written the UAT report, hand off to the user for their own manual verification. This is not optional — agent testing proves the mechanics work, but only the human can judge whether the right thing was built.

### Manual Run Instructions

Provide the user with these exact steps (adapt the milestone-specific details):

```markdown
## Manual Verification Steps

### Launch the app
cd apps/desktop
bun run desktop:dev

### What to verify
1. **Onboarding** — If this is a fresh install (clear localStorage), the 4-step wizard should appear
2. **Chat** — Type a message and send. You should see a streaming response appear word-by-word
3. **Tool rendering** — Ask the agent to edit a file or run a command. Check that diffs show syntax highlighting and bash output shows ANSI colors
4. **Permission modes** — Switch between Explore/Ask/Auto. In Ask mode, tool calls should show an approval dialog
5. **Settings** — Click the gear icon. Your configured providers should show with green dots and masked keys
6. **Sessions** — Click "+ New Session". The chat should clear. The sidebar should show both sessions
7. **Session persistence** — Close and reopen the app. Your sessions should still be in the sidebar

### What to report back
- Anything that looks wrong, feels off, or doesn't match your expectations
- Specific UI issues: misalignment, truncated text, wrong colors, broken layout
- Functional issues: crashes, errors, features that don't work as described
- "This is fine" is also a valid response — it means we can merge
```

Tailor these steps to the specific milestone's deliverables. Pull the verification items from the ROADMAP success criteria.

## PR and Linear Integration

While the user is running their manual verification, do two things in parallel:

### 1. Create a PR with UAT Results

Commit the UAT artifacts and open a PR. **Get user confirmation before creating the PR.**

```bash
cd apps/desktop
git add docs/uat/<milestone>/
git add src/main/__tests__/  # If test fixes were made during UAT
git commit -m "docs(uat): M001 Chat Foundation acceptance report"
git push -u origin desktop/uat/<milestone>
```

Then create the PR:
- **Title:** `UAT: M001 Chat Foundation`
- **Body:** Summary table from the UAT report, link to the full doc, list of screenshots
- **Base:** `main`

### 2. Create a Linear UAT Ticket

Create a Linear issue attached to the milestone being validated. This is the permanent record of the acceptance test.

```
linear_create_issue({
  title: "[UAT] M001 Chat Foundation Acceptance",
  teamId: <team-id>,
  projectId: <project-id>,
  projectMilestoneId: <milestone-id>,
  description: <contents of the UAT markdown report>
})
```

The issue body should be the full UAT report markdown — the same content as the `M00N-UAT.md` file.

### 3. Create Backlog Tickets for Issues Found

Any issues discovered during UAT that aren't blocking the milestone should become backlog tickets. Attach them to the milestone that was tested so there's traceability.

For each issue:

```
linear_create_issue({
  title: "<descriptive title>",
  teamId: <team-id>,
  projectId: <project-id>,
  projectMilestoneId: <milestone-id>,
  description: "## Found during M001 UAT\n\n<description>\n\n## Reproduction\n<steps>\n\n## Evidence\n<screenshot reference>"
})
```

Examples of UAT-sourced backlog tickets:
- "Onboarding shows 'Configured' provider but still requires API key entry" (KAT-2166)
- "Model selector shows 'No models available' despite valid provider key"
- "Session switching not functional from sidebar"

Each ticket should reference the UAT report and include reproduction steps and evidence (screenshot filenames from the UAT folder).

### Completion

UAT is complete when:
1. The agent UAT report is written with all criteria checked ✅
2. The user has completed manual verification and reported back
3. The PR is open with UAT artifacts
4. The Linear UAT ticket exists on the milestone
5. Any issues found are filed as backlog tickets

If the user reports no issues: merge the PR, mark the UAT ticket done.
If the user reports issues: fix them on the UAT branch, re-run affected checks, update the report, then merge.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `bind() failed: Address already in use` | Port taken. `lsof -i :9333` and use a different port |
| Snapshot shows DevTools elements | Run `agent-browser --cdp 9333 tab 1` to switch targets |
| `Connection refused` | Electron not running with `--remote-debugging-port`, or wrong port |
| Blank/empty snapshot | App still loading. `agent-browser --cdp 9333 wait 2000` then retry |
| Cannot type in inputs | Try `agent-browser --cdp 9333 keyboard type "text"` instead of `fill` |
| Refs don't match after clicking | Refs invalidated — always re-snapshot after any action |
| Bridge shows "crashed" | `loader.js` needs `chmod +x`, or `kata` not on PATH. Check AGENTS.md |

## What NOT to Do

- **Don't** open `http://127.0.0.1:5174` in Playwright or a standalone browser — the preload bridge won't exist
- **Don't** use `browser_navigate`, `browser_click`, or other Playwright-based tools — they connect to a separate browser, not Electron
- **Don't** use `mac_screenshot` — it requires Screen Recording permission that may not be granted
- **Don't** assume refs persist after clicking or navigating — always re-snapshot
- **Don't** use the `desktop:dev` script for automated UAT — it doesn't enable CDP
- **Don't** skip the `tab 1` step — you'll be interacting with DevTools instead of the app
