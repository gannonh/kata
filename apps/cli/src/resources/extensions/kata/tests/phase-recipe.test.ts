import test from "node:test";
import assert from "node:assert/strict";

import { PHASE_RECIPES, getRecipe, getRecipePhases, getRequiredReads, getOptionalReads } from "../phase-recipes.ts";

// ─── Structural Invariants ────────────────────────────────────────────────────

test("every recipe has a unique phase name", () => {
  const phases = PHASE_RECIPES.map((r) => r.phase);
  const unique = new Set(phases);
  assert.equal(unique.size, phases.length, `Duplicate phases: ${phases.filter((p, i) => phases.indexOf(p) !== i)}`);
});

test("every recipe has at least one write", () => {
  for (const recipe of PHASE_RECIPES) {
    assert.ok(
      recipe.writes.length > 0,
      `Phase ${recipe.phase} has no writes — every phase must produce at least one artifact`,
    );
  }
});

test("every recipe has at least one read", () => {
  for (const recipe of PHASE_RECIPES) {
    assert.ok(
      recipe.reads.length > 0,
      `Phase ${recipe.phase} has no reads — every phase must read at least one input`,
    );
  }
});

test("every recipe has a non-empty description", () => {
  for (const recipe of PHASE_RECIPES) {
    assert.ok(recipe.description.length > 0, `Phase ${recipe.phase} has empty description`);
  }
});

// ─── Coverage: File-Mode Dispatch ─────────────────────────────────────────────

/**
 * These are the unit types dispatched in auto.ts dispatchNextUnit().
 * Each MUST have a corresponding recipe.
 */
const FILE_MODE_UNIT_TYPES = [
  "research-milestone",
  "plan-milestone",
  "research-slice",
  "plan-slice",
  "execute-task",
  "complete-slice",
  "complete-milestone",
  "replan-slice",
  "reassess-roadmap",
  "run-uat",
] as const;

test("every file-mode dispatch unit type has a recipe", () => {
  const recipePhases = new Set(getRecipePhases());
  for (const unitType of FILE_MODE_UNIT_TYPES) {
    assert.ok(
      recipePhases.has(unitType),
      `File-mode unit type "${unitType}" has no recipe. Add it to PHASE_RECIPES.`,
    );
  }
});

// ─── Coverage: Linear-Mode Dispatch ───────────────────────────────────────────

/**
 * These are the phases handled in selectLinearPrompt() in linear-auto.ts.
 * Non-actionable phases (complete, blocked) are excluded — they don't need recipes.
 */
const LINEAR_MODE_ACTIONABLE_PHASES = [
  "pre-planning",     // maps to plan-milestone
  "planning",         // maps to plan-slice
  "executing",        // maps to execute-task
  "verifying",        // maps to execute-task
  "summarizing",      // maps to complete-slice
] as const;

/**
 * Map from Linear actionable phase → recipe phase name.
 * This mapping is what selectLinearPrompt uses to select the right builder.
 */
const LINEAR_PHASE_TO_RECIPE: Record<string, string> = {
  "pre-planning": "plan-milestone",
  "planning": "plan-slice",
  "executing": "execute-task",
  "verifying": "execute-task",
  "summarizing": "complete-slice",
};

test("every Linear-mode actionable phase maps to a recipe", () => {
  const recipePhases = new Set(getRecipePhases());
  for (const phase of LINEAR_MODE_ACTIONABLE_PHASES) {
    const recipePhase = LINEAR_PHASE_TO_RECIPE[phase];
    assert.ok(recipePhase, `Linear phase "${phase}" has no recipe mapping in LINEAR_PHASE_TO_RECIPE`);
    assert.ok(
      recipePhases.has(recipePhase),
      `Linear phase "${phase}" maps to recipe "${recipePhase}" which doesn't exist in PHASE_RECIPES`,
    );
  }
});

// ─── Recipe Content: Document Read Parity ─────────────────────────────────────

/**
 * Verify that each recipe's required reads match what auto.ts actually inlines
 * via inlineFile() (required) and inlineFileOptional() / inlineKataRootFile() (optional).
 *
 * These tests codify the audit of auto.ts prompt builders and serve as the
 * enforcement mechanism: if someone adds a document read to auto.ts without
 * updating the recipe, these tests should be updated to catch the drift.
 */

test("research-milestone recipe matches auto.ts reads", () => {
  const recipe = getRecipe("research-milestone")!;
  assert.ok(recipe);
  // Required: context (inlineFile)
  const required = getRequiredReads("research-milestone");
  assert.deepEqual(required.map((r) => r.title), ["${mid}-CONTEXT"]);
  // Optional: project, requirements, decisions (inlineKataRootFile)
  const optional = getOptionalReads("research-milestone");
  const optTitles = optional.map((r) => r.title).sort();
  assert.deepEqual(optTitles, ["DECISIONS", "PROJECT", "REQUIREMENTS"]);
  // Writes: research
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${mid}-RESEARCH"]);
});

test("plan-milestone recipe matches auto.ts reads", () => {
  const recipe = getRecipe("plan-milestone")!;
  assert.ok(recipe);
  const required = getRequiredReads("plan-milestone");
  assert.deepEqual(required.map((r) => r.title), ["${mid}-CONTEXT"]);
  const optional = getOptionalReads("plan-milestone");
  const optTitles = optional.map((r) => r.title).sort();
  assert.deepEqual(optTitles, [
    "${mid}-RESEARCH",
    "DECISIONS",
    "PRIOR-MILESTONE-SUMMARY",
    "PROJECT",
    "REQUIREMENTS",
  ]);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${mid}-ROADMAP"]);
});

test("research-slice recipe matches auto.ts reads", () => {
  const recipe = getRecipe("research-slice")!;
  assert.ok(recipe);
  const required = getRequiredReads("research-slice");
  assert.deepEqual(required.map((r) => r.title), ["${mid}-ROADMAP"]);
  const optional = getOptionalReads("research-slice");
  const optTitles = optional.map((r) => r.title).sort();
  assert.deepEqual(optTitles, ["${mid}-CONTEXT", "${mid}-RESEARCH", "DECISIONS", "REQUIREMENTS"]);
  assert.ok(recipe.injectDependencySummaries);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${sid}-RESEARCH"]);
});

test("plan-slice recipe matches auto.ts reads", () => {
  const recipe = getRecipe("plan-slice")!;
  assert.ok(recipe);
  const required = getRequiredReads("plan-slice");
  assert.deepEqual(required.map((r) => r.title), ["${mid}-ROADMAP"]);
  const optional = getOptionalReads("plan-slice");
  const optTitles = optional.map((r) => r.title).sort();
  assert.deepEqual(optTitles, ["${sid}-RESEARCH", "DECISIONS", "REQUIREMENTS"]);
  assert.ok(recipe.injectDependencySummaries);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${sid}-PLAN"]);
});

test("execute-task recipe matches auto.ts reads", () => {
  const recipe = getRecipe("execute-task")!;
  assert.ok(recipe);
  const required = getRequiredReads("execute-task");
  assert.deepEqual(required.map((r) => r.title), ["${tid}-PLAN"]);
  const optional = getOptionalReads("execute-task");
  assert.deepEqual(optional.map((r) => r.title), ["${sid}-PLAN"]);
  assert.ok(recipe.injectPriorSummaries);
  assert.ok(recipe.checkContinue);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${tid}-SUMMARY"]);
});

test("complete-slice recipe matches auto.ts reads", () => {
  const recipe = getRecipe("complete-slice")!;
  assert.ok(recipe);
  const required = getRequiredReads("complete-slice");
  assert.deepEqual(required.map((r) => r.title).sort(), ["${mid}-ROADMAP", "${sid}-PLAN"]);
  const optional = getOptionalReads("complete-slice");
  assert.deepEqual(optional.map((r) => r.title), ["REQUIREMENTS"]);
  assert.ok(recipe.injectPriorSummaries);
  assert.deepEqual(recipe.writes.map((w) => w.title).sort(), ["${sid}-SUMMARY", "${sid}-UAT"]);
});

test("complete-milestone recipe matches auto.ts reads", () => {
  const recipe = getRecipe("complete-milestone")!;
  assert.ok(recipe);
  const required = getRequiredReads("complete-milestone");
  assert.deepEqual(required.map((r) => r.title), ["${mid}-ROADMAP"]);
  const optional = getOptionalReads("complete-milestone");
  const optTitles = optional.map((r) => r.title).sort();
  assert.deepEqual(optTitles, ["${mid}-CONTEXT", "DECISIONS", "PROJECT", "REQUIREMENTS"]);
  assert.ok(recipe.injectPriorSummaries);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${mid}-SUMMARY"]);
});

test("replan-slice recipe matches auto.ts reads", () => {
  const recipe = getRecipe("replan-slice")!;
  assert.ok(recipe);
  const required = getRequiredReads("replan-slice");
  assert.deepEqual(required.map((r) => r.title).sort(), ["${mid}-ROADMAP", "${sid}-PLAN"]);
  const optional = getOptionalReads("replan-slice");
  assert.deepEqual(optional.map((r) => r.title), ["DECISIONS"]);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${sid}-REPLAN"]);
});

test("reassess-roadmap recipe matches auto.ts reads", () => {
  const recipe = getRecipe("reassess-roadmap")!;
  assert.ok(recipe);
  const required = getRequiredReads("reassess-roadmap");
  assert.deepEqual(required.map((r) => r.title).sort(), ["${completedSid}-SUMMARY", "${mid}-ROADMAP"]);
  const optional = getOptionalReads("reassess-roadmap");
  const optTitles = optional.map((r) => r.title).sort();
  assert.deepEqual(optTitles, ["DECISIONS", "PROJECT", "REQUIREMENTS"]);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${completedSid}-ASSESSMENT"]);
});

test("run-uat recipe matches auto.ts reads", () => {
  const recipe = getRecipe("run-uat")!;
  assert.ok(recipe);
  const required = getRequiredReads("run-uat");
  assert.deepEqual(required.map((r) => r.title), ["${sid}-UAT"]);
  const optional = getOptionalReads("run-uat");
  const optTitles = optional.map((r) => r.title).sort();
  assert.deepEqual(optTitles, ["${sid}-SUMMARY", "PROJECT"]);
  assert.deepEqual(recipe.writes.map((w) => w.title), ["${sid}-UAT-RESULT"]);
});

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

test("getRecipe returns undefined for unknown phase", () => {
  assert.equal(getRecipe("nonexistent-phase"), undefined);
});

test("getRecipePhases returns all 10 phases", () => {
  const phases = getRecipePhases();
  assert.equal(phases.length, 10);
});

test("getRequiredReads returns empty for unknown phase", () => {
  assert.deepEqual(getRequiredReads("nonexistent"), []);
});

test("getOptionalReads returns empty for unknown phase", () => {
  assert.deepEqual(getOptionalReads("nonexistent"), []);
});
