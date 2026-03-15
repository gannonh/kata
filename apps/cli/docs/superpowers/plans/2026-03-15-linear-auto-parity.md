# Linear Auto-Mode Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Linear auto-mode dispatch to full parity with file-mode auto-mode — every feature that works in file-mode must work in Linear mode.

**Architecture:** The Linear dispatch path in `auto.ts` (lines 802-1025) is a stripped-down copy of the file-mode path (lines 1028-1621). Rather than duplicating all file-mode helpers, we add Linear-equivalent logic inline in the dispatch path, using the Linear API for document/state checks instead of filesystem reads. The prompt builders in `linear-auto.ts` already cover all phases; the gap is purely in the dispatch routing and supervision in `auto.ts`.

**Tech Stack:** TypeScript, Linear GraphQL API via `LinearClient`, existing `linear-auto.ts` prompt builders, existing `selectLinearPrompt` with options.

**Already fixed (do not redo):**
- Git commit instructions in execute-task and complete-slice prompts (linear-auto.ts)
- Auto-commit fallback enabled for Linear mode (auto.ts handleAgentEnd)
- PR gate detects slice transitions via ID comparison (auto.ts)
- `kata_update_issue_state` blocks slices from being marked done directly (linear-tools.ts)

---

## Chunk 1: Dispatch-Time Routing (Research, UAT, Reassessment, Budget)

The core gap: file-mode runs `checkNeedsRunUat`, `checkNeedsReassessment`, research-before-plan checks, and budget ceiling checks before selecting the prompt. Linear mode calls `selectLinearPrompt(linearState)` with no options — it never routes to research, UAT, or reassessment.

### Task 1: Add Linear-mode research-before-plan routing

The file-mode dispatch checks if a RESEARCH file exists before dispatching plan-milestone or plan-slice. If no research exists, it dispatches research first. The Linear equivalent checks for a RESEARCH document via `kata_list_documents`.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts:854` (Linear dispatch section)
- Modify: `src/resources/extensions/kata/linear-auto.ts` (add `checkLinearResearchExists` helper)

- [ ] **Step 1: Write the helper in linear-auto.ts**

Add a function that checks whether a document exists for a given name pattern via the Linear API:

```typescript
import { readKataDocument } from "../linear/linear-documents.js";
import { loadEffectiveLinearProjectConfig } from "./linear-config.js";

/**
 * Check if a Linear document exists by name (e.g. "M001-RESEARCH").
 * Returns true if the document exists and has content.
 */
export async function linearDocumentExists(
  client: LinearClient,
  docName: string,
  scope: { projectId?: string; issueId?: string },
): Promise<boolean> {
  try {
    const result = await readKataDocument(client, docName, scope);
    return result !== null && result.content.trim().length > 0;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Build a LinearClient instance in the dispatch path**

The dispatch path needs a client to check documents. Add client construction after state resolution (reuse the same pattern as `resolveLinearKataState`):

```typescript
// After line 803 (linearState resolution), add:
const linearApiKey = process.env.LINEAR_API_KEY;
const linearConfig = loadEffectiveLinearProjectConfig();
const linearClient = linearApiKey ? new LinearClient(linearApiKey) : null;
const linearProjectId = linearConfig.linear.projectId ?? undefined;
```

- [ ] **Step 3: Add research-before-plan routing**

Replace the simple `selectLinearPrompt(linearState)` call at line 854 with dispatch-time routing:

```typescript
let linearDispatchOptions: Parameters<typeof selectLinearPrompt>[1] = {};

// Research-before-plan: check if research doc exists
if (linearState.phase === "pre-planning" && linearClient && linearProjectId) {
  const mid = linearState.activeMilestone?.id ?? "unknown";
  const hasResearch = await linearDocumentExists(
    linearClient, `${mid}-RESEARCH`, { projectId: linearProjectId },
  );
  if (!hasResearch) {
    linearDispatchOptions.dispatchResearch = "milestone";
  }
} else if (linearState.phase === "planning" && linearClient && linearProjectId) {
  const sid = linearState.activeSlice?.id ?? "unknown";
  const hasResearch = await linearDocumentExists(
    linearClient, `${sid}-RESEARCH`, { projectId: linearProjectId },
  );
  if (!hasResearch) {
    linearDispatchOptions.dispatchResearch = "slice";
  }
}

const linearPrompt = selectLinearPrompt(linearState, linearDispatchOptions);
```

- [ ] **Step 4: Build and verify it compiles**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/resources/extensions/kata/auto.ts src/resources/extensions/kata/linear-auto.ts
git commit -m "feat(linear-auto): add research-before-plan dispatch routing"
```

### Task 2: Add Linear-mode UAT dispatch

File-mode checks `checkNeedsRunUat` which looks for a UAT file without a UAT-RESULT file on the last completed slice. Linear equivalent: check if `${sid}-UAT` document exists but `${sid}-UAT-RESULT` does not.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section)

- [ ] **Step 1: Add UAT check before prompt selection**

After research-before-plan routing, before `selectLinearPrompt`:

```typescript
// UAT dispatch: check if last completed slice needs UAT
const prefs = loadEffectiveKataPreferences()?.preferences;
if (prefs?.uat_dispatch && linearClient && linearProjectId && !linearDispatchOptions.dispatchResearch) {
  // Find last completed slice that has UAT but no UAT-RESULT
  // Use linearState — if we just transitioned slices, the previous slice is the one to UAT
  if (sliceChanged && prevSliceKey) {
    const [, completedSid] = prevSliceKey.split("/");
    if (completedSid) {
      const hasUat = await linearDocumentExists(
        linearClient, `${completedSid}-UAT`, { projectId: linearProjectId },
      );
      const hasUatResult = await linearDocumentExists(
        linearClient, `${completedSid}-UAT-RESULT`, { projectId: linearProjectId },
      );
      if (hasUat && !hasUatResult) {
        linearDispatchOptions.uatSliceId = completedSid;
      }
    }
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add UAT dispatch routing"
```

### Task 3: Add Linear-mode reassessment dispatch

File-mode checks `checkNeedsReassessment` which looks for a completed slice with a SUMMARY but no ASSESSMENT. Linear equivalent uses the same document check pattern.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section)

- [ ] **Step 1: Add reassessment check**

After UAT check, before `selectLinearPrompt`:

```typescript
// Reassessment dispatch: check if last completed slice needs roadmap reassessment
if (!linearDispatchOptions.uatSliceId && !linearDispatchOptions.dispatchResearch
    && linearClient && linearProjectId && sliceChanged && prevSliceKey) {
  const [, completedSid] = prevSliceKey.split("/");
  if (completedSid) {
    const hasSummary = await linearDocumentExists(
      linearClient, `${completedSid}-SUMMARY`, { projectId: linearProjectId },
    );
    const hasAssessment = await linearDocumentExists(
      linearClient, `${completedSid}-ASSESSMENT`, { projectId: linearProjectId },
    );
    if (hasSummary && !hasAssessment) {
      linearDispatchOptions.reassessSliceId = completedSid;
    }
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add reassessment dispatch routing"
```

### Task 4: Add budget ceiling guard to Linear mode

File-mode checks `prefs.budget_ceiling` and pauses if exceeded. This is mode-independent — just needs to run before prompt dispatch.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section)

- [ ] **Step 1: Add budget ceiling check**

Insert after the PR gate check block (after line ~987), before `lastUnit` assignment:

```typescript
// Budget ceiling guard — same as file-mode
const linearPrefs = loadEffectiveKataPreferences()?.preferences;
const linearBudgetCeiling = linearPrefs?.budget_ceiling;
if (linearBudgetCeiling !== undefined) {
  const currentLedger = getLedger();
  const totalCost = currentLedger ? getProjectTotals(currentLedger.units).cost : 0;
  if (totalCost >= linearBudgetCeiling) {
    ctx.ui.notify(
      `Budget ceiling ${formatCost(linearBudgetCeiling)} reached (spent ${formatCost(totalCost)}). Pausing auto-mode.`,
      "warning",
    );
    await pauseAuto(ctx, pi);
    return;
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add budget ceiling guard"
```

---

## Chunk 2: Supervision (Timeouts, Lock, Crash Recovery, Progress Widget)

### Task 5: Add lock file and crash recovery to Linear mode

File-mode writes a lock file before each unit and uses it for crash recovery on restart. Linear mode should do the same — lock files are mode-independent (they track which unit is running).

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section + startAuto)

- [ ] **Step 1: Add lock file write after newSession in Linear path**

After line 995 (`const linearResult = await cmdCtx!.newSession()`), add:

```typescript
const linearSessionFile = ctx.sessionManager.getSessionFile();
writeLock(basePath, linearUnitType, linearUnitId, completedUnits.length, linearSessionFile);
```

- [ ] **Step 2: Add crash recovery to Linear startAuto path**

In the Linear `startAuto` block (around line 317), after the blocked check and before `active = true`, add crash lock detection:

```typescript
const crashLock = readCrashLock(base);
if (crashLock) {
  const activityDir = join(kataRoot(base), "activity");
  const recovery = synthesizeCrashRecovery(
    base, crashLock.unitType, crashLock.unitId,
    crashLock.sessionFile, activityDir,
  );
  if (recovery && recovery.trace.toolCallCount > 0) {
    pendingCrashRecovery = recovery.prompt;
    ctx.ui.notify(
      `${formatCrashInfo(crashLock)}\nRecovered ${recovery.trace.toolCallCount} tool calls. Resuming with context.`,
      "warning",
    );
  } else {
    ctx.ui.notify(
      `${formatCrashInfo(crashLock)}\nNo session data recovered. Resuming from Linear state.`,
      "warning",
    );
  }
  clearLock(base);
}
```

- [ ] **Step 3: Prepend crash recovery prompt in Linear dispatch**

After `linearFinalPrompt` is set (around line 1003), add:

```typescript
if (pendingCrashRecovery) {
  linearFinalPrompt = `${pendingCrashRecovery}\n\n---\n\n${linearFinalPrompt}`;
  pendingCrashRecovery = null;
}
```

Wait — this is already partially handled. The retry diagnostic is at line 1004. Just add the crash recovery check before it:

```typescript
// Crash recovery prompt (if resuming from crash)
if (pendingCrashRecovery) {
  linearFinalPrompt = `${pendingCrashRecovery}\n\n---\n\n${linearFinalPrompt}`;
  pendingCrashRecovery = null;
} else if (retryCount > 0) {
  // existing retry diagnostic code
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add lock file and crash recovery"
```

### Task 6: Add timeout supervision to Linear mode

File-mode sets up soft timeout warning, idle watchdog, and hard timeout. These are mode-independent — they just need the unit type/id and the supervisor config.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section, after sendMessage)

- [ ] **Step 1: Add timeout setup after sendMessage**

After `pi.sendMessage(...)` at line 1024, add the same timeout setup as file-mode (lines 1497-1604). The Linear version is simpler because `recoverTimedOutUnit` for Linear mode can just pause (no file-based durability inspection needed yet):

```typescript
// Timeout supervision — same as file-mode
clearUnitTimeout();
const linearSupervisor = resolveAutoSupervisorConfig();
const linearSoftMs = linearSupervisor.soft_timeout_minutes * 60 * 1000;
const linearIdleMs = linearSupervisor.idle_timeout_minutes * 60 * 1000;
const linearHardMs = linearSupervisor.hard_timeout_minutes * 60 * 1000;

wrapupWarningHandle = setTimeout(() => {
  wrapupWarningHandle = null;
  if (!active || !currentUnit) return;
  pi.sendMessage(
    {
      customType: "kata-auto-wrapup",
      display: verbose,
      content: [
        "**TIME BUDGET WARNING — keep going only if progress is real.**",
        "This unit crossed the soft time budget.",
        "If you are making progress, continue. If not, switch to wrap-up mode now:",
        "1. commit your work",
        "2. write the required durable artifacts (task summary via kata_write_document)",
        "3. advance the task state via kata_update_issue_state",
        "4. leave precise resume notes if anything remains unfinished",
      ].join("\n"),
    },
    { triggerTurn: true },
  );
}, linearSoftMs);

idleWatchdogHandle = setInterval(async () => {
  if (!active || !currentUnit) return;
  // Simple idle detection for Linear mode — just pause
  ctx.ui.notify(
    `Unit ${linearUnitType} ${linearUnitId} idle for ${linearSupervisor.idle_timeout_minutes}min. Pausing.`,
    "warning",
  );
  await pauseAuto(ctx, pi);
}, linearIdleMs);

unitTimeoutHandle = setTimeout(async () => {
  unitTimeoutHandle = null;
  if (!active) return;
  if (currentUnit) {
    const modelId = ctx.model?.id ?? "unknown";
    snapshotUnitMetrics(ctx, currentUnit.type, currentUnit.id, currentUnit.startedAt, modelId);
  }
  saveActivityLog(ctx, basePath, linearUnitType, linearUnitId);
  ctx.ui.notify(
    `Unit ${linearUnitType} ${linearUnitId} exceeded ${linearSupervisor.hard_timeout_minutes}min. Pausing.`,
    "warning",
  );
  await pauseAuto(ctx, pi);
}, linearHardMs);
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add timeout supervision"
```

### Task 7: Add progress widget to Linear mode

File-mode calls `updateProgressWidget` with state data. The widget rendering code is mode-independent — it just needs the unit type, unit id, and state. The only file-mode-specific part is `updateSliceProgressCache` which reads roadmap from disk. For Linear mode, we can derive progress from `linearState.progress`.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section)

- [ ] **Step 1: Add progress widget call**

After setting `currentUnit` at line 990, add:

```typescript
// Progress widget — uses linearState.progress for slice/task counts
if (linearState.progress?.slices) {
  cachedSliceProgress = {
    done: linearState.progress.slices.done,
    total: linearState.progress.slices.total,
    milestoneId: linearMidId,
    activeSliceTasks: linearState.progress?.tasks
      ? { done: linearState.progress.tasks.done, total: linearState.progress.tasks.total }
      : null,
  };
}
updateProgressWidget(ctx, linearUnitType, linearUnitId, linearState);
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add progress widget"
```

### Task 8: Add unit runtime records to Linear mode

File-mode writes unit runtime records for supervision and recovery. These are file-based but mode-independent — they write to `.kata/` directory which exists in both modes.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section)

- [ ] **Step 1: Add runtime record write after currentUnit assignment**

After line 990 (`currentUnit = { ... }`), add:

```typescript
writeUnitRuntimeRecord(basePath, linearUnitType, linearUnitId, currentUnit.startedAt, {
  phase: "dispatched",
  wrapupWarningSent: false,
  timeoutAt: null,
  lastProgressAt: currentUnit.startedAt,
  progressCount: 0,
  lastProgressKind: "dispatch",
});
```

- [ ] **Step 2: Add clearUnitRuntimeRecord for completed units**

In the "Snapshot + activity log for the PREVIOUS unit" block (line 907-923), add after `completedUnits.push(...)`:

```typescript
clearUnitRuntimeRecord(basePath, currentUnit.type, currentUnit.id);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add unit runtime records"
```

---

## Chunk 3: Remaining Gaps (Skill Discovery, ensurePreconditions, Observability)

### Task 9: Add skill discovery to Linear research prompts

File-mode research prompts include skill discovery instructions. The Linear research prompts should too.

**Files:**
- Modify: `src/resources/extensions/kata/linear-auto.ts` (research prompt builders)

- [ ] **Step 1: Add skill discovery to research-milestone prompt**

In `buildLinearResearchMilestonePrompt`, after step 5 (scout codebase), add:

```typescript
``,
`5b. Skill Discovery:`,
`   ${buildSkillDiscoveryVars().skillDiscoveryInstructions}`,
```

Import `buildSkillDiscoveryVars` — wait, it's a local function in auto.ts. Export it instead.

In `auto.ts`, change `function buildSkillDiscoveryVars` to `export function buildSkillDiscoveryVars`.

In `linear-auto.ts`, import it:
```typescript
import { buildSkillDiscoveryVars } from "./auto.js";
```

Wait — this creates a circular dependency (linear-auto imports from auto, auto imports from linear-auto). Instead, move `buildSkillDiscoveryVars` to `preferences.ts` which both can import.

- [ ] **Step 1a: Move buildSkillDiscoveryVars to preferences.ts**

Cut the function from auto.ts and paste into preferences.ts. Export it. Update the import in auto.ts.

- [ ] **Step 1b: Add skill discovery instructions to both Linear research prompts**

In `buildLinearResearchMilestonePrompt` and `buildLinearResearchSlicePrompt`, add after the "Scout the codebase" step.

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts src/resources/extensions/kata/linear-auto.ts src/resources/extensions/kata/preferences.ts
git commit -m "feat(linear-auto): add skill discovery to research prompts"
```

### Task 10: Add ensurePreconditions for Linear mode

File-mode creates directories and ensures slice branches. Linear mode doesn't need directories (artifacts are in the API), but it should ensure `.kata/` exists for lock files and runtime records, and ensure git repo is initialized.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear dispatch section and startAuto)

- [ ] **Step 1: Ensure .kata/ directory exists in Linear startAuto**

In the Linear `startAuto` block, after crash recovery and before `active = true`, add:

```typescript
// Ensure git repo and .kata/ exist for lock files and activity logs
try {
  execSync("git rev-parse --git-dir", { cwd: base, stdio: "pipe" });
} catch {
  execSync("git init", { cwd: base, stdio: "pipe" });
}
ensureGitignore(base);
const kataDir = join(base, ".kata");
if (!existsSync(kataDir)) {
  mkdirSync(kataDir, { recursive: true });
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): ensure git and .kata/ dir in Linear startAuto"
```

### Task 11: Add skill snapshot to Linear startAuto

File-mode calls `snapshotSkills()` in startAuto when skill discovery is enabled.

**Files:**
- Modify: `src/resources/extensions/kata/auto.ts` (Linear startAuto block)

- [ ] **Step 1: Add skill snapshot**

In the Linear `startAuto` block, after `initMetrics(base)`, add:

```typescript
if (resolveSkillDiscoveryMode() !== "off") {
  snapshotSkills();
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/resources/extensions/kata/auto.ts
git commit -m "feat(linear-auto): add skill snapshot on start"
```

---

## Summary of all gaps and their task mapping

| Gap | Task |
|-----|------|
| Research-before-plan routing | Task 1 |
| UAT dispatch | Task 2 |
| Reassessment dispatch | Task 3 |
| Budget ceiling | Task 4 |
| Lock file + crash recovery | Task 5 |
| Timeout supervision | Task 6 |
| Progress widget | Task 7 |
| Unit runtime records | Task 8 |
| Skill discovery in research prompts | Task 9 |
| ensurePreconditions (git + .kata/) | Task 10 |
| Skill snapshot on start | Task 11 |

Not ported (intentionally):
- **ensureSliceBranch** — Linear mode doesn't use branch-per-slice
- **File inlining** — Linear mode reads docs via API at runtime
- **Observability validator** — validates file-based artifacts that don't exist in Linear mode
- **Timeout recovery with durability inspection** — depends on file-based task summary/plan checkbox detection; Linear mode pauses on timeout instead (adequate for now)
- **skipExecuteTask / writeBlockerPlaceholder** — file-based skip artifacts; Linear mode pauses instead
