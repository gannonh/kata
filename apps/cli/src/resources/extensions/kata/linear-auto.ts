/**
 * Linear Auto-Mode — State resolution and prompt builders for `/kata auto` in Linear mode.
 *
 * `resolveLinearKataState` mirrors `commands.ts::deriveKataState` but lives here
 * to avoid the circular dependency: commands.ts imports from auto.ts (which
 * would cycle back to commands.ts if auto.ts imported deriveKataState from there).
 *
 * Prompt builders orient the agent for each workflow phase and tell it to use
 * LINEAR-WORKFLOW.md for detailed operation steps.
 */

import { LinearClient } from "../linear/linear-client.js";
import { ensureKataLabels } from "../linear/linear-entities.js";
import { deriveLinearState } from "../linear/linear-state.js";
import {
  isLinearMode,
  loadEffectiveLinearProjectConfig,
  resolveConfiguredLinearTeamId,
} from "./linear-config.js";
import { deriveState } from "./state.js";
import type { KataState } from "./types.js";

// ─── State Resolution ─────────────────────────────────────────────────────────

/**
 * Mirrors `commands.ts::deriveKataState` without importing from commands.ts.
 * In file mode: delegates to deriveState(basePath).
 * In Linear mode: queries the Linear API; returns phase:"blocked" with blockers[]
 * on missing API key, missing config, or API error.
 */
export async function resolveLinearKataState(basePath: string): Promise<KataState> {
  if (!isLinearMode()) {
    return deriveState(basePath);
  }

  const config = loadEffectiveLinearProjectConfig();
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    return {
      phase: "blocked",
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      blockers: ["LINEAR_API_KEY is not set"],
      recentDecisions: [],
      nextAction: "Set LINEAR_API_KEY to use Linear mode.",
      registry: [],
      progress: { milestones: { done: 0, total: 0 } },
    };
  }

  const { projectId } = config.linear;
  if (!projectId) {
    return {
      phase: "blocked",
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      blockers: [
        "Linear project not configured — set linear.projectId in .kata/preferences.md.",
      ],
      recentDecisions: [],
      nextAction: "Run /kata prefs project to configure the Linear project.",
      registry: [],
      progress: { milestones: { done: 0, total: 0 } },
    };
  }

  try {
    const client = new LinearClient(apiKey);
    const teamResolution = await resolveConfiguredLinearTeamId(client);
    if (!teamResolution.teamId) {
      return {
        phase: "blocked",
        activeMilestone: null,
        activeSlice: null,
        activeTask: null,
        blockers: [teamResolution.error ?? "Linear team could not be resolved."],
        recentDecisions: [],
        nextAction: "Fix linear.teamId or linear.teamKey in preferences.",
        registry: [],
        progress: { milestones: { done: 0, total: 0 } },
      };
    }

    const teamId = teamResolution.teamId;
    const labelSet = await ensureKataLabels(client, teamId);
    return await deriveLinearState(client, {
      projectId,
      teamId,
      sliceLabelId: labelSet.slice.id,
      basePath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      phase: "blocked",
      activeMilestone: null,
      activeSlice: null,
      activeTask: null,
      blockers: [`Linear API error: ${message}`],
      recentDecisions: [],
      nextAction: "Check LINEAR_API_KEY and Linear project config, then retry.",
      registry: [],
      progress: { milestones: { done: 0, total: 0 } },
    };
  }
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * Execute-task prompt (phases: executing, verifying).
 * Orients the agent to the active task and tells it to follow LINEAR-WORKFLOW.md.
 */
export function buildLinearExecuteTaskPrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const sid = state.activeSlice?.id ?? "unknown";
  const tid = state.activeTask?.id ?? "unknown";
  const tTitle = state.activeTask?.title ?? "unknown";

  return [
    `# Execute Task — Linear Mode`,
    ``,
    `**Milestone:** ${mid}`,
    `**Slice:** ${sid}`,
    `**Task:** ${tid} — ${tTitle}`,
    ``,
    `## Instructions`,
    ``,
    `Hard rule: In Linear mode, never use bash/read/find/rg/git to locate workflow artifacts (e.g. ${tid}-PLAN, ${sid}-PLAN, ${mid}-ROADMAP). Use only kata_read_document/kata_write_document for plan and summary artifacts.`,
    ``,
    `Follow these steps in order:`,
    ``,
    `1. Call \`kata_derive_state\` (no arguments) to confirm the active milestone, slice, and task context.`,
    ``,
    `2. Resolve the task issue UUID:`,
    `   - The slice issue UUID may not be known here. If needed, call \`kata_list_slices\` to get the active slice issue UUID, then call \`kata_list_tasks(sliceIssueId)\` and match by task title ("${tTitle}") to find the task issue UUID.`,
    ``,
    `3. Call \`kata_read_document\` with title "${tid}-PLAN" to read the task plan.`,
    `   - If this returns null, call \`kata_read_document\` with "${sid}-PLAN".`,
    `   - If that also returns null, call \`kata_read_document\` with "${mid}-ROADMAP".`,
    `   - If all are null, create "${tid}-PLAN" with \`kata_write_document\` (issueId=<task-uuid>) containing a minimal, concrete execution contract, then continue.`,
    ``,
    `4. Execute the task as specified in the plan. Build the real implementation — no stubs.`,
    ``,
    `5. When done, call \`kata_write_document\` to write the task summary document (title: "${tid}-SUMMARY").`,
    ``,
    `6. Advance the task to done: call \`kata_update_issue_state({ issueId: "<task-uuid>", phase: "done" })\`.`,
    `   - Resolve the task UUID from step 2 if you haven't already.`,
    ``,
    `**Reference:** Consult \`LINEAR-WORKFLOW.md\` (injected into your system prompt) for full operation steps, entity conventions, artifact storage format, and phase transition rules.`,
  ].join("\n");
}

/**
 * Plan-slice prompt (phase: planning).
 * Orients the agent to the active slice and tells it to write the slice plan.
 */
export function buildLinearPlanSlicePrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const sid = state.activeSlice?.id ?? "unknown";
  const sTitle = state.activeSlice?.title ?? "unknown";

  return [
    `# Plan Slice — Linear Mode`,
    ``,
    `**Milestone:** ${mid}`,
    `**Slice:** ${sid} — ${sTitle}`,
    ``,
    `## Instructions`,
    ``,
    `Hard rule: In Linear mode, never use bash/read/find/rg/git to locate plan docs. Read/write artifacts only via kata_read_document/kata_write_document.`,
    ``,
    `Follow these steps in order:`,
    ``,
    `1. Call \`kata_derive_state\` (no arguments) to confirm the active milestone and slice context.`,
    ``,
    `2. Check existing artifacts and tasks before creating anything:`,
    `   - Call \`kata_read_document\` with title "${sid}-PLAN".`,
    `   - Call \`kata_read_document\` with title "${sid}-CONTEXT" (optional, may return null).`,
    `   - Call \`kata_read_document\` with title "${sid}-RESEARCH" (optional, may return null).`,
    `   - Call \`kata_list_tasks\` for the active slice issue UUID.`,
    ``,
    `3. Idempotency rule:`,
    `   - If "${sid}-PLAN" already exists AND task sub-issues already exist, do NOT rewrite the plan and do NOT create duplicate tasks.`,
    `   - In that case, continue by advancing the slice state only.`,
    ``,
    `4. Only when missing, create what is absent:`,
    `   - If "${sid}-PLAN" is missing, write it via \`kata_write_document\` with title "${sid}-PLAN".`,
    `   - If task sub-issues are missing, create them via \`kata_create_task\` (T01, T02, ...).`,
    `   - Include must-haves, verification steps, and estimated effort per task.`,
    ``,
    `5. Advance the slice to executing: call \`kata_update_issue_state({ issueId: "<slice-uuid>", phase: "executing" })\`.`,
    `   - Resolve the slice UUID via \`kata_list_slices\` if needed.`,
    ``,
    `**Reference:** Consult \`LINEAR-WORKFLOW.md\` for artifact storage format, entity conventions, and phase transition rules.`,
  ].join("\n");
}

/**
 * Plan-milestone prompt (phase: pre-planning).
 * Orients the agent to the active milestone and tells it to write the roadmap.
 */
export function buildLinearPlanMilestonePrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const mTitle = state.activeMilestone?.title ?? "unknown";

  return [
    `# Plan Milestone — Linear Mode`,
    ``,
    `**Milestone:** ${mid} — ${mTitle}`,
    ``,
    `## Instructions`,
    ``,
    `Hard rule: In Linear mode, never use bash/read/find/rg/git to locate roadmap/plan artifacts. Read/write artifacts only via kata_read_document/kata_write_document.`,
    ``,
    `Follow these steps in order:`,
    ``,
    `1. Call \`kata_derive_state\` (no arguments) to confirm the active milestone context.`,
    ``,
    `2. Read existing context and research if available:`,
    `   - Call \`kata_read_document\` with title "${mid}-CONTEXT" (may return null).`,
    `   - Call \`kata_read_document\` with title "${mid}-RESEARCH" (may return null).`,
    ``,
    `3. Write the milestone roadmap: call \`kata_write_document\` with title "${mid}-ROADMAP".`,
    `   - Define slices (S01, S02, ...) ordered by risk — riskiest first.`,
    `   - Each slice should be a demoable vertical increment.`,
    ``,
    `4. Create slice issues and task sub-issues in Linear per the roadmap:`,
    `   - For each slice: call \`kata_create_slice\` with the milestone issue UUID and slice details.`,
    `   - For each task within a slice: call \`kata_create_task\` with the slice issue UUID and task details.`,
    ``,
    `**Reference:** Consult \`LINEAR-WORKFLOW.md\` for entity conventions, artifact storage format, and phase transition rules.`,
  ].join("\n");
}

/**
 * Complete-slice prompt (phase: summarizing).
 * Orients the agent to collect task summaries and write the slice summary.
 */
export function buildLinearCompleteSlicePrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const sid = state.activeSlice?.id ?? "unknown";
  const sTitle = state.activeSlice?.title ?? "unknown";

  return [
    `# Complete Slice — Linear Mode`,
    ``,
    `**Milestone:** ${mid}`,
    `**Slice:** ${sid} — ${sTitle}`,
    ``,
    `## Instructions`,
    ``,
    `Hard rule: In Linear mode, never use bash/read/find/rg/git to locate summary artifacts. Read/write artifacts only via kata_read_document/kata_write_document.`,
    ``,
    `Follow these steps in order:`,
    ``,
    `1. Call \`kata_derive_state\` (no arguments) to confirm the active milestone and slice context.`,
    ``,
    `2. Collect all task summaries for this slice:`,
    `   - Call \`kata_list_tasks\` with the slice issue UUID to enumerate all tasks.`,
    `   - For each task, call \`kata_read_document\` with the task summary title (e.g. "T01-SUMMARY") to read its summary.`,
    ``,
    `3. Write the slice summary: call \`kata_write_document\` with title "${sid}-SUMMARY".`,
    `   - Synthesize the work done across all tasks.`,
    `   - Include what was built, key decisions, observability surfaces, and any known issues.`,
    ``,
    `4. Advance the slice to done: call \`kata_update_issue_state({ issueId: "<slice-uuid>", phase: "done" })\`.`,
    `   - Resolve the slice UUID via \`kata_list_slices\` if needed.`,
    ``,
    `**Reference:** Consult \`LINEAR-WORKFLOW.md\` for artifact storage format and phase transition rules.`,
  ].join("\n");
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Select the right prompt builder for the current phase.
 * Returns null for "complete" (stop) or "blocked" (caller handles).
 * Returns null for unrecognised phases — caller should stop auto-mode.
 */
export function selectLinearPrompt(state: KataState): string | null {
  switch (state.phase) {
    case "pre-planning":
      return buildLinearPlanMilestonePrompt(state);
    case "planning":
      return buildLinearPlanSlicePrompt(state);
    case "executing":
    case "verifying":
      return buildLinearExecuteTaskPrompt(state);
    case "summarizing":
      return buildLinearCompleteSlicePrompt(state);
    case "complete":
    case "blocked":
      return null;
    default:
      return null;
  }
}
