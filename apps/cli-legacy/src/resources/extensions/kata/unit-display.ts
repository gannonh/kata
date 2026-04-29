/**
 * Unified display metadata for unit types.
 * Single source of truth for verb, phase label, and short label.
 */

export type UnitType =
  | "research-milestone"
  | "research-slice"
  | "plan-milestone"
  | "plan-slice"
  | "execute-task"
  | "complete-slice"
  | "replan-slice"
  | "reassess-roadmap"
  | "run-uat";

interface UnitMeta {
  verb: string;
  phaseLabel: string;
  shortLabel: string;
}

const UNIT_META: Record<UnitType, UnitMeta> = {
  "research-milestone": { verb: "researching",   phaseLabel: "RESEARCH", shortLabel: "Research" },
  "research-slice":     { verb: "researching",   phaseLabel: "RESEARCH", shortLabel: "Research" },
  "plan-milestone":     { verb: "planning",      phaseLabel: "PLAN",     shortLabel: "Plan" },
  "plan-slice":         { verb: "planning",      phaseLabel: "PLAN",     shortLabel: "Plan" },
  "execute-task":       { verb: "executing",     phaseLabel: "EXECUTE",  shortLabel: "Execute" },
  "complete-slice":     { verb: "completing",    phaseLabel: "COMPLETE", shortLabel: "Complete" },
  "replan-slice":       { verb: "replanning",    phaseLabel: "REPLAN",   shortLabel: "Replan" },
  "reassess-roadmap":   { verb: "reassessing",   phaseLabel: "REASSESS", shortLabel: "Reassess" },
  "run-uat":            { verb: "running UAT",   phaseLabel: "UAT",      shortLabel: "UAT" },
};

function getMeta(unitType: string): UnitMeta | null {
  return UNIT_META[unitType as UnitType] ?? null;
}

export function unitVerb(unitType: string): string {
  return getMeta(unitType)?.verb ?? unitType;
}

export function unitPhaseLabel(unitType: string): string {
  return getMeta(unitType)?.phaseLabel ?? unitType.toUpperCase();
}

export function unitLabel(unitType: string): string {
  return getMeta(unitType)?.shortLabel ?? unitType;
}
