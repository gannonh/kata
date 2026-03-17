/**
 * LinearBackend — Linear API-based KataBackend implementation.
 *
 * Delegates state derivation to deriveLinearState, document I/O to
 * the linear-documents module, and git operations to local exec.
 */

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
  KataBackend,
  DocumentScope,
  PromptOptions,
  DashboardData,
  PrContext,
  OpsBlock,
} from "./backend.js";
import type { KataState, Phase } from "./types.js";

import { LinearClient } from "../linear/linear-client.js";
import { deriveLinearState } from "../linear/linear-state.js";
import {
  readKataDocument,
  writeKataDocument,
  listKataDocuments,
} from "../linear/linear-documents.js";
import { listKataSlices, parseKataEntityTitle } from "../linear/linear-entities.js";
import type { DocumentAttachment } from "../linear/linear-types.js";
import { ensureGitignore } from "./gitignore.js";
import { loadPrompt } from "./prompt-loader.js";
import { resolveGitRoot, ensureGitRepo } from "./git-utils.js";

// ─── Prompt Constants ─────────────────────────────────────────────────────────

const HARD_RULE = `Hard rule: In Linear mode, never use bash/read/find/rg/git to locate workflow artifacts. Use only kata_read_document/kata_write_document for plan and summary artifacts. Scope: milestone-level docs (ROADMAP, CONTEXT, SUMMARY, DECISIONS) use { projectId }. Task-level docs (T01-PLAN, T01-SUMMARY) use { issueId } scoped to the slice issue — this prevents collisions when multiple slices have a T01.`;

const REFERENCE = `**Reference:** Consult \`KATA-WORKFLOW.md\` (injected into your system prompt) for full operation steps, entity conventions, artifact storage format, and phase transition rules.`;

const DISCOVER_PROJECT_DOCS = [
  `   - Call \`kata_list_documents({ projectId })\` to inventory existing project-level documents.`,
  `   - Use the result to know which optional reads will succeed vs return null.`,
].join("\n");

const DISCOVER_SLICE_DOCS = [
  `   - For slice-scoped documents, also call \`kata_list_documents({ issueId: "<slice-issue-uuid>" })\`.`,
].join("\n");

// ─── Config ──────────────────────────────────────────────────────────────────

export interface LinearBackendConfig {
  apiKey: string;
  projectId: string;
  teamId: string;
  sliceLabelId: string;
}

// ─── LinearBackend ───────────────────────────────────────────────────────────

export class LinearBackend implements KataBackend {
  readonly basePath: string;
  readonly gitRoot: string;
  private client: LinearClient;
  private config: LinearBackendConfig;

  /** Cached state with TTL to avoid redundant API calls from dashboard polling. */
  private stateCache: { state: KataState; timestamp: number } | null = null;
  private static STATE_CACHE_TTL_MS = 10_000; // 10 seconds

  constructor(basePath: string, config: LinearBackendConfig) {
    this.basePath = basePath;
    this.config = config;
    this.client = new LinearClient(config.apiKey);
    this.gitRoot = resolveGitRoot(basePath);
  }

  // ── State ─────────────────────────────────────────────────────────────

  async deriveState(): Promise<KataState> {
    // Return cached state if fresh (avoids redundant API calls from dashboard + dispatch)
    if (this.stateCache && Date.now() - this.stateCache.timestamp < LinearBackend.STATE_CACHE_TTL_MS) {
      return this.stateCache.state;
    }
    const state = await deriveLinearState(this.client, {
      projectId: this.config.projectId,
      teamId: this.config.teamId,
      sliceLabelId: this.config.sliceLabelId,
      basePath: this.basePath,
    });
    this.stateCache = { state, timestamp: Date.now() };
    return state;
  }

  /** Invalidate the state cache (call after state-changing operations). */
  invalidateStateCache(): void {
    this.stateCache = null;
  }

  // ── Document I/O ──────────────────────────────────────────────────────

  private resolveAttachment(scope?: DocumentScope): DocumentAttachment {
    if (scope) return scope;
    return { projectId: this.config.projectId };
  }

  async readDocument(name: string, scope?: DocumentScope): Promise<string | null> {
    const doc = await readKataDocument(
      this.client,
      name,
      this.resolveAttachment(scope),
    );
    return doc?.content ?? null;
  }

  async writeDocument(name: string, content: string, scope?: DocumentScope): Promise<void> {
    await writeKataDocument(
      this.client,
      name,
      content,
      this.resolveAttachment(scope),
    );
  }

  async documentExists(name: string, scope?: DocumentScope): Promise<boolean> {
    const content = await this.readDocument(name, scope);
    return content != null && content.length > 0;
  }

  async listDocuments(scope?: DocumentScope): Promise<string[]> {
    const docs = await listKataDocuments(
      this.client,
      this.resolveAttachment(scope),
    );
    return docs.map((d) => d.title);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async bootstrap(): Promise<void> {
    ensureGitRepo(this.basePath, this.gitRoot);
    ensureGitignore(this.gitRoot);

    // Ensure .kata/ directory exists (in basePath, not gitRoot)
    const kataDir = join(this.basePath, ".kata");
    mkdirSync(kataDir, { recursive: true });
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const state = await this.deriveState();
    return state.activeMilestone?.id === milestoneId;
  }

  async loadDashboardData(): Promise<DashboardData> {
    const state = await this.deriveState();
    const sliceViews: import("./backend.js").DashboardSliceView[] = [];

    // Fetch all slices for the current milestone so completed slices remain
    // visible in the dashboard and available for PR title resolution.
    try {
      const allSlices = await listKataSlices(this.client, this.config.projectId, this.config.sliceLabelId);
      const activeSliceId = state.activeSlice?.id;

      for (const issue of allSlices) {
        const parsed = parseKataEntityTitle(issue.title);
        const sliceKataId = parsed?.kataId ?? issue.identifier;
        const sliceTitle = parsed?.title ?? issue.title;
        const isDone = issue.state.type === "completed" || issue.state.type === "canceled";
        const isActive = sliceKataId === activeSliceId || issue.identifier === activeSliceId;

        const sv: import("./backend.js").DashboardSliceView = {
          id: sliceKataId,
          title: sliceTitle,
          done: isDone,
          risk: "",
          active: isActive,
          tasks: [],
        };

        // Add task progress for the active slice from the derived state
        if (isActive) {
          const taskDone = state.progress?.tasks?.done ?? 0;
          const taskTotal = state.progress?.tasks?.total ?? 0;
          if (taskTotal > 0) {
            sv.taskProgress = { done: taskDone, total: taskTotal };
            if (state.activeTask) {
              sv.tasks.push({
                id: state.activeTask.id,
                title: state.activeTask.title,
                done: false,
                active: true,
              });
            }
          }
        }

        sliceViews.push(sv);
      }
    } catch {
      // API failure — fall back to active-only view so dashboard still renders
      if (state.activeSlice) {
        const taskDone = state.progress?.tasks?.done ?? 0;
        const taskTotal = state.progress?.tasks?.total ?? 0;
        const sv: import("./backend.js").DashboardSliceView = {
          id: state.activeSlice.id,
          title: state.activeSlice.title,
          done: false,
          risk: "",
          active: true,
          tasks: [],
        };
        if (taskTotal > 0) {
          sv.taskProgress = { done: taskDone, total: taskTotal };
          if (state.activeTask) {
            sv.tasks.push({
              id: state.activeTask.id,
              title: state.activeTask.title,
              done: false,
              active: true,
            });
          }
        }
        sliceViews.push(sv);
      }
    }

    return {
      state,
      sliceProgress: state.progress?.slices ?? null,
      taskProgress: state.progress?.tasks ?? null,
      sliceViews,
    };
  }

  async preparePrContext(milestoneId: string, sliceId: string): Promise<PrContext> {
    const branch = `kata/${milestoneId}/${sliceId}`;
    const cwd = this.gitRoot;
    // Check if already on the target branch
    const current = execSync("git branch --show-current", { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (current !== branch) {
      execSync(`git branch -f ${branch} HEAD`, { cwd, stdio: "pipe" });
      execSync(`git checkout ${branch}`, { cwd, stdio: "pipe" });
    }
    execSync(`git push -u origin ${branch}`, { cwd, stdio: "pipe" });

    const documents: Record<string, string> = {};
    const plan = await this.readDocument(`${sliceId}-PLAN`);
    if (plan) documents["PLAN"] = plan;
    const summary = await this.readDocument(`${sliceId}-SUMMARY`);
    if (summary) documents["SUMMARY"] = summary;

    return { branch, documents };
  }

  // ── Prompt Builders ──────────────────────────────────────────────────

  async buildPrompt(
    phase: Phase,
    state: KataState,
    options?: PromptOptions,
  ): Promise<string> {
    // Dispatch-time overrides take priority
    if (options?.uatSliceId) return this._buildRunUatPrompt(state, options.uatSliceId);
    if (options?.reassessSliceId) return this._buildReassessRoadmapPrompt(state, options.reassessSliceId);
    if (options?.dispatchResearch === "milestone") return this._buildResearchMilestonePrompt(state);
    if (options?.dispatchResearch === "slice") return this._buildResearchSlicePrompt(state);

    switch (phase) {
      case "pre-planning": return this._buildPlanMilestonePrompt(state);
      case "planning": return this._buildPlanSlicePrompt(state);
      case "executing":
      case "verifying": return this._buildExecuteTaskPrompt(state);
      case "summarizing": return this._buildCompleteSlicePrompt(state);
      case "completing-milestone": return this._buildCompleteMilestonePrompt(state);
      case "replanning-slice": return this._buildReplanSlicePrompt(state);
      default: return "";
    }
  }

  buildDiscussPrompt(nextId: string, preamble: string): string {
    return loadPrompt("discuss-linear", { milestoneId: nextId, preamble });
  }

  // ── Private Prompt Builders ─────────────────────────────────────────

  private _buildResearchMilestonePrompt(state: KataState): string {
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
      `1. Call \`kata_derive_state\` to confirm the active milestone and obtain \`projectId\`.`,
      ``,
      `2. Discover available documents:`,
      DISCOVER_PROJECT_DOCS,
      ``,
      `3. Read required context:`,
      `   - Call \`kata_read_document("${mid}-CONTEXT")\` — **required**. If null, stop: milestone context is missing.`,
      ``,
      `4. Read optional context (skip if null):`,
      `   - \`kata_read_document("PROJECT")\``,
      `   - \`kata_read_document("REQUIREMENTS")\``,
      `   - \`kata_read_document("DECISIONS")\``,
      ``,
      `5. Scout the codebase and relevant docs. Use \`rg\`, \`find\`, \`resolve_library\` / \`get_library_docs\` as needed.`,
      ``,
      `6. Write research findings: \`kata_write_document("${mid}-RESEARCH", content)\``,
      `   - Include: Summary, Don't Hand-Roll table, Common Pitfalls, Relevant Code, Sources.`,
      ``,
      REFERENCE,
    ].join("\n");
  }

  private _buildPlanMilestonePrompt(state: KataState): string {
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
      `1. Call \`kata_derive_state\` to confirm the active milestone and obtain \`projectId\`.`,
      ``,
      `2. Discover available documents:`,
      DISCOVER_PROJECT_DOCS,
      ``,
      `3. Read required context:`,
      `   - Call \`kata_read_document("${mid}-CONTEXT")\` — **required**. If null, stop: milestone context is missing.`,
      ``,
      `4. Read optional context (skip if null):`,
      `   - \`kata_read_document("${mid}-RESEARCH")\``,
      `   - \`kata_read_document("DECISIONS")\``,
      `   - \`kata_read_document("REQUIREMENTS")\``,
      `   - \`kata_read_document("PROJECT")\``,
      ``,
      `5. Idempotency check:`,
      `   - Call \`kata_list_slices\` for the project. If slices already exist for this milestone, do NOT create duplicates.`,
      `   - Call \`kata_read_document("${mid}-ROADMAP")\`. If it already exists, review and advance rather than rewriting.`,
      ``,
      `6. Write the milestone roadmap: \`kata_write_document("${mid}-ROADMAP", content)\``,
      `   - Define slices (S01, S02, ...) ordered by risk — riskiest first.`,
      `   - Each slice: demoable vertical increment with risk level and dependencies.`,
      `   - Include a Boundary Map showing what each slice produces/consumes.`,
      ``,
      `7. Create slice issues in Linear for each slice in the roadmap:`,
      `   - Call \`kata_create_slice\` for each slice.`,
      ``,
      REFERENCE,
    ].join("\n");
  }

  private _buildResearchSlicePrompt(state: KataState): string {
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
      `1. Call \`kata_derive_state\` to confirm the active milestone and slice, and obtain \`projectId\`.`,
      ``,
      `2. Discover available documents:`,
      DISCOVER_PROJECT_DOCS,
      ``,
      `3. Read required context:`,
      `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**. If null, stop: roadmap is missing.`,
      ``,
      `4. Read optional context (skip if null):`,
      `   - \`kata_read_document("${mid}-CONTEXT")\``,
      `   - \`kata_read_document("${mid}-RESEARCH")\``,
      `   - \`kata_read_document("DECISIONS")\``,
      `   - \`kata_read_document("REQUIREMENTS")\``,
      ``,
      `5. Read dependency slice summaries:`,
      `   - Check the roadmap for \`depends:[]\` on this slice.`,
      `   - For each dependency, call \`kata_read_document("Sxx-SUMMARY")\`.`,
      ``,
      `6. Scout the codebase and relevant docs for this slice's scope.`,
      ``,
      `7. Write slice research: \`kata_write_document("${sid}-RESEARCH", content)\``,
      `   - Include: Summary, Don't Hand-Roll, Common Pitfalls, Relevant Code, Sources.`,
      ``,
      REFERENCE,
    ].join("\n");
  }

  private _buildPlanSlicePrompt(state: KataState): string {
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
      `1. Call \`kata_derive_state\` to confirm the active milestone and slice, and obtain \`projectId\`.`,
      ``,
      `2. Discover available documents:`,
      DISCOVER_PROJECT_DOCS,
      ``,
      `3. Read required context:`,
      `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**. If null, stop: roadmap is missing.`,
      ``,
      `4. Read optional context (skip if null):`,
      `   - \`kata_read_document("${sid}-RESEARCH")\``,
      `   - \`kata_read_document("DECISIONS")\``,
      `   - \`kata_read_document("REQUIREMENTS")\``,
      ``,
      `5. Read dependency slice summaries:`,
      `   - Check the roadmap for \`depends:[]\` on this slice.`,
      `   - For each dependency, call \`kata_read_document("Sxx-SUMMARY")\`.`,
      ``,
      `6. Idempotency check:`,
      `   - Call \`kata_read_document("${sid}-PLAN")\`. If it exists, review rather than rewrite.`,
      `   - Call \`kata_list_tasks\` for the slice issue. If tasks exist, do NOT create duplicates.`,
      ``,
      `7. Write the slice plan: \`kata_write_document("${sid}-PLAN", content)\``,
      `   - Decompose into 1-7 tasks, each fitting one context window.`,
      `   - Each task: title, must-haves (truths, artifacts, key links), steps.`,
      ``,
      `8. Create task sub-issues: call \`kata_create_task\` for each task (T01, T02, ...).`,
      `   - Write individual task plans: \`kata_write_document("T01-PLAN", content, { issueId: "<slice-issue-uuid>" })\` for each task.`,
      `   - Task docs MUST use { issueId } scoped to the slice issue, NOT { projectId }. This prevents T01-PLAN collisions across slices.`,
      ``,
      `9. Advance the slice to executing: \`kata_update_issue_state({ issueId: "<slice-uuid>", phase: "executing" })\``,
      ``,
      REFERENCE,
    ].join("\n");
  }

  private _buildExecuteTaskPrompt(state: KataState): string {
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
      `1. Call \`kata_derive_state\` to confirm the active milestone, slice, and task. Obtain \`projectId\`.`,
      ``,
      `2. Discover available documents:`,
      DISCOVER_PROJECT_DOCS,
      DISCOVER_SLICE_DOCS,
      ``,
      `3. Read the task plan (scoped to the slice issue, NOT the project):`,
      `   - Call \`kata_read_document("${tid}-PLAN", { issueId: "<slice-issue-uuid>" })\` — **required**. If null, stop: task plan is missing.`,
      `   - Get the slice issue UUID from \`kata_derive_state\` → \`activeSlice\` or from \`kata_list_slices\`.`,
      ``,
      `4. Read optional slice context:`,
      `   - Call \`kata_read_document("${sid}-PLAN", { projectId })\` for slice-level goal, demo, and verification criteria.`,
      ``,
      `5. Carry-forward from prior tasks:`,
      `   - Call \`kata_list_tasks\` with the slice issue UUID.`,
      `   - For each completed prior task, call \`kata_read_document("Txx-SUMMARY", { issueId: "<slice-issue-uuid>" })\` to understand what's already built.`,
      ``,
      `6. Check for partial progress:`,
      `   - Call \`kata_read_document("${tid}-SUMMARY", { issueId: "<slice-issue-uuid>" })\`. If it exists with partial content, resume from where it left off.`,
      ``,
      `7. Execute the task as specified in the plan. Build real implementation — no stubs.`,
      ``,
      `8. If you make an architectural decision, append it to the \`DECISIONS\` document:`,
      `   - Read current: \`kata_read_document("DECISIONS")\``,
      `   - Append and write: \`kata_write_document("DECISIONS", updatedContent)\``,
      ``,
      `9. Commit your work:`,
      `   - Stage all changed files: \`git add -A\``,
      `   - Commit with message: \`feat(${sid}/${tid}): <short description of what was built>\``,
      `   - Do NOT push. Do NOT advance the slice — only advance the task.`,
      ``,
      `10. Write the task summary (scoped to slice issue): \`kata_write_document("${tid}-SUMMARY", content, { issueId: "<slice-issue-uuid>" })\``,
      `   - Include: what shipped (one-liner), what happened, deviations, files modified, verification result.`,
      ``,
      `11. Advance the task to done: \`kata_update_issue_state({ issueId: "<task-uuid>", phase: "done" })\``,
      `   - Resolve the task UUID via \`kata_list_tasks\` if needed.`,
      `   - Do NOT advance the slice to done. The orchestrator handles slice completion.`,
      ``,
      REFERENCE,
    ].join("\n");
  }

  private _buildCompleteSlicePrompt(state: KataState): string {
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
      `1. Call \`kata_derive_state\` to confirm the active milestone and slice. Obtain \`projectId\`.`,
      ``,
      `2. Discover available documents:`,
      DISCOVER_PROJECT_DOCS,
      DISCOVER_SLICE_DOCS,
      ``,
      `3. Read required context:`,
      `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**. Needed for success criteria and boundary map.`,
      `   - Call \`kata_read_document("${sid}-PLAN")\` — **required**. Needed for slice must-haves and verification criteria.`,
      ``,
      `4. Read optional context:`,
      `   - \`kata_read_document("REQUIREMENTS")\``,
      ``,
      `5. Collect all task summaries (scoped to slice issue):`,
      `   - Call \`kata_list_tasks\` with the slice issue UUID.`,
      `   - For each task, call \`kata_read_document("Txx-SUMMARY", { issueId: "<slice-issue-uuid>" })\`.`,
      ``,
      `6. Write the slice summary: \`kata_write_document("${sid}-SUMMARY", content)\``,
      `   - Synthesize work across all tasks: what was built, key decisions, key files, patterns established.`,
      `   - Review task summaries for key_decisions and ensure significant ones are in the DECISIONS document.`,
      ``,
      `7. Write the UAT script: \`kata_write_document("${sid}-UAT", content)\``,
      `   - Derive from the slice's must-haves and demo sentence.`,
      `   - Non-blocking — the agent does NOT wait for UAT results.`,
      ``,
      `8. Commit any remaining uncommitted work:`,
      `   - Stage all changed files: \`git add -A\``,
      `   - Commit with message: \`feat(${sid}): complete slice — ${sTitle}\``,
      `   - Do NOT push.`,
      ``,
      `9. Advance the slice to done: \`kata_update_issue_state({ issueId: "<slice-uuid>", phase: "done" })\``,
      ``,
      REFERENCE,
    ].join("\n");
  }

  private _buildCompleteMilestoneOps(state: KataState): OpsBlock {
    const mid = state.activeMilestone?.id ?? "unknown";

    const backendOps = [
      `5. Write the milestone summary: \`kata_write_document("${mid}-SUMMARY", content)\``,
      `   - Fill all frontmatter fields and narrative sections. The \`requirement_outcomes\` field must list every requirement that changed status with \`from_status\`, \`to_status\`, and \`proof\`.`,
      `6. Update requirements: \`kata_write_document("REQUIREMENTS", content)\` if any requirement status transitions were validated in step 4.`,
      `7. Update project doc: \`kata_write_document("PROJECT", content)\` to reflect milestone completion and current project state.`,
      `8. Commit all remaining uncommitted work:`,
      `   - Stage all changed files: \`git add -A\``,
      `   - Commit with message: \`feat(kata): complete ${mid}\``,
      `   - Do NOT push.`,
    ].join("\n");

    return {
      backendRules: HARD_RULE,
      backendOps,
      backendMustComplete: `**You MUST write the \`${mid}-SUMMARY\` document AND update PROJECT before finishing.**\n\n${REFERENCE}`,
    };
  }

  private _buildCompleteMilestonePrompt(state: KataState): string {
    const mid = state.activeMilestone?.id ?? "unknown";
    const mTitle = state.activeMilestone?.title ?? "unknown";

    // LinearBackend does not pre-fetch: the agent reads docs via tool calls.
    // Build inlinedContext as fetch instructions (steps the agent must run first).
    const inlinedContext = [
      `## Context Retrieval (read these before proceeding)`,
      ``,
      `1. Call \`kata_derive_state\` to confirm all slices are complete. Obtain \`projectId\`.`,
      ``,
      `2. Discover available documents:`,
      DISCOVER_PROJECT_DOCS,
      ``,
      `3. Read required context:`,
      `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**.`,
      ``,
      `4. Read all slice summaries:`,
      `   - Call \`kata_list_slices\` to enumerate all slices in this milestone.`,
      `   - For each slice, call \`kata_read_document("Sxx-SUMMARY")\`.`,
      ``,
      `5. Read optional context:`,
      `   - \`kata_read_document("REQUIREMENTS")\``,
      `   - \`kata_read_document("DECISIONS")\``,
      `   - \`kata_read_document("PROJECT")\``,
      `   - \`kata_read_document("${mid}-CONTEXT")\``,
    ].join("\n");

    const ops = this._buildCompleteMilestoneOps(state);

    return loadPrompt("complete-milestone", {
      milestoneId: mid,
      milestoneTitle: mTitle,
      roadmapPath: `${mid}-ROADMAP (Linear document)`,
      inlinedContext,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  private _buildReplanSliceOps(state: KataState): OpsBlock {
    const sid = state.activeSlice?.id ?? "unknown";

    const backendOps = [
      `3. Find the blocker:`,
      `   - Call \`kata_list_tasks\` for the slice.`,
      `   - Read task summaries to find which task discovered the blocker.`,
      `4. Write the replan: \`kata_write_document("${sid}-REPLAN", content)\``,
      `   - Describe the blocker, its impact, and the revised task decomposition.`,
      `5. Rewrite the slice plan: \`kata_write_document("${sid}-PLAN", content)\``,
      `   - Keep all \`[x]\` tasks exactly as they were`,
      `   - Update the \`[ ]\` tasks to address the blocker`,
      `   - Create new task sub-issues if needed via \`kata_create_task\``,
    ].join("\n");

    return {
      backendRules: HARD_RULE,
      backendOps,
      backendMustComplete: `**You MUST write the \`${sid}-REPLAN\` document and the updated slice plan before finishing.**\n\n${REFERENCE}`,
    };
  }

  private _buildReplanSlicePrompt(state: KataState): string {
    const mid = state.activeMilestone?.id ?? "unknown";
    const sid = state.activeSlice?.id ?? "unknown";
    const sTitle = state.activeSlice?.title ?? "unknown";

    const inlinedContext = [
      `## Context Retrieval (read these before proceeding)`,
      ``,
      `1. Call \`kata_derive_state\` to confirm the active slice context.`,
      ``,
      `2. Read required context:`,
      `   - Call \`kata_read_document("${mid}-ROADMAP")\` — **required**.`,
      `   - Call \`kata_read_document("${sid}-PLAN")\` — **required**.`,
      ``,
      `3. Read optional context:`,
      `   - \`kata_read_document("DECISIONS")\``,
    ].join("\n");

    const ops = this._buildReplanSliceOps(state);

    return loadPrompt("replan-slice", {
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      inlinedContext,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  private _buildReassessRoadmapPrompt(state: KataState, completedSliceId: string): string {
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

  private _buildRunUatPrompt(state: KataState, sliceId: string): string {
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
}
