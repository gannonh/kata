/**
 * Contract tests for auto-mode post-complete-slice decision matrix.
 *
 * These tests FAIL until T03 creates `pr-auto.ts` and exports:
 *   - decidePostCompleteSliceAction(prPrefs)
 *   - formatPrAutoCreateFailure(failure)
 *
 * Expected failure: MODULE_NOT_FOUND for ../pr-auto.js
 *
 * Pins D049: auto-mode creates a PR and pauses when pr.enabled && pr.auto_create;
 * legacy squash-merge remains only for PR-disabled projects.
 */

import assert from "node:assert/strict";

// This import intentionally fails until T03 creates the module.
import {
  decidePostCompleteSliceAction,
  formatPrAutoCreateFailure,
  type PostCompleteSliceDecision,
  type PrAutoCreateFailure,
} from "../pr-auto.js";

// ─── Decision matrix ──────────────────────────────────────────────────────────

test("decidePostCompleteSliceAction returns legacy-squash-merge when pr prefs are absent", () => {
  const decision: PostCompleteSliceDecision = decidePostCompleteSliceAction(undefined);
  assert.equal(
    decision,
    "legacy-squash-merge",
    "undefined prPrefs must produce legacy-squash-merge",
  );
});

test("decidePostCompleteSliceAction returns legacy-squash-merge when pr.enabled is false", () => {
  const decision = decidePostCompleteSliceAction({ enabled: false });
  assert.equal(
    decision,
    "legacy-squash-merge",
    "pr.enabled=false must produce legacy-squash-merge",
  );
});

test("decidePostCompleteSliceAction returns legacy-squash-merge when pr.enabled is not set", () => {
  const decision = decidePostCompleteSliceAction({});
  assert.equal(
    decision,
    "legacy-squash-merge",
    "empty pr prefs (no enabled field) must produce legacy-squash-merge",
  );
});

test("decidePostCompleteSliceAction returns auto-create-and-pause when pr.enabled && pr.auto_create", () => {
  const decision = decidePostCompleteSliceAction({ enabled: true, auto_create: true });
  assert.equal(
    decision,
    "auto-create-and-pause",
    "pr.enabled=true && pr.auto_create=true must produce auto-create-and-pause",
  );
});

test("decidePostCompleteSliceAction returns skip-notify when pr.enabled=true but auto_create is false", () => {
  const decision = decidePostCompleteSliceAction({ enabled: true, auto_create: false });
  assert.equal(
    decision,
    "skip-notify",
    "pr.enabled=true && pr.auto_create=false must produce skip-notify",
  );
});

test("decidePostCompleteSliceAction returns skip-notify when pr.enabled=true and auto_create is unset", () => {
  const decision = decidePostCompleteSliceAction({ enabled: true });
  assert.equal(
    decision,
    "skip-notify",
    "pr.enabled=true with no auto_create must produce skip-notify (safe default: don't auto-squash, don't auto-create)",
  );
});

test("decidePostCompleteSliceAction is pure — repeated calls with same input are consistent", () => {
  const a = decidePostCompleteSliceAction({ enabled: true, auto_create: true });
  const b = decidePostCompleteSliceAction({ enabled: true, auto_create: true });
  assert.equal(a, b, "decidePostCompleteSliceAction must be a pure function");
});

// ─── Valid decision values ────────────────────────────────────────────────────

test("all valid inputs produce one of the three expected decisions", () => {
  const validDecisions = new Set<PostCompleteSliceDecision>([
    "legacy-squash-merge",
    "auto-create-and-pause",
    "skip-notify",
  ]);

  const inputs = [
    undefined,
    {},
    { enabled: false },
    { enabled: true },
    { enabled: true, auto_create: false },
    { enabled: true, auto_create: true },
    { enabled: false, auto_create: true }, // auto_create ignored when enabled=false
  ];

  for (const input of inputs) {
    const decision = decidePostCompleteSliceAction(input as Parameters<typeof decidePostCompleteSliceAction>[0]);
    assert.ok(
      validDecisions.has(decision),
      `Input ${JSON.stringify(input)} produced unexpected decision: ${decision}`,
    );
  }
});

// ─── PR auto-create failure diagnostics ──────────────────────────────────────

test("formatPrAutoCreateFailure returns a non-empty string", () => {
  const failure: PrAutoCreateFailure = {
    phase: "gh-unauth",
    error: "gh is not authenticated",
    hint: "Run: gh auth login",
  };
  const text = formatPrAutoCreateFailure(failure);
  assert.ok(typeof text === "string" && text.length > 0, "must return non-empty string");
});

test("formatPrAutoCreateFailure includes the phase in output", () => {
  const failure: PrAutoCreateFailure = {
    phase: "pr-create-failed",
    error: "API rate limit exceeded",
    hint: "Try again in a few minutes",
  };
  const text = formatPrAutoCreateFailure(failure);
  assert.match(text, /pr-create-failed/, "output must include phase for machine readability");
});

test("formatPrAutoCreateFailure includes actionable hint", () => {
  const failure: PrAutoCreateFailure = {
    phase: "gh-missing",
    error: "gh CLI not found",
    hint: "Install gh CLI: https://cli.github.com",
  };
  const text = formatPrAutoCreateFailure(failure);
  assert.match(
    text,
    /Install gh CLI|gh CLI/i,
    "output must include the actionable hint",
  );
});

test("formatPrAutoCreateFailure produces diagnostic output inspectable by a future agent", () => {
  const failure: PrAutoCreateFailure = {
    phase: "branch-parse-failed",
    error: "could not detect slice ID from branch kata/M003/S05",
    hint: "Ensure the branch follows kata/MXXX/SYY naming convention",
  };
  const text = formatPrAutoCreateFailure(failure);

  // A future agent must be able to:
  // 1. Identify the phase (what step failed)
  // 2. Read the error (what went wrong)
  // 3. Follow the hint (what to do next)
  assert.match(text, /branch-parse-failed|branch/, "must include failure phase");
  assert.match(text, /kata\/M003\/S05|branch/, "must reference the failing context");
});
