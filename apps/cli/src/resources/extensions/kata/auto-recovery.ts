/**
 * Auto-recovery decision logic — pure/filesystem-only functions for crash
 * recovery, provider backoff, skip artifacts, and expected artifact resolution.
 *
 * Extracted from auto.ts to enable isolated testing. No pi SDK imports.
 */

import { join } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  resolveTasksDir,
  resolveSlicePath,
  resolveSliceFile,
  resolveMilestonePath,
  buildTaskFileName,
  buildMilestoneFileName,
  buildSliceFileName,
  relMilestoneFile,
  relSliceFile,
} from "./paths.js";

/** Backoff delay in ms: 5s, 10s, 20s, 40s, 60s, 60s, ... */
export function providerBackoffMs(attempt: number): number {
  return Math.min(5000 * Math.pow(2, attempt), 60_000);
}

/**
 * Write skip artifacts for a stuck execute-task: a blocker task summary and
 * the [x] checkbox in the slice plan. Returns true if artifacts were written.
 */
export function skipExecuteTask(
  base: string,
  mid: string,
  sid: string,
  tid: string,
  status: { summaryExists: boolean; taskChecked: boolean },
  reason: string,
  maxAttempts: number,
): boolean {
  // Write a blocker task summary if missing.
  if (!status.summaryExists) {
    const tasksDir = resolveTasksDir(base, mid, sid);
    const sDir = resolveSlicePath(base, mid, sid);
    const targetDir = tasksDir ?? (sDir ? join(sDir, "tasks") : null);
    if (!targetDir) return false;
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    const summaryPath = join(targetDir, buildTaskFileName(tid, "SUMMARY"));
    const content = [
      `# BLOCKER — task skipped by auto-mode recovery`,
      ``,
      `Task \`${tid}\` in slice \`${sid}\` (milestone \`${mid}\`) failed to complete after ${reason} recovery exhausted ${maxAttempts} attempts.`,
      ``,
      `This placeholder was written by auto-mode so the pipeline can advance.`,
      `Review this task manually and replace this file with a real summary.`,
    ].join("\n");
    writeFileSync(summaryPath, content, "utf-8");
  }

  // Mark [x] in the slice plan if not already checked.
  if (!status.taskChecked) {
    const planAbs = resolveSliceFile(base, mid, sid, "PLAN");
    if (planAbs && existsSync(planAbs)) {
      const planContent = readFileSync(planAbs, "utf-8");
      const escapedTid = tid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^(- \\[) \\] (\\*\\*${escapedTid}:)`, "m");
      if (re.test(planContent)) {
        writeFileSync(planAbs, planContent.replace(re, "$1x] $2"), "utf-8");
      }
    }
  }

  return true;
}

/**
 * Resolve the expected artifact for a non-execute-task unit to an absolute path.
 * Returns null for unit types that don't produce a single file (execute-task,
 * complete-slice, replan-slice).
 */
export function resolveExpectedArtifactPath(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const parts = unitId.split("/");
  const mid = parts[0]!;
  const sid = parts[1];
  switch (unitType) {
    case "research-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "RESEARCH")) : null;
    }
    case "plan-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "ROADMAP")) : null;
    }
    case "research-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "RESEARCH")) : null;
    }
    case "plan-slice": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "PLAN")) : null;
    }
    case "reassess-roadmap": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "ASSESSMENT")) : null;
    }
    case "run-uat": {
      const dir = resolveSlicePath(base, mid, sid!);
      return dir ? join(dir, buildSliceFileName(sid!, "UAT-RESULT")) : null;
    }
    case "complete-milestone": {
      const dir = resolveMilestonePath(base, mid);
      return dir ? join(dir, buildMilestoneFileName(mid, "SUMMARY")) : null;
    }
    default:
      return null;
  }
}

/**
 * Write a placeholder artifact so the pipeline can advance past a stuck unit.
 * Returns the diagnostic description of what was written, or null if the path
 * couldn't be resolved.
 */
export function writeBlockerPlaceholder(
  unitType: string,
  unitId: string,
  base: string,
  reason: string,
): string | null {
  const absPath = resolveExpectedArtifactPath(unitType, unitId, base);
  if (!absPath) return null;
  const dir = absPath.substring(0, absPath.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const content = [
    `# BLOCKER — auto-mode recovery failed`,
    ``,
    `Unit \`${unitType}\` for \`${unitId}\` failed to produce this artifact after idle recovery exhausted all retries.`,
    ``,
    `**Reason**: ${reason}`,
    ``,
    `This placeholder was written by auto-mode so the pipeline can advance.`,
    `Review and replace this file before relying on downstream artifacts.`,
  ].join("\n");
  writeFileSync(absPath, content, "utf-8");
  return diagnoseExpectedArtifact(unitType, unitId, base);
}

/**
 * Return a human-readable diagnostic description of the expected artifact
 * for a given unit type/id, or null for unknown types.
 */
export function diagnoseExpectedArtifact(
  unitType: string,
  unitId: string,
  base: string,
): string | null {
  const parts = unitId.split("/");
  const mid = parts[0];
  const sid = parts[1];
  switch (unitType) {
    case "research-milestone":
      return `${relMilestoneFile(base, mid!, "RESEARCH")} (milestone research)`;
    case "plan-milestone":
      return `${relMilestoneFile(base, mid!, "ROADMAP")} (milestone roadmap)`;
    case "research-slice":
      return `${relSliceFile(base, mid!, sid!, "RESEARCH")} (slice research)`;
    case "plan-slice":
      return `${relSliceFile(base, mid!, sid!, "PLAN")} (slice plan)`;
    case "execute-task": {
      const tid = parts[2];
      return `Task ${tid} marked [x] in ${relSliceFile(base, mid!, sid!, "PLAN")} + summary written`;
    }
    case "complete-slice":
      return `Slice ${sid} marked [x] in ${relMilestoneFile(base, mid!, "ROADMAP")} + summary written`;
    case "replan-slice":
      return `${relSliceFile(base, mid!, sid!, "REPLAN")} + updated ${relSliceFile(base, mid!, sid!, "PLAN")}`;
    case "reassess-roadmap":
      return `${relSliceFile(base, mid!, sid!, "ASSESSMENT")} (roadmap reassessment)`;
    case "run-uat":
      return `${relSliceFile(base, mid!, sid!, "UAT-RESULT")} (UAT result)`;
    case "complete-milestone":
      return `${relMilestoneFile(base, mid!, "SUMMARY")} (milestone summary)`;
    default:
      return null;
  }
}
