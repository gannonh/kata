/**
 * FileBackend — disk-based KataBackend implementation.
 *
 * Reads/writes .kata/ directory structure. State derivation delegates
 * to deriveState(basePath), document I/O resolves names to file paths
 * via the paths module.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
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

import { deriveState } from "./state.js";
import {
  loadFile,
  parseContinue,
  parsePlan,
  parseRoadmap,
  parseSummary,
  extractUatType,
  inlinePriorMilestoneSummary,
} from "./files.js";
import { loadPrompt } from "./prompt-loader.js";
import {
  kataRoot,
  milestonesDir,
  resolveKataRootFile,
  resolveMilestoneFile,
  resolveMilestonePath,
  resolveSliceFile,
  resolveSlicePath,
  resolveTaskFile,
  resolveTasksDir,
  resolveTaskFiles,
  relMilestoneFile,
  relSliceFile,
  relTaskFile,
  relSlicePath,
  relMilestonePath,
  relKataRootFile,
  type KataRootFileKey,
} from "./paths.js";
import { buildSkillDiscoveryVars } from "./preferences.js";
import { ensureGitignore, ensurePreferences } from "./gitignore.js";
import { resolveGitRoot, ensureGitRepo } from "./git-utils.js";
import {
  extractMarkdownSection,
  extractSliceExecutionExcerpt,
  oneLine,
} from "./markdown-utils.js";

// ─── Document name parsing ────────────────────────────────────────────────

const ROOT_DOC_NAMES = new Set<string>([
  "PROJECT",
  "DECISIONS",
  "REQUIREMENTS",
  "QUEUE",
  "STATE",
]);

interface ParsedDocName {
  kind: "root" | "milestone" | "slice" | "task";
  prefix?: string; // M001, S01, T01
  docType: string; // ROADMAP, CONTEXT, PLAN, SUMMARY, etc.
}

function parseDocName(name: string): ParsedDocName {
  // Root docs: PROJECT, DECISIONS, REQUIREMENTS
  if (ROOT_DOC_NAMES.has(name)) {
    return { kind: "root", docType: name };
  }

  // Milestone docs: M001-ROADMAP, M001-CONTEXT
  const milestoneMatch = name.match(/^(M\d+)-(.+)$/);
  if (milestoneMatch) {
    return { kind: "milestone", prefix: milestoneMatch[1], docType: milestoneMatch[2] };
  }

  // Slice docs: S01-PLAN, S01-SUMMARY
  const sliceMatch = name.match(/^(S\d+)-(.+)$/);
  if (sliceMatch) {
    return { kind: "slice", prefix: sliceMatch[1], docType: sliceMatch[2] };
  }

  // Task docs: T01-PLAN, T01-SUMMARY
  const taskMatch = name.match(/^(T\d+)-(.+)$/);
  if (taskMatch) {
    return { kind: "task", prefix: taskMatch[1], docType: taskMatch[2] };
  }

  // Fallback: treat as root doc type
  return { kind: "root", docType: name };
}

// ─── FileBackend ──────────────────────────────────────────────────────────

export class FileBackend implements KataBackend {
  readonly basePath: string;
  readonly gitRoot: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.gitRoot = resolveGitRoot(basePath);
  }

  // ── State ─────────────────────────────────────────────────────────────

  async deriveState(): Promise<KataState> {
    return deriveState(this.basePath);
  }

  // ── Document I/O ──────────────────────────────────────────────────────

  async readDocument(name: string, _scope?: DocumentScope): Promise<string | null> {
    const parsed = parseDocName(name);

    switch (parsed.kind) {
      case "root": {
        const absPath = resolveKataRootFile(this.basePath, parsed.docType as KataRootFileKey);
        return loadFile(absPath);
      }

      case "milestone": {
        const absPath = resolveMilestoneFile(this.basePath, parsed.prefix!, parsed.docType);
        if (!absPath) return null;
        return loadFile(absPath);
      }

      case "slice": {
        // Slice docs need milestone context to resolve the path.
        const state = await this.deriveState();
        const mid = state.activeMilestone?.id;
        if (!mid) return null;
        const absPath = resolveSliceFile(this.basePath, mid, parsed.prefix!, parsed.docType);
        if (!absPath) return null;
        return loadFile(absPath);
      }

      case "task": {
        // Task docs need milestone + slice context.
        const state = await this.deriveState();
        const mid = state.activeMilestone?.id;
        const sid = state.activeSlice?.id;
        if (!mid || !sid) return null;
        const absPath = resolveTaskFile(this.basePath, mid, sid, parsed.prefix!, parsed.docType);
        if (!absPath) return null;
        return loadFile(absPath);
      }

      default:
        return null;
    }
  }

  async writeDocument(_name: string, _content: string, _scope?: DocumentScope): Promise<void> {
    throw new Error("FileBackend.writeDocument is not yet implemented");
  }

  async documentExists(name: string, _scope?: DocumentScope): Promise<boolean> {
    const parsed = parseDocName(name);
    switch (parsed.kind) {
      case "root":
        return existsSync(resolveKataRootFile(this.basePath, parsed.docType as KataRootFileKey));
      case "milestone": {
        const p = resolveMilestoneFile(this.basePath, parsed.prefix!, parsed.docType);
        return p != null;
      }
      case "slice": {
        const state = await this.deriveState();
        const mid = state.activeMilestone?.id;
        if (!mid) return false;
        return resolveSliceFile(this.basePath, mid, parsed.prefix!, parsed.docType) != null;
      }
      case "task": {
        const state = await this.deriveState();
        const mid = state.activeMilestone?.id;
        const sid = state.activeSlice?.id;
        if (!mid || !sid) return false;
        return resolveTaskFile(this.basePath, mid, sid, parsed.prefix!, parsed.docType) != null;
      }
      default:
        return false;
    }
  }

  async listDocuments(_scope?: DocumentScope): Promise<string[]> {
    const state = await this.deriveState();
    const mid = state.activeMilestone?.id;
    if (!mid) return [];

    const mDir = resolveMilestonePath(this.basePath, mid);
    if (!mDir) return [];

    try {
      return readdirSync(mDir)
        .filter((f) => f.endsWith(".md"))
        .sort();
    } catch {
      return [];
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async bootstrap(): Promise<void> {
    const msDir = milestonesDir(this.basePath);

    ensureGitRepo(this.basePath, this.gitRoot);

    // Ensure directory structure
    mkdirSync(msDir, { recursive: true });

    // Ensure gitignore and preferences
    ensureGitignore(this.gitRoot);
    ensurePreferences(this.basePath);

    // Initial commit if no commits exist
    try {
      execSync("git rev-parse HEAD", { cwd: this.gitRoot, stdio: "pipe" });
    } catch {
      execSync("git add -A", { cwd: this.gitRoot, stdio: "pipe" });
      execSync('git commit -m "kata: bootstrap project" --allow-empty', {
        cwd: this.gitRoot,
        stdio: "pipe",
      });
    }
  }

  async checkMilestoneCreated(milestoneId: string): Promise<boolean> {
    const contextPath = resolveMilestoneFile(this.basePath, milestoneId, "CONTEXT");
    return contextPath != null;
  }

  // ── Prompt Builders ───────────────────────────────────────────────────

  async buildPrompt(phase: Phase, state: KataState, options?: PromptOptions): Promise<string> {
    // Dispatch-time overrides take priority
    if (options?.uatSliceId) {
      return this._buildRunUatPrompt(state, options.uatSliceId);
    }
    if (options?.reassessSliceId) {
      return this._buildReassessRoadmapPrompt(state, options.reassessSliceId);
    }
    if (options?.dispatchResearch === "milestone") {
      return this._buildResearchMilestonePrompt(state);
    }
    if (options?.dispatchResearch === "slice") {
      return this._buildResearchSlicePrompt(state);
    }

    switch (phase) {
      case "pre-planning":
        return this._buildPlanMilestonePrompt(state);
      case "planning":
        return this._buildPlanSlicePrompt(state);
      case "executing":
      case "verifying":
        return this._buildExecuteTaskPrompt(state);
      case "summarizing":
        return this._buildCompleteSlicePrompt(state);
      case "completing-milestone":
        return this._buildCompleteMilestonePrompt(state);
      case "replanning-slice":
        return this._buildReplanSlicePrompt(state);
      default:
        return "";
    }
  }

  buildDiscussPrompt(nextId: string, preamble: string): string {
    const milestoneDirAbs = join(this.basePath, ".kata", "milestones", nextId);
    return loadPrompt("discuss", {
      milestoneId: nextId,
      preamble,
      contextAbsPath: join(milestoneDirAbs, `${nextId}-CONTEXT.md`),
      roadmapAbsPath: join(milestoneDirAbs, `${nextId}-ROADMAP.md`),
    });
  }

  // ── Stubs ─────────────────────────────────────────────────────────────

  async loadDashboardData(): Promise<DashboardData> {
    const state = await this.deriveState();
    const sliceViews: import("./backend.js").DashboardSliceView[] = [];

    if (state.activeMilestone) {
      const mid = state.activeMilestone.id;
      const roadmapFile = resolveMilestoneFile(this.basePath, mid, "ROADMAP");
      const roadmapContent = roadmapFile ? await loadFile(roadmapFile) : null;
      if (roadmapContent) {
        const roadmap = parseRoadmap(roadmapContent);
        for (const s of roadmap.slices) {
          const sv: import("./backend.js").DashboardSliceView = {
            id: s.id,
            title: s.title,
            done: s.done,
            risk: s.risk,
            active: state.activeSlice?.id === s.id,
            tasks: [],
          };

          if (sv.active) {
            const planFile = resolveSliceFile(this.basePath, mid, s.id, "PLAN");
            const planContent = planFile ? await loadFile(planFile) : null;
            if (planContent) {
              const plan = parsePlan(planContent);
              sv.taskProgress = {
                done: plan.tasks.filter((t) => t.done).length,
                total: plan.tasks.length,
              };
              for (const t of plan.tasks) {
                sv.tasks.push({
                  id: t.id,
                  title: t.title,
                  done: t.done,
                  active: state.activeTask?.id === t.id,
                });
              }
            }
          }

          sliceViews.push(sv);
        }
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
    const { ensureSliceBranch } = await import("./worktree.js");
    ensureSliceBranch(this.basePath, milestoneId, sliceId);

    const branch = `kata/${milestoneId}/${sliceId}`;
    const documents: Record<string, string> = {};

    // Use explicit path resolution instead of readDocument to avoid stale active-state lookups
    const planPath = resolveSliceFile(this.basePath, milestoneId, sliceId, "PLAN");
    const plan = planPath ? await loadFile(planPath) : null;
    if (plan) documents["PLAN"] = plan;

    const summaryPath = resolveSliceFile(this.basePath, milestoneId, sliceId, "SUMMARY");
    const summary = summaryPath ? await loadFile(summaryPath) : null;
    if (summary) documents["SUMMARY"] = summary;

    return { branch, documents };
  }

  // ── Private Prompt Builders ───────────────────────────────────────────

  private _buildResearchMilestoneOps(mid: string): OpsBlock {
    const base = this.basePath;
    const outputRelPath = relMilestoneFile(base, mid, "RESEARCH");
    const outputAbsPath =
      resolveMilestoneFile(base, mid, "RESEARCH") ?? join(base, outputRelPath);

    const backendOps = [
      `7. Write \`${outputRelPath}\` with:`,
      `   - Summary (2-3 paragraphs, primary recommendation)`,
      `   - Don't Hand-Roll table (problems with existing solutions)`,
      `   - Common Pitfalls (what goes wrong, how to avoid)`,
      `   - Relevant Code (existing files, patterns, integration points)`,
      `   - Sources`,
    ].join("\n");

    return {
      backendRules: "",
      backendOps,
      backendMustComplete: `**You MUST write the file \`${outputAbsPath}\` before finishing.**`,
    };
  }

  private async _buildResearchMilestonePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const midTitle = state.activeMilestone!.title;
    const base = this.basePath;

    const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
    const contextRel = relMilestoneFile(base, mid, "CONTEXT");

    const inlined: string[] = [];
    inlined.push(await this._inlineFile(contextPath, contextRel, "Milestone Context"));
    const projectInline = await this._inlineKataRootFile("project.md", "Project");
    if (projectInline) inlined.push(projectInline);
    const requirementsInline = await this._inlineKataRootFile(
      "requirements.md",
      "Requirements",
    );
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await this._inlineKataRootFile(
      "decisions.md",
      "Decisions",
    );
    if (decisionsInline) inlined.push(decisionsInline);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const ops = this._buildResearchMilestoneOps(mid);

    return loadPrompt("research-milestone", {
      milestoneId: mid,
      milestoneTitle: midTitle,
      inlinedContext,
      ...buildSkillDiscoveryVars(),
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  private async _buildPlanMilestonePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const midTitle = state.activeMilestone!.title;
    const base = this.basePath;

    const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
    const contextRel = relMilestoneFile(base, mid, "CONTEXT");
    const researchPath = resolveMilestoneFile(base, mid, "RESEARCH");
    const researchRel = relMilestoneFile(base, mid, "RESEARCH");

    const inlined: string[] = [];
    inlined.push(await this._inlineFile(contextPath, contextRel, "Milestone Context"));
    const researchInline = await this._inlineFileOptional(
      researchPath,
      researchRel,
      "Milestone Research",
    );
    if (researchInline) inlined.push(researchInline);
    const priorSummaryInline = await inlinePriorMilestoneSummary(mid, base);
    if (priorSummaryInline) inlined.push(priorSummaryInline);
    const projectInline = await this._inlineKataRootFile("project.md", "Project");
    if (projectInline) inlined.push(projectInline);
    const requirementsInline = await this._inlineKataRootFile(
      "requirements.md",
      "Requirements",
    );
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await this._inlineKataRootFile(
      "decisions.md",
      "Decisions",
    );
    if (decisionsInline) inlined.push(decisionsInline);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const outputRelPath = relMilestoneFile(base, mid, "ROADMAP");
    const outputAbsPath =
      resolveMilestoneFile(base, mid, "ROADMAP") ?? join(base, outputRelPath);
    return loadPrompt("plan-milestone", {
      milestoneId: mid,
      milestoneTitle: midTitle,
      milestonePath: relMilestonePath(base, mid),
      contextPath: contextRel,
      researchPath: researchRel,
      outputPath: outputRelPath,
      outputAbsPath,
      inlinedContext,
    });
  }

  private async _buildResearchSlicePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const sid = state.activeSlice!.id;
    const sTitle = state.activeSlice!.title;
    const base = this.basePath;

    const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
    const contextRel = relMilestoneFile(base, mid, "CONTEXT");
    const milestoneResearchPath = resolveMilestoneFile(base, mid, "RESEARCH");
    const milestoneResearchRel = relMilestoneFile(base, mid, "RESEARCH");

    const inlined: string[] = [];
    inlined.push(await this._inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
    const contextInline = await this._inlineFileOptional(
      contextPath,
      contextRel,
      "Milestone Context",
    );
    if (contextInline) inlined.push(contextInline);
    const researchInline = await this._inlineFileOptional(
      milestoneResearchPath,
      milestoneResearchRel,
      "Milestone Research",
    );
    if (researchInline) inlined.push(researchInline);
    const decisionsInline = await this._inlineKataRootFile(
      "decisions.md",
      "Decisions",
    );
    if (decisionsInline) inlined.push(decisionsInline);
    const requirementsInline = await this._inlineKataRootFile(
      "requirements.md",
      "Requirements",
    );
    if (requirementsInline) inlined.push(requirementsInline);

    const depContent = await this._inlineDependencySummaries(mid, sid);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const outputRelPath = relSliceFile(base, mid, sid, "RESEARCH");
    const outputAbsPath =
      resolveSliceFile(base, mid, sid, "RESEARCH") ?? join(base, outputRelPath);
    return loadPrompt("research-slice", {
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      slicePath: relSlicePath(base, mid, sid),
      roadmapPath: roadmapRel,
      contextPath: contextRel,
      milestoneResearchPath: milestoneResearchRel,
      outputPath: outputRelPath,
      outputAbsPath,
      inlinedContext,
      dependencySummaries: depContent,
      ...buildSkillDiscoveryVars(),
    });
  }

  private async _buildPlanSlicePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const sid = state.activeSlice!.id;
    const sTitle = state.activeSlice!.title;
    const base = this.basePath;

    const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    const researchPath = resolveSliceFile(base, mid, sid, "RESEARCH");
    const researchRel = relSliceFile(base, mid, sid, "RESEARCH");

    const inlined: string[] = [];
    inlined.push(await this._inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
    const researchInline = await this._inlineFileOptional(
      researchPath,
      researchRel,
      "Slice Research",
    );
    if (researchInline) inlined.push(researchInline);
    const decisionsInline = await this._inlineKataRootFile(
      "decisions.md",
      "Decisions",
    );
    if (decisionsInline) inlined.push(decisionsInline);
    const requirementsInline = await this._inlineKataRootFile(
      "requirements.md",
      "Requirements",
    );
    if (requirementsInline) inlined.push(requirementsInline);

    const depContent = await this._inlineDependencySummaries(mid, sid);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const outputRelPath = relSliceFile(base, mid, sid, "PLAN");
    const outputAbsPath =
      resolveSliceFile(base, mid, sid, "PLAN") ?? join(base, outputRelPath);
    const sliceAbsPath =
      resolveSlicePath(base, mid, sid) ??
      join(base, relSlicePath(base, mid, sid));
    return loadPrompt("plan-slice", {
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      slicePath: relSlicePath(base, mid, sid),
      sliceAbsPath,
      roadmapPath: roadmapRel,
      researchPath: researchRel,
      outputPath: outputRelPath,
      outputAbsPath,
      inlinedContext,
      dependencySummaries: depContent,
    });
  }

  private async _buildExecuteTaskPrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const sid = state.activeSlice!.id;
    const sTitle = state.activeSlice!.title;
    const tid = state.activeTask!.id;
    const tTitle = state.activeTask!.title;
    const base = this.basePath;

    const priorSummaries = await this._getPriorTaskSummaryPaths(mid, sid, tid);
    const priorLines =
      priorSummaries.length > 0
        ? priorSummaries.map((p) => `- \`${p}\``).join("\n")
        : "- (no prior tasks)";

    const taskPlanPath = resolveTaskFile(base, mid, sid, tid, "PLAN");
    const taskPlanContent = taskPlanPath ? await loadFile(taskPlanPath) : null;
    const taskPlanRelPath = relTaskFile(base, mid, sid, tid, "PLAN");
    const taskPlanInline = taskPlanContent
      ? [
          "## Inlined Task Plan (authoritative local execution contract)",
          `Source: \`${taskPlanRelPath}\``,
          "",
          taskPlanContent.trim(),
        ].join("\n")
      : [
          "## Inlined Task Plan (authoritative local execution contract)",
          `Task plan not found at dispatch time. Read \`${taskPlanRelPath}\` before executing.`,
        ].join("\n");

    const slicePlanPath = resolveSliceFile(base, mid, sid, "PLAN");
    const slicePlanContent = slicePlanPath ? await loadFile(slicePlanPath) : null;
    const slicePlanExcerpt = extractSliceExecutionExcerpt(
      slicePlanContent,
      relSliceFile(base, mid, sid, "PLAN"),
    );

    // Check for continue file (new naming or legacy)
    const continueFile = resolveSliceFile(base, mid, sid, "CONTINUE");
    const legacyContinueDir = resolveSlicePath(base, mid, sid);
    const legacyContinuePath = legacyContinueDir
      ? join(legacyContinueDir, "continue.md")
      : null;
    const continueContent = continueFile ? await loadFile(continueFile) : null;
    const legacyContinueContent =
      !continueContent && legacyContinuePath
        ? await loadFile(legacyContinuePath)
        : null;
    const continueRelPath = relSliceFile(base, mid, sid, "CONTINUE");
    const resumeSection = buildResumeSection(
      continueContent,
      legacyContinueContent,
      continueRelPath,
      legacyContinuePath ? `${relSlicePath(base, mid, sid)}/continue.md` : null,
    );

    const carryForwardSection = await this._buildCarryForwardSection(
      priorSummaries,
    );

    const sliceDirAbs =
      resolveSlicePath(base, mid, sid) ??
      join(base, relSlicePath(base, mid, sid));
    const taskSummaryAbsPath = join(sliceDirAbs, "tasks", `${tid}-SUMMARY.md`);

    return loadPrompt("execute-task", {
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      taskId: tid,
      taskTitle: tTitle,
      planPath: relSliceFile(base, mid, sid, "PLAN"),
      slicePath: relSlicePath(base, mid, sid),
      taskPlanPath: taskPlanRelPath,
      taskPlanInline,
      slicePlanExcerpt,
      carryForwardSection,
      resumeSection,
      priorTaskLines: priorLines,
      taskSummaryAbsPath,
    });
  }

  private async _buildCompleteSlicePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const sid = state.activeSlice!.id;
    const sTitle = state.activeSlice!.title;
    const base = this.basePath;

    const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    const slicePlanPath = resolveSliceFile(base, mid, sid, "PLAN");
    const slicePlanRel = relSliceFile(base, mid, sid, "PLAN");

    const inlined: string[] = [];
    inlined.push(await this._inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
    inlined.push(await this._inlineFile(slicePlanPath, slicePlanRel, "Slice Plan"));
    const requirementsInline = await this._inlineKataRootFile(
      "requirements.md",
      "Requirements",
    );
    if (requirementsInline) inlined.push(requirementsInline);

    // Inline all task summaries for this slice
    const tDir = resolveTasksDir(base, mid, sid);
    if (tDir) {
      const summaryFiles = resolveTaskFiles(tDir, "SUMMARY").sort();
      for (const file of summaryFiles) {
        const absPath = join(tDir, file);
        const content = await loadFile(absPath);
        const sRel = relSlicePath(base, mid, sid);
        const relPath = `${sRel}/tasks/${file}`;
        if (content) {
          inlined.push(
            `### Task Summary: ${file.replace(/-SUMMARY\.md$/i, "")}\nSource: \`${relPath}\`\n\n${content.trim()}`,
          );
        }
      }
    }

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const sliceDirAbs =
      resolveSlicePath(base, mid, sid) ??
      join(base, relSlicePath(base, mid, sid));
    const sliceSummaryAbsPath = join(sliceDirAbs, `${sid}-SUMMARY.md`);
    const sliceUatAbsPath = join(sliceDirAbs, `${sid}-UAT.md`);

    return loadPrompt("complete-slice", {
      milestoneId: mid,
      sliceId: sid,
      sliceTitle: sTitle,
      slicePath: relSlicePath(base, mid, sid),
      roadmapPath: roadmapRel,
      inlinedContext,
      sliceSummaryAbsPath,
      sliceUatAbsPath,
    });
  }

  private _buildCompleteMilestoneOps(state: KataState): OpsBlock {
    const mid = state.activeMilestone!.id;
    const base = this.basePath;
    const milestoneDirAbs =
      resolveMilestonePath(base, mid) ?? join(base, relMilestonePath(base, mid));
    const milestoneSummaryAbsPath = join(milestoneDirAbs, `${mid}-SUMMARY.md`);

    const backendOps = [
      `5. Read the milestone-summary template at \`~/.kata-cli/agent/extensions/kata/templates/milestone-summary.md\``,
      `6. Write \`${milestoneSummaryAbsPath}\` using the milestone-summary template. Fill all frontmatter fields and narrative sections. The \`requirement_outcomes\` field must list every requirement that changed status with \`from_status\`, \`to_status\`, and \`proof\`.`,
      `7. Update \`.kata/REQUIREMENTS.md\` if any requirement status transitions were validated in step 4.`,
      `8. Update \`.kata/PROJECT.md\` to reflect milestone completion and current project state.`,
      `9. Commit all changes: \`git add -A && git commit -m 'feat(kata): complete ${mid}'\``,
      `10. Update \`.kata/STATE.md\``,
    ].join("\n");

    return {
      backendRules: "",
      backendOps,
      backendMustComplete: `**You MUST write \`${milestoneSummaryAbsPath}\` AND update PROJECT.md before finishing.**`,
    };
  }

  private async _buildCompleteMilestonePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const midTitle = state.activeMilestone!.title;
    const base = this.basePath;

    const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");

    const roadmapContent = roadmapPath ? await loadFile(roadmapPath) : null;

    const inlined: string[] = [];
    if (roadmapContent) {
      inlined.push(`### Milestone Roadmap\nSource: \`${roadmapRel}\`\n\n${roadmapContent.trim()}`);
    } else {
      inlined.push(`### Milestone Roadmap\nSource: \`${roadmapRel}\`\n\n_(not found — file does not exist yet)_`);
    }

    // Inline all slice summaries
    if (roadmapContent) {
      const roadmap = parseRoadmap(roadmapContent);
      for (const slice of roadmap.slices) {
        const summaryPath = resolveSliceFile(base, mid, slice.id, "SUMMARY");
        const summaryRel = relSliceFile(base, mid, slice.id, "SUMMARY");
        inlined.push(
          await this._inlineFile(summaryPath, summaryRel, `${slice.id} Summary`),
        );
      }
    }

    // Inline root Kata files
    const requirementsInline = await this._inlineKataRootFile(
      "requirements.md",
      "Requirements",
    );
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await this._inlineKataRootFile(
      "decisions.md",
      "Decisions",
    );
    if (decisionsInline) inlined.push(decisionsInline);
    const projectInline = await this._inlineKataRootFile("project.md", "Project");
    if (projectInline) inlined.push(projectInline);
    // Inline milestone context file (milestone-level, not Kata root)
    const contextPath = resolveMilestoneFile(base, mid, "CONTEXT");
    const contextRel = relMilestoneFile(base, mid, "CONTEXT");
    const contextInline = await this._inlineFileOptional(
      contextPath,
      contextRel,
      "Milestone Context",
    );
    if (contextInline) inlined.push(contextInline);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const ops = this._buildCompleteMilestoneOps(state);

    return loadPrompt("complete-milestone", {
      milestoneId: mid,
      milestoneTitle: midTitle,
      roadmapPath: roadmapRel,
      inlinedContext,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  private _buildReplanSliceOps(state: KataState): OpsBlock {
    const mid = state.activeMilestone!.id;
    const sid = state.activeSlice!.id;
    const base = this.basePath;

    const slicePlanRel = relSliceFile(base, mid, sid, "PLAN");
    const sliceDirAbs =
      resolveSlicePath(base, mid, sid) ??
      join(base, relSlicePath(base, mid, sid));
    const replanAbsPath = join(sliceDirAbs, `${sid}-REPLAN.md`);

    // Find blocker task ID for commit message
    let blockerTaskId = "";
    const tDir = resolveTasksDir(base, mid, sid);
    if (tDir) {
      const summaryFiles = resolveTaskFiles(tDir, "SUMMARY").sort();
      for (const file of summaryFiles) {
        const absPath = join(tDir, file);
        // Synchronous-safe: we only need the frontmatter ID
        try {
          const content = readFileSync(absPath, "utf-8");
          const summary = parseSummary(content);
          if (summary.frontmatter.blocker_discovered) {
            blockerTaskId =
              summary.frontmatter.id || file.replace(/-SUMMARY\.md$/i, "");
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    const backendOps = [
      `3. Write \`${replanAbsPath}\` documenting:`,
      `   - What blocker was discovered and in which task`,
      `   - What changed in the plan and why`,
      `   - Which incomplete tasks were modified, added, or removed`,
      `   - Any new risks or considerations introduced by the replan`,
      `4. Rewrite \`${slicePlanRel}\` with the updated slice plan:`,
      `   - Keep all \`[x]\` tasks exactly as they were (same IDs, same descriptions, same checkmarks)`,
      `   - Update the \`[ ]\` tasks to address the blocker`,
      `   - Ensure the slice Goal and Demo sections are still achievable with the new tasks, or update them if the blocker fundamentally changes what the slice can deliver`,
      `   - Update the Files Likely Touched section if the replan changes which files are affected`,
      `5. If any incomplete task had a \`T0x-PLAN.md\`, remove or rewrite it to match the new task description.`,
      `6. Commit all changes: \`git add -A && git commit -m 'refactor(${sid}): replan after blocker in ${blockerTaskId}'\``,
      `7. Update \`.kata/STATE.md\``,
    ].join("\n");

    return {
      backendRules: "",
      backendOps,
      backendMustComplete: `**You MUST write \`${replanAbsPath}\` and the updated slice plan before finishing.**`,
    };
  }

  private async _buildReplanSlicePrompt(state: KataState): Promise<string> {
    const mid = state.activeMilestone!.id;
    const sid = state.activeSlice!.id;
    const sTitle = state.activeSlice!.title;
    const base = this.basePath;

    const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    const slicePlanPath = resolveSliceFile(base, mid, sid, "PLAN");
    const slicePlanRel = relSliceFile(base, mid, sid, "PLAN");

    const inlined: string[] = [];
    inlined.push(await this._inlineFile(roadmapPath, roadmapRel, "Milestone Roadmap"));
    inlined.push(
      await this._inlineFile(slicePlanPath, slicePlanRel, "Current Slice Plan"),
    );

    // Find the blocker task summary
    let blockerTaskId = "";
    const tDir = resolveTasksDir(base, mid, sid);
    if (tDir) {
      const summaryFiles = resolveTaskFiles(tDir, "SUMMARY").sort();
      for (const file of summaryFiles) {
        const absPath = join(tDir, file);
        const content = await loadFile(absPath);
        if (!content) continue;
        const summary = parseSummary(content);
        const sRel = relSlicePath(base, mid, sid);
        const relPath = `${sRel}/tasks/${file}`;
        if (summary.frontmatter.blocker_discovered) {
          blockerTaskId =
            summary.frontmatter.id || file.replace(/-SUMMARY\.md$/i, "");
          inlined.push(
            `### Blocker Task Summary: ${blockerTaskId}\nSource: \`${relPath}\`\n\n${content.trim()}`,
          );
        }
      }
    }

    // Inline decisions
    const decisionsInline = await this._inlineKataRootFile(
      "decisions.md",
      "Decisions",
    );
    if (decisionsInline) inlined.push(decisionsInline);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

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

  private _buildReassessRoadmapOps(state: KataState, completedSliceId: string): OpsBlock {
    const mid = state.activeMilestone!.id;
    const base = this.basePath;

    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    const sliceDirAbs =
      resolveSlicePath(base, mid, completedSliceId) ??
      join(base, relSlicePath(base, mid, completedSliceId));
    const assessmentAbsPath = join(
      sliceDirAbs,
      `${completedSliceId}-ASSESSMENT.md`,
    );

    const backendOps = [
      `**If the roadmap is still good:**`,
      ``,
      `Write \`${assessmentAbsPath}\` with a brief confirmation that roadmap coverage still holds after ${completedSliceId}. If requirements exist, explicitly note whether requirement coverage remains sound.`,
      ``,
      `**If changes are needed:**`,
      ``,
      `1. Rewrite the remaining (unchecked) slices in \`${roadmapRel}\`. Keep completed slices exactly as they are (\`[x]\`). Update the boundary map for changed slices. Update the proof strategy if risks changed. Update requirement coverage if ownership or scope changed.`,
      `2. Write \`${assessmentAbsPath}\` explaining what changed and why — keep it brief and concrete.`,
      `3. If \`.kata/REQUIREMENTS.md\` exists and requirement ownership or status changed, update it.`,
      `4. Commit: \`docs(${mid}): reassess roadmap after ${completedSliceId}\``,
    ].join("\n");

    return {
      backendRules: "",
      backendOps,
      backendMustComplete: `**You MUST write the file \`${assessmentAbsPath}\` before finishing.**`,
    };
  }

  private async _buildReassessRoadmapPrompt(
    state: KataState,
    completedSliceId: string,
  ): Promise<string> {
    const mid = state.activeMilestone!.id;
    const base = this.basePath;

    const roadmapPath = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    const summaryPath = resolveSliceFile(base, mid, completedSliceId, "SUMMARY");
    const summaryRel = relSliceFile(base, mid, completedSliceId, "SUMMARY");

    const inlined: string[] = [];
    inlined.push(await this._inlineFile(roadmapPath, roadmapRel, "Current Roadmap"));
    inlined.push(
      await this._inlineFile(summaryPath, summaryRel, `${completedSliceId} Summary`),
    );
    const projectInline = await this._inlineKataRootFile("project.md", "Project");
    if (projectInline) inlined.push(projectInline);
    const requirementsInline = await this._inlineKataRootFile(
      "requirements.md",
      "Requirements",
    );
    if (requirementsInline) inlined.push(requirementsInline);
    const decisionsInline = await this._inlineKataRootFile(
      "decisions.md",
      "Decisions",
    );
    if (decisionsInline) inlined.push(decisionsInline);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const ops = this._buildReassessRoadmapOps(state, completedSliceId);

    return loadPrompt("reassess-roadmap", {
      milestoneId: mid,
      completedSliceId,
      inlinedContext,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  private _buildRunUatOps(state: KataState, sliceId: string, uatResultAbsPath: string, uatType: string): OpsBlock {
    const backendOps = [
      `Write \`${uatResultAbsPath}\` with:`,
      ``,
      "```markdown",
      `---`,
      `sliceId: ${sliceId}`,
      `uatType: ${uatType}`,
      `verdict: PASS | FAIL | PARTIAL`,
      `date: <ISO 8601 timestamp>`,
      `---`,
      ``,
      `# UAT Result — ${sliceId}`,
      ``,
      `## Checks`,
      ``,
      `| Check | Result | Notes |`,
      `|-------|--------|-------|`,
      `| <check description> | PASS / FAIL | <observed output or reason> |`,
      ``,
      `## Overall Verdict`,
      ``,
      `<PASS / FAIL / PARTIAL> — <one sentence summary>`,
      ``,
      `## Notes`,
      ``,
      `<any additional context, errors encountered, or follow-up items>`,
      "```",
    ].join("\n");

    return {
      backendRules: "",
      backendOps,
      backendMustComplete: `**You MUST write \`${uatResultAbsPath}\` before finishing.**`,
    };
  }

  private async _buildRunUatPrompt(
    state: KataState,
    sliceId: string,
  ): Promise<string> {
    const mid = state.activeMilestone!.id;
    const base = this.basePath;

    const uatFile = resolveSliceFile(base, mid, sliceId, "UAT");
    const uatPath = relSliceFile(base, mid, sliceId, "UAT");
    const uatContent = uatFile ? await loadFile(uatFile) : null;

    const inlined: string[] = [];
    if (uatContent) {
      inlined.push(`### ${sliceId} UAT\nSource: \`${uatPath}\`\n\n${uatContent.trim()}`);
    } else {
      inlined.push(`### ${sliceId} UAT\nSource: \`${uatPath}\`\n\n_(not found — file does not exist yet)_`);
    }

    const summaryPath = resolveSliceFile(base, mid, sliceId, "SUMMARY");
    const summaryRel = relSliceFile(base, mid, sliceId, "SUMMARY");
    if (summaryPath) {
      const summaryInline = await this._inlineFileOptional(
        summaryPath,
        summaryRel,
        `${sliceId} Summary`,
      );
      if (summaryInline) inlined.push(summaryInline);
    }

    const projectInline = await this._inlineKataRootFile("project.md", "Project");
    if (projectInline) inlined.push(projectInline);

    const inlinedContext = `## Inlined Context (preloaded — do not re-read these files)\n\n${inlined.join("\n\n---\n\n")}`;

    const sliceDirAbs =
      resolveSlicePath(base, mid, sliceId) ??
      join(base, relSlicePath(base, mid, sliceId));
    const uatResultAbsPath = join(sliceDirAbs, `${sliceId}-UAT-RESULT.md`);
    const uatType = (uatContent ? extractUatType(uatContent) : null) ?? "human-experience";

    const ops = this._buildRunUatOps(state, sliceId, uatResultAbsPath, uatType);

    return loadPrompt("run-uat", {
      milestoneId: mid,
      sliceId,
      uatRef: uatPath,
      uatResultRef: uatResultAbsPath,
      uatType,
      inlinedContext,
      backendRules: ops.backendRules,
      backendOps: ops.backendOps,
      backendMustComplete: ops.backendMustComplete,
    });
  }

  // ── Private Inline Helpers ────────────────────────────────────────────

  private async _inlineFile(
    absPath: string | null,
    relPath: string,
    label: string,
  ): Promise<string> {
    const content = absPath ? await loadFile(absPath) : null;
    if (!content) {
      return `### ${label}\nSource: \`${relPath}\`\n\n_(not found — file does not exist yet)_`;
    }
    return `### ${label}\nSource: \`${relPath}\`\n\n${content.trim()}`;
  }

  private async _inlineFileOptional(
    absPath: string | null,
    relPath: string,
    label: string,
  ): Promise<string | null> {
    const content = absPath ? await loadFile(absPath) : null;
    if (!content) return null;
    return `### ${label}\nSource: \`${relPath}\`\n\n${content.trim()}`;
  }

  private async _inlineDependencySummaries(
    mid: string,
    sid: string,
  ): Promise<string> {
    const base = this.basePath;
    const roadmapFile = resolveMilestoneFile(base, mid, "ROADMAP");
    const roadmapContent = roadmapFile ? await loadFile(roadmapFile) : null;
    if (!roadmapContent) return "- (no dependencies)";

    const roadmap = parseRoadmap(roadmapContent);
    const sliceEntry = roadmap.slices.find((s) => s.id === sid);
    if (!sliceEntry || sliceEntry.depends.length === 0)
      return "- (no dependencies)";

    const sections: string[] = [];
    for (const dep of sliceEntry.depends) {
      const summaryFile = resolveSliceFile(base, mid, dep, "SUMMARY");
      const summaryContent = summaryFile ? await loadFile(summaryFile) : null;
      const relPath = relSliceFile(base, mid, dep, "SUMMARY");
      if (summaryContent) {
        sections.push(
          `#### ${dep} Summary\nSource: \`${relPath}\`\n\n${summaryContent.trim()}`,
        );
      } else {
        sections.push(`- \`${relPath}\` _(not found)_`);
      }
    }
    return sections.join("\n\n");
  }

  private async _inlineKataRootFile(
    filename: string,
    label: string,
  ): Promise<string | null> {
    const key = filename.replace(/\.md$/i, "").toUpperCase() as
      | "PROJECT"
      | "DECISIONS"
      | "QUEUE"
      | "STATE"
      | "REQUIREMENTS";
    const absPath = resolveKataRootFile(this.basePath, key);
    if (!existsSync(absPath)) return null;
    return this._inlineFileOptional(absPath, relKataRootFile(key), label);
  }


  private async _getPriorTaskSummaryPaths(
    mid: string,
    sid: string,
    currentTid: string,
  ): Promise<string[]> {
    const base = this.basePath;
    const tDir = resolveTasksDir(base, mid, sid);
    if (!tDir) return [];

    const summaryFiles = resolveTaskFiles(tDir, "SUMMARY");
    const currentNum = parseInt(currentTid.replace(/^T/, ""), 10);
    const sRel = relSlicePath(base, mid, sid);

    return summaryFiles
      .filter((f) => {
        const num = parseInt(f.replace(/^T/, ""), 10);
        return num < currentNum;
      })
      .map((f) => `${sRel}/tasks/${f}`);
  }

  private async _buildCarryForwardSection(
    priorSummaryPaths: string[],
  ): Promise<string> {
    const base = this.basePath;
    if (priorSummaryPaths.length === 0) {
      return [
        "## Carry-Forward Context",
        "- No prior task summaries in this slice.",
      ].join("\n");
    }

    const items = await Promise.all(
      priorSummaryPaths.map(async (relPath) => {
        const absPath = join(base, relPath);
        const content = await loadFile(absPath);
        if (!content) return `- \`${relPath}\``;

        const summary = parseSummary(content);
        const provided = summary.frontmatter.provides.slice(0, 2).join("; ");
        const decisions = summary.frontmatter.key_decisions
          .slice(0, 2)
          .join("; ");
        const patterns = summary.frontmatter.patterns_established
          .slice(0, 2)
          .join("; ");
        const diagnostics = extractMarkdownSection(content, "Diagnostics");

        const parts = [summary.title || relPath];
        if (summary.oneLiner) parts.push(summary.oneLiner);
        if (provided) parts.push(`provides: ${provided}`);
        if (decisions) parts.push(`decisions: ${decisions}`);
        if (patterns) parts.push(`patterns: ${patterns}`);
        if (diagnostics) parts.push(`diagnostics: ${oneLine(diagnostics)}`);

        return `- \`${relPath}\` — ${parts.join(" | ")}`;
      }),
    );

    return ["## Carry-Forward Context", ...items].join("\n");
  }
}

// ─── Module-level helpers (used by prompt builders) ───────────────────────

function buildResumeSection(
  continueContent: string | null,
  legacyContinueContent: string | null,
  continueRelPath: string,
  legacyContinueRelPath: string | null,
): string {
  const resolvedContent = continueContent ?? legacyContinueContent;
  const resolvedRelPath = continueContent
    ? continueRelPath
    : legacyContinueRelPath;

  if (!resolvedContent || !resolvedRelPath) {
    return [
      "## Resume State",
      "- No continue file present. Start from the top of the task plan.",
    ].join("\n");
  }

  const cont = parseContinue(resolvedContent);
  const lines = [
    "## Resume State",
    `Source: \`${resolvedRelPath}\``,
    `- Status: ${cont.frontmatter.status || "in_progress"}`,
  ];

  if (cont.frontmatter.step && cont.frontmatter.totalSteps) {
    lines.push(
      `- Progress: step ${cont.frontmatter.step} of ${cont.frontmatter.totalSteps}`,
    );
  }
  if (cont.completedWork)
    lines.push(`- Completed: ${oneLine(cont.completedWork)}`);
  if (cont.remainingWork)
    lines.push(`- Remaining: ${oneLine(cont.remainingWork)}`);
  if (cont.decisions) lines.push(`- Decisions: ${oneLine(cont.decisions)}`);
  if (cont.nextAction) lines.push(`- Next action: ${oneLine(cont.nextAction)}`);

  return lines.join("\n");
}

