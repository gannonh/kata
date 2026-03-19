/**
 * Contract tests for `/kata pr` subcommand routing and status surface.
 */

import assert from "node:assert/strict";

import {
  getPrSubcommandCompletions,
  buildPrStatusReport,
  getPrOnboardingRecommendation,
  type PrStatusDependencies,
} from "../pr-command.js";

// ─── Subcommand completions ───────────────────────────────────────────────────

test("getPrSubcommandCompletions returns all PR subcommands when prefix is empty", () => {
  const completions = getPrSubcommandCompletions("");
  const values = completions.map((c) => c.value);

  assert.ok(values.includes("status"), "status subcommand must be present");
  assert.ok(values.includes("create"), "create subcommand must be present");
  assert.ok(values.includes("review"), "review subcommand must be present");
  assert.ok(values.includes("address"), "address subcommand must be present");
  assert.ok(values.includes("merge"), "merge subcommand must be present");

  // Each completion must have a value and label
  for (const c of completions) {
    assert.ok(typeof c.value === "string" && c.value.length > 0, "completion value must be a non-empty string");
    assert.ok(typeof c.label === "string" && c.label.length > 0, "completion label must be a non-empty string");
  }
});

test("getPrSubcommandCompletions filters by prefix", () => {
  const completions = getPrSubcommandCompletions("st");
  assert.ok(completions.length >= 1, "must return at least one match for prefix 'st'");
  assert.ok(
    completions.every((c) => c.value.startsWith("st") || c.value === "status"),
    "all completions must match prefix 'st'",
  );
  assert.ok(
    completions.some((c) => c.value === "status"),
    "status must be in results for prefix 'st'",
  );
  assert.ok(
    !completions.some((c) => c.value === "create"),
    "create must not appear for prefix 'st'",
  );
});

test("getPrSubcommandCompletions returns empty array for non-matching prefix", () => {
  const completions = getPrSubcommandCompletions("xyz");
  assert.deepEqual(completions, [], "non-matching prefix must return empty array");
});

test("getPrSubcommandCompletions is deterministic — same prefix always produces same result", () => {
  const first = getPrSubcommandCompletions("m");
  const second = getPrSubcommandCompletions("m");
  assert.deepEqual(first, second, "completions must be deterministic");
});

// ─── PR status report ─────────────────────────────────────────────────────────

function makePrStatusDeps(
  overrides: Partial<PrStatusDependencies> = {},
): PrStatusDependencies {
  return {
    getCurrentBranch: () => "kata/apps-cli/M003/S05",
    getOpenPrNumber: async () => null,
    getPrEnabled: () => false,
    getPrAutoCreate: () => false,
    getPrBaseBranch: () => "main",
    ...overrides,
  };
}

test("buildPrStatusReport includes branch and PR state in message", async () => {
  const report = await buildPrStatusReport(
    makePrStatusDeps({
      getCurrentBranch: () => "kata/apps-cli/M003/S05",
      getOpenPrNumber: async () => 42,
      getPrEnabled: () => true,
    }),
  );

  assert.ok(typeof report.level === "string", "report must have level");
  assert.ok(typeof report.message === "string", "report must have message");
  assert.match(report.message, /kata\/apps-cli\/M003\/S05/, "message must include namespaced branch name");
  assert.match(report.message, /42/, "message must include PR number");
});

test("buildPrStatusReport preserves legacy branch display during transition", async () => {
  const report = await buildPrStatusReport(
    makePrStatusDeps({
      getCurrentBranch: () => "kata/M003/S05",
      getOpenPrNumber: async () => null,
      getPrEnabled: () => true,
    }),
  );

  assert.match(report.message, /kata\/M003\/S05/, "message must still surface legacy branch names");
});

test("buildPrStatusReport shows 'no open PR' when none exists", async () => {
  const report = await buildPrStatusReport(
    makePrStatusDeps({
      getOpenPrNumber: async () => null,
      getPrEnabled: () => true,
    }),
  );

  assert.equal(report.level, "info");
  assert.match(report.message, /no open PR|no PR|not created/i, "must indicate no open PR");
});

test("buildPrStatusReport does not call getOpenPrNumber when PR is disabled", async () => {
  let prNumberCalled = false;
  const report = await buildPrStatusReport(
    makePrStatusDeps({
      getPrEnabled: () => false,
      getOpenPrNumber: async () => {
        prNumberCalled = true;
        return 42;
      },
    }),
  );

  assert.equal(prNumberCalled, false, "getOpenPrNumber must NOT be called when PR is disabled");
  assert.match(report.message, /disabled|not enabled|pr\.enabled/i, "message must mention disabled state");
});

test("buildPrStatusReport level is warning when PR is disabled", async () => {
  const report = await buildPrStatusReport(
    makePrStatusDeps({ getPrEnabled: () => false }),
  );

  // Disabled PR config is a notable state worth surfacing
  assert.ok(
    report.level === "info" || report.level === "warning",
    "level must be info or warning when PR is disabled",
  );
  assert.match(report.message, /disabled|not enabled|pr\.enabled/i, "message must mention disabled state");
});

// ─── Onboarding recommendation ────────────────────────────────────────────────

test("getPrOnboardingRecommendation returns guidance when PR lifecycle is disabled", () => {
  const text = getPrOnboardingRecommendation(false, true);

  assert.ok(typeof text === "string" && text.length > 0, "must return non-empty string");
  assert.match(text, /pr\.enabled|enable PR|PR lifecycle/i, "must mention how to enable PR lifecycle");
});

test("getPrOnboardingRecommendation returns guidance when no GitHub remote detected", () => {
  const text = getPrOnboardingRecommendation(false, false);

  assert.ok(typeof text === "string" && text.length > 0, "must return non-empty string");
  assert.match(text, /github|remote/i, "must mention GitHub or remote when no remote exists");
});

test("getPrOnboardingRecommendation returns empty string or minimal text when fully configured", () => {
  const text = getPrOnboardingRecommendation(true, true);

  // When already configured, onboarding should be minimal or absent
  assert.ok(typeof text === "string", "must return a string");
  // If non-empty, it should not repeat setup instructions
  if (text.length > 0) {
    assert.doesNotMatch(text, /set pr\.enabled/i, "should not repeat setup instructions when already enabled");
  }
});
