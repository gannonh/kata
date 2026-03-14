/**
 * Phase Recipes — the shared declaration of WHAT each workflow phase reads and writes.
 *
 * This is the single source of truth that both file-backed (auto.ts) and Linear-backed
 * (linear-auto.ts) renderers consume. Tests enforce that both implementations match
 * the recipes declared here.
 *
 * A recipe is a data structure, not an abstraction layer. It declares:
 * - Required document reads (fail if missing)
 * - Optional document reads (skip if missing)
 * - Required document writes (must happen before phase ends)
 * - Prior summary injection rules
 * - Phase-specific flags
 *
 * Document titles use template variables: ${mid}, ${sid}, ${tid}, ${completedSid}.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DocumentRef {
  /**
   * Document title pattern.
   * Uses template variables: ${mid}, ${sid}, ${tid}, ${completedSid}
   * Examples: "${mid}-ROADMAP", "${tid}-PLAN", "DECISIONS"
   */
  title: string;
  /** Why this document is read/written at this phase */
  purpose: string;
  /** If true, phase should fail visibly when document is missing */
  required: boolean;
}

export interface PhaseRecipe {
  /** Phase name matching the unit type in dispatch (e.g. "execute-task", "plan-slice") */
  phase: string;
  /** Human description of what this phase does */
  description: string;
  /** Documents to read before executing the phase */
  reads: DocumentRef[];
  /** Documents to write as output of the phase */
  writes: DocumentRef[];
  /** Read prior task summaries for carry-forward context */
  injectPriorSummaries: boolean;
  /** Read dependency slice summaries per roadmap depends:[] */
  injectDependencySummaries: boolean;
  /** Check for continue/resume state (continue.md or partial summary) */
  checkContinue: boolean;
}

// ─── Recipe Definitions ──────────────────────────────────────────────────────

export const PHASE_RECIPES: readonly PhaseRecipe[] = [
  {
    phase: "research-milestone",
    description: "Scout the codebase and relevant docs before planning a milestone roadmap.",
    reads: [
      { title: "${mid}-CONTEXT", purpose: "Milestone context with user decisions", required: true },
      { title: "PROJECT", purpose: "Project-level description", required: false },
      { title: "REQUIREMENTS", purpose: "Project requirements", required: false },
      { title: "DECISIONS", purpose: "Decisions register", required: false },
    ],
    writes: [
      { title: "${mid}-RESEARCH", purpose: "Milestone research findings", required: true },
    ],
    injectPriorSummaries: false,
    injectDependencySummaries: false,
    checkContinue: false,
  },
  {
    phase: "plan-milestone",
    description: "Decompose a milestone into demoable vertical slices with risk ordering.",
    reads: [
      { title: "${mid}-CONTEXT", purpose: "Milestone context with user decisions", required: true },
      { title: "${mid}-RESEARCH", purpose: "Milestone research findings", required: false },
      { title: "PRIOR-MILESTONE-SUMMARY", purpose: "Prior milestone summary for continuity", required: false },
      { title: "PROJECT", purpose: "Project-level description", required: false },
      { title: "REQUIREMENTS", purpose: "Project requirements", required: false },
      { title: "DECISIONS", purpose: "Decisions register", required: false },
    ],
    writes: [
      { title: "${mid}-ROADMAP", purpose: "Milestone roadmap with slices", required: true },
    ],
    injectPriorSummaries: false,
    injectDependencySummaries: false,
    checkContinue: false,
  },
  {
    phase: "research-slice",
    description: "Scout the codebase for a specific slice before planning tasks.",
    reads: [
      { title: "${mid}-ROADMAP", purpose: "Milestone roadmap for slice scope", required: true },
      { title: "${mid}-CONTEXT", purpose: "Milestone context", required: false },
      { title: "${mid}-RESEARCH", purpose: "Milestone research", required: false },
      { title: "DECISIONS", purpose: "Decisions register", required: false },
      { title: "REQUIREMENTS", purpose: "Project requirements", required: false },
    ],
    writes: [
      { title: "${sid}-RESEARCH", purpose: "Slice research findings", required: true },
    ],
    injectPriorSummaries: false,
    injectDependencySummaries: true,
    checkContinue: false,
  },
  {
    phase: "plan-slice",
    description: "Decompose a slice into context-window-sized tasks with must-haves.",
    reads: [
      { title: "${mid}-ROADMAP", purpose: "Milestone roadmap for slice scope", required: true },
      { title: "${sid}-RESEARCH", purpose: "Slice research findings", required: false },
      { title: "DECISIONS", purpose: "Decisions register", required: false },
      { title: "REQUIREMENTS", purpose: "Project requirements", required: false },
    ],
    writes: [
      { title: "${sid}-PLAN", purpose: "Slice plan with task decomposition", required: true },
    ],
    injectPriorSummaries: false,
    injectDependencySummaries: true,
    checkContinue: false,
  },
  {
    phase: "execute-task",
    description: "Execute one task: read the plan, do the work, verify must-haves.",
    reads: [
      { title: "${tid}-PLAN", purpose: "Task execution contract", required: true },
      { title: "${sid}-PLAN", purpose: "Slice context excerpt (goal, demo, verification)", required: false },
    ],
    writes: [
      { title: "${tid}-SUMMARY", purpose: "Task completion summary", required: true },
    ],
    injectPriorSummaries: true,
    injectDependencySummaries: false,
    checkContinue: true,
  },
  {
    phase: "complete-slice",
    description: "Write slice summary and UAT after all tasks complete.",
    reads: [
      { title: "${mid}-ROADMAP", purpose: "Milestone roadmap for success criteria", required: true },
      { title: "${sid}-PLAN", purpose: "Slice plan for success criteria", required: true },
      { title: "REQUIREMENTS", purpose: "Project requirements for validation", required: false },
    ],
    writes: [
      { title: "${sid}-SUMMARY", purpose: "Slice completion summary", required: true },
      { title: "${sid}-UAT", purpose: "User acceptance test script", required: true },
    ],
    injectPriorSummaries: true,
    injectDependencySummaries: false,
    checkContinue: false,
  },
  {
    phase: "complete-milestone",
    description: "Write milestone summary after all slices complete.",
    reads: [
      { title: "${mid}-ROADMAP", purpose: "Milestone roadmap", required: true },
      { title: "REQUIREMENTS", purpose: "Project requirements", required: false },
      { title: "DECISIONS", purpose: "Decisions register", required: false },
      { title: "PROJECT", purpose: "Project-level description", required: false },
      { title: "${mid}-CONTEXT", purpose: "Milestone context", required: false },
    ],
    writes: [
      { title: "${mid}-SUMMARY", purpose: "Milestone completion summary", required: true },
    ],
    injectPriorSummaries: true,
    injectDependencySummaries: false,
    checkContinue: false,
  },
  {
    phase: "replan-slice",
    description: "Replan a slice after a blocker is discovered during task execution.",
    reads: [
      { title: "${mid}-ROADMAP", purpose: "Milestone roadmap", required: true },
      { title: "${sid}-PLAN", purpose: "Current slice plan", required: true },
      { title: "DECISIONS", purpose: "Decisions register", required: false },
    ],
    writes: [
      { title: "${sid}-REPLAN", purpose: "Slice replan with updated tasks", required: true },
    ],
    injectPriorSummaries: false,
    injectDependencySummaries: false,
    checkContinue: false,
  },
  {
    phase: "reassess-roadmap",
    description: "Reassess the roadmap after a slice completes to adapt remaining work.",
    reads: [
      { title: "${mid}-ROADMAP", purpose: "Current roadmap", required: true },
      { title: "${completedSid}-SUMMARY", purpose: "Completed slice summary", required: true },
      { title: "PROJECT", purpose: "Project-level description", required: false },
      { title: "REQUIREMENTS", purpose: "Project requirements", required: false },
      { title: "DECISIONS", purpose: "Decisions register", required: false },
    ],
    writes: [
      { title: "${completedSid}-ASSESSMENT", purpose: "Roadmap assessment after slice completion", required: true },
    ],
    injectPriorSummaries: false,
    injectDependencySummaries: false,
    checkContinue: false,
  },
  {
    phase: "run-uat",
    description: "Execute user acceptance tests for a completed slice.",
    reads: [
      { title: "${sid}-UAT", purpose: "UAT test script", required: true },
      { title: "${sid}-SUMMARY", purpose: "Slice summary for context", required: false },
      { title: "PROJECT", purpose: "Project-level description", required: false },
    ],
    writes: [
      { title: "${sid}-UAT-RESULT", purpose: "UAT execution results", required: true },
    ],
    injectPriorSummaries: false,
    injectDependencySummaries: false,
    checkContinue: false,
  },
] as const;

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

/** Get the recipe for a specific phase, or undefined if not found. */
export function getRecipe(phase: string): PhaseRecipe | undefined {
  return PHASE_RECIPES.find((r) => r.phase === phase);
}

/** Get all phase names that have recipes. */
export function getRecipePhases(): string[] {
  return PHASE_RECIPES.map((r) => r.phase);
}

/**
 * Get the required reads for a phase.
 * Returns only documents where required === true.
 */
export function getRequiredReads(phase: string): DocumentRef[] {
  const recipe = getRecipe(phase);
  if (!recipe) return [];
  return recipe.reads.filter((r) => r.required);
}

/**
 * Get the optional reads for a phase.
 * Returns only documents where required === false.
 */
export function getOptionalReads(phase: string): DocumentRef[] {
  const recipe = getRecipe(phase);
  if (!recipe) return [];
  return recipe.reads.filter((r) => !r.required);
}
