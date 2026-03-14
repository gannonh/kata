/**
 * Linear Auto-Mode — State resolution and prompt builders for `/kata auto` in Linear mode.
 *
 * `resolveLinearKataState` mirrors `commands.ts::deriveKataState` but lives here
 * to avoid the circular dependency: commands.ts imports from auto.ts (which
 * would cycle back to commands.ts if auto.ts imported deriveKataState from there).
 *
 * Prompt builders orient the agent for each workflow phase and instruct it to use
 * `kata_read_document` / `kata_write_document` for all artifact I/O.
 *
 * IMPORTANT: In Linear mode, the orchestrator cannot inline document content into
 * prompts (content lives in the Linear API). Instead, builders emit explicit
 * `kata_read_document` instructions that the agent executes at runtime.
 * The DOCUMENT MANIFEST (which docs to read, required vs optional) is declared
 * in phase-recipes.ts and must match auto.ts file-backed builders exactly.
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

// ─── Shared Preamble ──────────────────────────────────────────────────────────

const HARD_RULE = `Hard rule: In Linear mode, never use bash/read/find/rg/git to locate workflow artifacts. Use only kata_read_document/kata_write_document for plan and summary artifacts. Always specify { projectId } scope.`;

const REFERENCE = `**Reference:** Consult \`KATA-WORKFLOW.md\` (injected into your system prompt) for full operation steps, entity conventions, artifact storage format, and phase transition rules.`;

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
    return blockedState(["LINEAR_API_KEY is not set"], "Set LINEAR_API_KEY to use Linear mode.");
  }

  const { projectId } = config.linear;
  if (!projectId) {
    return blockedState(
      ["Linear project not configured — set linear.projectId in .kata/preferences.md."],
      "Run /kata prefs project to configure the Linear project.",
    );
  }

  try {
    const client = new LinearClient(apiKey);
    const teamResolution = await resolveConfiguredLinearTeamId(client);
    if (!teamResolution.teamId) {
      return blockedState(
        [teamResolution.error ?? "Linear team could not be resolved."],
        "Fix linear.teamId or linear.teamKey in preferences.",
      );
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
    return blockedState(
      [`Linear API error: ${message}`],
      "Check LINEAR_API_KEY and Linear project config, then retry.",
    );
  }
}

function blockedState(blockers: string[], nextAction: string): KataState {
  return {
    phase: "blocked",
    activeMilestone: null,
    activeSlice: null,
    activeTask: null,
    blockers,
    recentDecisions: [],
    nextAction,
    registry: [],
    progress: { milestones: { done: 0, total: 0 } },
  };
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/**
 * Research-milestone prompt (pre-planning, no research exists yet).
 * Recipe reads: ${mid}-CONTEXT (required), PROJECT, REQUIREMENTS, DECISIONS (optional)
 * Recipe writes: ${mid}-RESEARCH
 */
export function buildLinearResearchMilestonePrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const mTitle = state.activeMilestone?.title ?? "unknown";

  return [
    `# Research Milestone — Linear Mode`,
    ``,
    `**Milestone:** ${mid} — ${mTitle}`,
    ``,
    `## Instructions`,
    ``,
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active milestone.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-CONTEXT")\` — **required**. If null, stop: milestone context is missing.`,
    ``,
    `3. Read optional context (skip if null):`,
    `   - \`kata_read_document("PROJECT")\``,
    `   - \`kata_read_document("REQUIREMENTS")\``,
    `   - \`kata_read_document("DECISIONS")\``,
    ``,
    `4. Scout the codebase and relevant docs. Use \`rg\`, \`find\`, \`resolve_library\` / \`get_library_docs\` as needed.`,
    ``,
    `5. Write research findings: \`kata_write_document("${mid}-RESEARCH", content)\``,
    `   - Include: Summary, Don't Hand-Roll table, Common Pitfalls, Relevant Code, Sources.`,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Plan-milestone prompt (phase: pre-planning, research exists).
 * Recipe reads: ${mid}-CONTEXT (required), ${mid}-RESEARCH, PRIOR-MILESTONE-SUMMARY, PROJECT, REQUIREMENTS, DECISIONS (optional)
 * Recipe writes: ${mid}-ROADMAP
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
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active milestone.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-CONTEXT")\` — **required**. If null, stop: milestone context is missing.`,
    ``,
    `3. Read optional context (skip if null):`,
    `   - \`kata_read_document("${mid}-RESEARCH")\``,
    `   - \`kata_read_document("DECISIONS")\``,
    `   - \`kata_read_document("REQUIREMENTS")\``,
    `   - \`kata_read_document("PROJECT")\``,
    ``,
    `4. Idempotency check:`,
    `   - Call \`kata_list_slices\` for the project. If slices already exist for this milestone, do NOT create duplicates.`,
    `   - Call \`kata_read_document("${mid}-ROADMAP")\`. If it already exists, review and advance rather than rewriting.`,
    ``,
    `5. Write the milestone roadmap: \`kata_write_document("${mid}-ROADMAP", content)\``,
    `   - Define slices (S01, S02, ...) ordered by risk — riskiest first.`,
    `   - Each slice: demoable vertical increment with risk level and dependencies.`,
    `   - Include a Boundary Map showing what each slice produces/consumes.`,
    ``,
    `6. Create slice issues in Linear for each slice in the roadmap:`,
    `   - Call \`kata_create_slice\` for each slice.`,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Research-slice prompt (planning phase, no slice research exists yet).
 * Recipe reads: ${mid}-ROADMAP (required), ${mid}-CONTEXT, ${mid}-RESEARCH, DECISIONS, REQUIREMENTS (optional)
 * Recipe writes: ${sid}-RESEARCH
 */
export function buildLinearResearchSlicePrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const sid = state.activeSlice?.id ?? "unknown";
  const sTitle = state.activeSlice?.title ?? "unknown";

  return [
    `# Research Slice — Linear Mode`,
    ``,
    `**Milestone:** ${mid}`,
    `**Slice:** ${sid} — ${sTitle}`,
    ``,
    `## Instructions`,
    ``,
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active milestone and slice.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**. If null, stop: roadmap is missing.`,
    ``,
    `3. Read optional context (skip if null):`,
    `   - \`kata_read_document("${mid}-CONTEXT")\``,
    `   - \`kata_read_document("${mid}-RESEARCH")\``,
    `   - \`kata_read_document("DECISIONS")\``,
    `   - \`kata_read_document("REQUIREMENTS")\``,
    ``,
    `4. Read dependency slice summaries:`,
    `   - Check the roadmap for \`depends:[]\` on this slice.`,
    `   - For each dependency, call \`kata_read_document("Sxx-SUMMARY")\`.`,
    ``,
    `5. Scout the codebase and relevant docs for this slice's scope.`,
    ``,
    `6. Write slice research: \`kata_write_document("${sid}-RESEARCH", content)\``,
    `   - Include: Summary, Don't Hand-Roll, Common Pitfalls, Relevant Code, Sources.`,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Plan-slice prompt (phase: planning).
 * Recipe reads: ${mid}-ROADMAP (required), ${sid}-RESEARCH, DECISIONS, REQUIREMENTS (optional)
 * Recipe writes: ${sid}-PLAN + task sub-issues
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
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active milestone and slice.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**. If null, stop: roadmap is missing.`,
    ``,
    `3. Read optional context (skip if null):`,
    `   - \`kata_read_document("${sid}-RESEARCH")\``,
    `   - \`kata_read_document("DECISIONS")\``,
    `   - \`kata_read_document("REQUIREMENTS")\``,
    ``,
    `4. Read dependency slice summaries:`,
    `   - Check the roadmap for \`depends:[]\` on this slice.`,
    `   - For each dependency, call \`kata_read_document("Sxx-SUMMARY")\`.`,
    ``,
    `5. Idempotency check:`,
    `   - Call \`kata_read_document("${sid}-PLAN")\`. If it exists, review rather than rewrite.`,
    `   - Call \`kata_list_tasks\` for the slice issue. If tasks exist, do NOT create duplicates.`,
    ``,
    `6. Write the slice plan: \`kata_write_document("${sid}-PLAN", content)\``,
    `   - Decompose into 1-7 tasks, each fitting one context window.`,
    `   - Each task: title, must-haves (truths, artifacts, key links), steps.`,
    ``,
    `7. Create task sub-issues: call \`kata_create_task\` for each task (T01, T02, ...).`,
    `   - Write individual task plans: \`kata_write_document("T01-PLAN", content)\` for each task.`,
    ``,
    `8. Advance the slice to executing: \`kata_update_issue_state({ issueId: "<slice-uuid>", phase: "executing" })\``,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Execute-task prompt (phases: executing, verifying).
 * Recipe reads: ${tid}-PLAN (required), ${sid}-PLAN (optional excerpt)
 * Recipe writes: ${tid}-SUMMARY
 * Recipe flags: injectPriorSummaries, checkContinue
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
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active milestone, slice, and task.`,
    ``,
    `2. Read the task plan:`,
    `   - Call \`kata_read_document("${tid}-PLAN")\` — **required**. If null, stop: task plan is missing. Planning phase did not complete correctly.`,
    ``,
    `3. Read optional slice context:`,
    `   - Call \`kata_read_document("${sid}-PLAN")\` for slice-level goal, demo, and verification criteria.`,
    ``,
    `4. Carry-forward from prior tasks:`,
    `   - Call \`kata_list_tasks\` with the slice issue UUID.`,
    `   - For each completed prior task, call \`kata_read_document("Txx-SUMMARY")\` to understand what's already built.`,
    ``,
    `5. Check for partial progress:`,
    `   - Call \`kata_read_document("${tid}-SUMMARY")\`. If it exists with partial content, resume from where it left off.`,
    ``,
    `6. Execute the task as specified in the plan. Build real implementation — no stubs.`,
    ``,
    `7. If you make an architectural decision, append it to the \`DECISIONS\` document:`,
    `   - Read current: \`kata_read_document("DECISIONS")\``,
    `   - Append and write: \`kata_write_document("DECISIONS", updatedContent)\``,
    ``,
    `8. Write the task summary: \`kata_write_document("${tid}-SUMMARY", content)\``,
    `   - Include: what shipped (one-liner), what happened, deviations, files modified, verification result.`,
    ``,
    `9. Advance the task to done: \`kata_update_issue_state({ issueId: "<task-uuid>", phase: "done" })\``,
    `   - Resolve the task UUID via \`kata_list_tasks\` if needed.`,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Complete-slice prompt (phase: summarizing).
 * Recipe reads: ${mid}-ROADMAP (required), ${sid}-PLAN (required), REQUIREMENTS (optional)
 * Recipe writes: ${sid}-SUMMARY, ${sid}-UAT
 * Recipe flags: injectPriorSummaries (all task summaries)
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
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active milestone and slice.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**. Needed for success criteria and boundary map.`,
    `   - Call \`kata_read_document("${sid}-PLAN")\` — **required**. Needed for slice must-haves and verification criteria.`,
    ``,
    `3. Read optional context:`,
    `   - \`kata_read_document("REQUIREMENTS")\``,
    ``,
    `4. Collect all task summaries:`,
    `   - Call \`kata_list_tasks\` with the slice issue UUID.`,
    `   - For each task, call \`kata_read_document("Txx-SUMMARY")\`.`,
    ``,
    `5. Write the slice summary: \`kata_write_document("${sid}-SUMMARY", content)\``,
    `   - Synthesize work across all tasks: what was built, key decisions, key files, patterns established.`,
    `   - Review task summaries for key_decisions and ensure significant ones are in the DECISIONS document.`,
    ``,
    `6. Write the UAT script: \`kata_write_document("${sid}-UAT", content)\``,
    `   - Derive from the slice's must-haves and demo sentence.`,
    `   - Non-blocking — the agent does NOT wait for UAT results.`,
    ``,
    `7. Advance the slice to done: \`kata_update_issue_state({ issueId: "<slice-uuid>", phase: "done" })\``,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Complete-milestone prompt (phase: completing-milestone).
 * Recipe reads: ${mid}-ROADMAP (required), Sxx-SUMMARY (via iteration), REQUIREMENTS, DECISIONS, PROJECT, ${mid}-CONTEXT (optional)
 * Recipe writes: ${mid}-SUMMARY
 */
export function buildLinearCompleteMilestonePrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const mTitle = state.activeMilestone?.title ?? "unknown";

  return [
    `# Complete Milestone — Linear Mode`,
    ``,
    `**Milestone:** ${mid} — ${mTitle}`,
    ``,
    `## Instructions`,
    ``,
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm all slices are complete.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**.`,
    ``,
    `3. Read all slice summaries:`,
    `   - Call \`kata_list_slices\` to enumerate all slices in this milestone.`,
    `   - For each slice, call \`kata_read_document("Sxx-SUMMARY")\`.`,
    ``,
    `4. Read optional context:`,
    `   - \`kata_read_document("REQUIREMENTS")\``,
    `   - \`kata_read_document("DECISIONS")\``,
    `   - \`kata_read_document("PROJECT")\``,
    `   - \`kata_read_document("${mid}-CONTEXT")\``,
    ``,
    `5. Write the milestone summary: \`kata_write_document("${mid}-SUMMARY", content)\``,
    `   - Compress all slice summaries into a milestone-level narrative.`,
    `   - Include: what the milestone delivered, key decisions, architectural patterns, files modified.`,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Replan-slice prompt (phase: replanning-slice).
 * Recipe reads: ${mid}-ROADMAP (required), ${sid}-PLAN (required), DECISIONS (optional)
 * Recipe writes: ${sid}-REPLAN
 */
export function buildLinearReplanSlicePrompt(state: KataState): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const sid = state.activeSlice?.id ?? "unknown";
  const sTitle = state.activeSlice?.title ?? "unknown";

  return [
    `# Replan Slice — Linear Mode`,
    ``,
    `**Milestone:** ${mid}`,
    `**Slice:** ${sid} — ${sTitle}`,
    ``,
    `## Instructions`,
    ``,
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active slice context.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**.`,
    `   - Call \`kata_read_document("${sid}-PLAN")\` — **required**.`,
    ``,
    `3. Read optional context:`,
    `   - \`kata_read_document("DECISIONS")\``,
    ``,
    `4. Find the blocker:`,
    `   - Call \`kata_list_tasks\` for the slice.`,
    `   - Read task summaries to find which task discovered the blocker.`,
    ``,
    `5. Write the replan: \`kata_write_document("${sid}-REPLAN", content)\``,
    `   - Describe the blocker, its impact, and the revised task decomposition.`,
    `   - Create new task sub-issues if needed via \`kata_create_task\`.`,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Reassess-roadmap prompt (after slice completion).
 * Recipe reads: ${mid}-ROADMAP (required), ${completedSid}-SUMMARY (required), PROJECT, REQUIREMENTS, DECISIONS (optional)
 * Recipe writes: ${completedSid}-ASSESSMENT
 */
export function buildLinearReassessRoadmapPrompt(state: KataState, completedSliceId: string): string {
  const mid = state.activeMilestone?.id ?? "unknown";
  const mTitle = state.activeMilestone?.title ?? "unknown";

  return [
    `# Reassess Roadmap — Linear Mode`,
    ``,
    `**Milestone:** ${mid} — ${mTitle}`,
    `**Completed Slice:** ${completedSliceId}`,
    ``,
    `## Instructions`,
    ``,
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm the active milestone.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**.`,
    `   - Call \`kata_read_document("${completedSliceId}-SUMMARY")\` — **required**.`,
    ``,
    `3. Read optional context:`,
    `   - \`kata_read_document("PROJECT")\``,
    `   - \`kata_read_document("REQUIREMENTS")\``,
    `   - \`kata_read_document("DECISIONS")\``,
    ``,
    `4. Assess whether the roadmap needs changes based on what was learned during the completed slice.`,
    ``,
    `5. Write the assessment: \`kata_write_document("${completedSliceId}-ASSESSMENT", content)\``,
    `   - Include: what changed, what's confirmed, any new risks or scope adjustments.`,
    `   - If the roadmap needs updating, update it via \`kata_write_document("${mid}-ROADMAP", ...)\`.`,
    ``,
    REFERENCE,
  ].join("\n");
}

/**
 * Run-UAT prompt (after slice completion, UAT file exists).
 * Recipe reads: ${sid}-UAT (required), ${sid}-SUMMARY (optional), PROJECT (optional)
 * Recipe writes: ${sid}-UAT-RESULT
 */
export function buildLinearRunUatPrompt(state: KataState, sliceId: string): string {
  const mid = state.activeMilestone?.id ?? "unknown";

  return [
    `# Run UAT — Linear Mode`,
    ``,
    `**Milestone:** ${mid}`,
    `**Slice:** ${sliceId}`,
    ``,
    `## Instructions`,
    ``,
    HARD_RULE,
    ``,
    `1. Call \`kata_derive_state\` to confirm context.`,
    ``,
    `2. Read required context:`,
    `   - Call \`kata_read_document("${sliceId}-UAT")\` — **required**. Contains the test script.`,
    ``,
    `3. Read optional context:`,
    `   - \`kata_read_document("${sliceId}-SUMMARY")\``,
    `   - \`kata_read_document("PROJECT")\``,
    ``,
    `4. Execute the UAT test script. Verify each acceptance criterion.`,
    ``,
    `5. Write the UAT result: \`kata_write_document("${sliceId}-UAT-RESULT", content)\``,
    `   - Include: pass/fail for each criterion, evidence, any issues found.`,
    ``,
    REFERENCE,
  ].join("\n");
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Select the right prompt builder for the current phase.
 * Returns null for "complete" (stop) or "blocked" (caller handles).
 * Returns null for unrecognised phases — caller should stop auto-mode.
 *
 * Note: research-milestone vs plan-milestone routing and reassess/UAT checks
 * are dispatch-time routing decisions handled by the caller (auto.ts
 * dispatchNextUnit), not by this function. This function maps the final
 * determined phase to the correct prompt builder.
 */
export function selectLinearPrompt(
  state: KataState,
  options?: {
    /** Override: dispatch research-milestone instead of plan-milestone */
    dispatchResearch?: "milestone" | "slice";
    /** Override: dispatch reassess-roadmap for this completed slice */
    reassessSliceId?: string;
    /** Override: dispatch run-uat for this slice */
    uatSliceId?: string;
  },
): string | null {
  // Dispatch-time overrides take priority
  if (options?.uatSliceId) {
    return buildLinearRunUatPrompt(state, options.uatSliceId);
  }
  if (options?.reassessSliceId) {
    return buildLinearReassessRoadmapPrompt(state, options.reassessSliceId);
  }
  if (options?.dispatchResearch === "milestone") {
    return buildLinearResearchMilestonePrompt(state);
  }
  if (options?.dispatchResearch === "slice") {
    return buildLinearResearchSlicePrompt(state);
  }

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
    case "completing-milestone":
      return buildLinearCompleteMilestonePrompt(state);
    case "replanning-slice":
      return buildLinearReplanSlicePrompt(state);
    case "complete":
    case "blocked":
      return null;
    default:
      return null;
  }
}
