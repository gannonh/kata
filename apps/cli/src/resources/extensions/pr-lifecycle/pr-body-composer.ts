/**
 * pr-body-composer.ts — Compose markdown PR body from Kata Linear artifacts.
 */

import { parsePlan, parseSummary } from "../kata/files.js";
import { buildLinearReferencesSection } from "../kata/linear-crosslink.js";

export interface ComposePRBodyOptions {
  /** Linear issue identifiers (e.g. ["KAT-42"]) to include as references. */
  linearReferences?: string[];
  /**
   * Pre-fetched Linear artifact content.
   * Keys: "PLAN", "SUMMARY".
   */
  linearDocuments: Record<string, string>;
}

/**
 * Compose a markdown PR body from the active slice plan/summary.
 * In Linear mode, these artifacts are sourced from `linearDocuments`.
 */
export async function composePRBody(
  _milestoneId: string,
  sliceId: string,
  _cwd: string,
  options: ComposePRBodyOptions,
): Promise<string> {
  const effectivePlanContent = options.linearDocuments["PLAN"];
  if (!effectivePlanContent) {
    throw new Error(`Missing required PR artifact: ${sliceId}-PLAN`);
  }

  const effectiveSummaryContent = options.linearDocuments["SUMMARY"] ?? null;

  let sliceTitle = `${sliceId}: (no slice plan found)`;
  let mustHaves: string[] = [];
  let resolvedTaskTitles: string[] = [];

  const plan = parsePlan(effectivePlanContent);
  sliceTitle = plan.title
    ? `${plan.id ? `${plan.id}: ` : ""}${plan.title}`
    : sliceTitle;
  mustHaves = plan.mustHaves ?? [];
  resolvedTaskTitles = plan.tasks.map((task) => `${task.id}: ${task.title}`);

  let oneLiner: string | null = null;
  if (effectiveSummaryContent) {
    const summary = parseSummary(effectiveSummaryContent);
    oneLiner = summary.oneLiner || null;
  }

  const sections: string[] = [];
  sections.push(`## What Changed\n${oneLiner ?? `See slice plan: ${sliceTitle}`}`);

  if (mustHaves.length > 0) {
    sections.push(`## Must-Haves\n${mustHaves.map((mh) => `- ${mh}`).join("\n")}`);
  } else {
    sections.push("## Must-Haves\n- See slice plan");
  }

  if (resolvedTaskTitles.length > 0) {
    sections.push(`## Tasks\n${resolvedTaskTitles.map((t) => `- ${t}`).join("\n")}`);
  } else if (effectivePlanContent) {
    sections.push("## Tasks\n- (see slice plan for details)");
  }

  const linearSection = buildLinearReferencesSection(options.linearReferences);
  if (linearSection) {
    sections.push(linearSection);
  }

  return sections.join("\n\n");
}
