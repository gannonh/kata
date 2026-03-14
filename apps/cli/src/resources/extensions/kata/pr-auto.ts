/**
 * pr-auto.ts — Pure helpers for auto-mode post-complete-slice PR decisions.
 *
 * Expresses the post-`complete-slice` decision matrix as pure, testable logic
 * instead of embedding it ad hoc in auto.ts.
 *
 * Decision matrix (D049):
 *   - pr.enabled=false (or absent) → legacy-squash-merge (existing behavior unchanged)
 *   - pr.enabled=true && pr.auto_create=true → auto-create-and-pause
 *   - pr.enabled=true && pr.auto_create != true → skip-notify
 *     (safe default: don't squash-merge, don't auto-create — wait for manual PR)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Decision returned by decidePostCompleteSliceAction.
 * - `legacy-squash-merge` — PR lifecycle disabled; use the existing git squash-merge path.
 * - `auto-create-and-pause` — PR lifecycle enabled with auto_create; create the PR then pause.
 * - `skip-notify` — PR lifecycle enabled but no auto_create; do not squash-merge, notify only.
 */
export type PostCompleteSliceDecision =
  | "legacy-squash-merge"
  | "auto-create-and-pause"
  | "skip-notify";

/**
 * Structured PR auto-create failure, mirroring the { ok: false, phase, error, hint }
 * shape returned by kata_create_pr and runCreatePr.
 */
export interface PrAutoCreateFailure {
  phase: string;
  error: string;
  hint: string;
}

// ─── Decision matrix ──────────────────────────────────────────────────────────

/**
 * Derives what auto-mode should do after a slice completes, given the
 * project's PR preferences.
 *
 * Pure function — no side effects, no I/O. Deterministic.
 */
export function decidePostCompleteSliceAction(
  prPrefs: { enabled?: boolean; auto_create?: boolean } | null | undefined,
): PostCompleteSliceDecision {
  // No prefs or PR disabled → keep existing squash-merge behavior
  if (!prPrefs || !prPrefs.enabled) {
    return "legacy-squash-merge";
  }

  // PR enabled + auto_create explicitly true → create and pause for review
  if (prPrefs.auto_create === true) {
    return "auto-create-and-pause";
  }

  // PR enabled but auto_create is absent or false → skip merge, just notify
  return "skip-notify";
}

// ─── Failure formatting ───────────────────────────────────────────────────────

/**
 * Formats a PrAutoCreateFailure into a multi-line diagnostic string that a
 * future agent can parse to identify the failure phase, error cause, and
 * actionable next step.
 */
export function formatPrAutoCreateFailure(failure: PrAutoCreateFailure): string {
  return [
    `PR auto-create failed [phase: ${failure.phase}]`,
    `Error: ${failure.error}`,
    `Hint: ${failure.hint}`,
  ].join("\n");
}
