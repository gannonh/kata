/**
 * pr-body-composer.ts — Composes a markdown PR body from Kata slice artifacts.
 *
 * Reads the slice plan (must-haves, task list), task plans (titles), and the
 * optional slice summary (one-liner) via the shared kata/paths + kata/files
 * utilities, then assembles a well-formed PR description.
 *
 * Gracefully handles missing artifacts: returns a non-empty markdown string
 * even when the slice summary is absent or no task files are found.
 */

import { join } from "node:path";
import {
  resolveSliceFile,
  resolveTasksDir,
  resolveTaskFiles,
} from "../kata/paths.js";
import { parsePlan, parseSummary, loadFile } from "../kata/files.js";
import { buildLinearReferencesSection } from "../kata/linear-crosslink.js";

export interface ComposePRBodyOptions {
  /** Linear issue identifiers (e.g. ["KAT-42"]) to include as references. */
  linearReferences?: string[];
  /**
   * Pre-fetched Linear document content for Linear mode (bypasses disk reads).
   * Keys: "PLAN", "SUMMARY". Values: raw markdown content.
   */
  linearDocuments?: Record<string, string>;
}

/**
 * Compose a markdown PR body from Kata slice artifacts.
 *
 * @param milestoneId - e.g. "M001"
 * @param sliceId     - e.g. "S01"
 * @param cwd         - project root (directory that contains `.kata/`)
 * @param options     - optional: Linear references to append
 * @returns           - non-empty markdown string
 */
export async function composePRBody(
  milestoneId: string,
  sliceId: string,
  cwd: string,
  options?: ComposePRBodyOptions,
): Promise<string> {
  // ── Slice Plan ────────────────────────────────────────────────────────────
  const planPath = resolveSliceFile(cwd, milestoneId, sliceId, "PLAN");
  const planContent = planPath ? await loadFile(planPath) : null;
  const effectivePlanContent = planContent ?? options?.linearDocuments?.["PLAN"] ?? null;

  let sliceTitle = `${sliceId}: (no slice plan found)`;
  let mustHaves: string[] = [];
  let planTaskTitles: string[] = [];

  if (effectivePlanContent) {
    const plan = parsePlan(effectivePlanContent);
    sliceTitle = plan.title
      ? `${plan.id ? plan.id + ": " : ""}${plan.title}`
      : sliceTitle;
    mustHaves = plan.mustHaves ?? [];
    planTaskTitles = plan.tasks.map((t) => `${t.id}: ${t.title}`);
  }

  // ── Slice Summary (optional) ──────────────────────────────────────────────
  const summaryPath = resolveSliceFile(cwd, milestoneId, sliceId, "SUMMARY");
  const summaryContent = summaryPath ? await loadFile(summaryPath) : null;
  const effectiveSummaryContent = summaryContent ?? options?.linearDocuments?.["SUMMARY"] ?? null;

  let oneLiner: string | null = null;
  if (effectiveSummaryContent) {
    const summary = parseSummary(effectiveSummaryContent);
    oneLiner = summary.oneLiner || null;
  }

  // ── Task Plans ────────────────────────────────────────────────────────────
  const tasksDir = resolveTasksDir(cwd, milestoneId, sliceId);
  const taskFileNames = tasksDir ? resolveTaskFiles(tasksDir, "PLAN") : [];

  const taskTitlesFromFiles: string[] = [];
  for (const fileName of taskFileNames) {
    const fullPath = join(tasksDir!, fileName);
    const content = await loadFile(fullPath);
    if (!content) continue;
    const parsed = parsePlan(content);
    if (parsed.title) {
      taskTitlesFromFiles.push(`${parsed.id ? parsed.id + ": " : ""}${parsed.title}`);
    }
  }

  // Prefer titles from individual task plan files; fall back to entries in the
  // slice plan's Tasks section when no task files were found.
  const resolvedTaskTitles =
    taskTitlesFromFiles.length > 0 ? taskTitlesFromFiles : planTaskTitles;

  // ── Compose Output ────────────────────────────────────────────────────────
  const sections: string[] = [];

  // ## What Changed
  const whatChanged = oneLiner ?? `See slice plan: ${sliceTitle}`;
  sections.push(`## What Changed\n${whatChanged}`);

  // ## Must-Haves
  if (mustHaves.length > 0) {
    const bullets = mustHaves.map((mh) => `- ${mh}`).join("\n");
    sections.push(`## Must-Haves\n${bullets}`);
  } else {
    sections.push(`## Must-Haves\n- See slice plan`);
  }

  // ## Tasks
  if (resolvedTaskTitles.length > 0) {
    const bullets = resolvedTaskTitles.map((t) => `- ${t}`).join("\n");
    sections.push(`## Tasks\n${bullets}`);
  } else if (effectivePlanContent) {
    // Ultra-thin slice with no task entries at all — include raw plan content
    sections.push(`## Tasks\n- (see slice plan for details)`);
  }

  // ## Linear Issues (optional — only when cross-linking is active)
  const linearSection = buildLinearReferencesSection(options?.linearReferences);
  if (linearSection) {
    sections.push(linearSection);
  }

  const body = sections.join("\n\n");

  // Final guard: should never be empty given the sections above, but ensure
  // we never return an empty string regardless of input.
  return body || `## ${sliceTitle}\n\nNo slice artifacts found.`;
}
