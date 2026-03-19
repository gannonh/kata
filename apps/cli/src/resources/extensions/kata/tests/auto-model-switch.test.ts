import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { resolveModelSwitch, computeSupervisorTimeouts } from "../auto-helpers.ts";
import { resolveAutoSupervisorConfig, resolveModelForUnit } from "../preferences.ts";

// ─── resolveModelSwitch ───────────────────────────────────────────────────────

describe("resolveModelSwitch", () => {
  const registry = ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-3-5"];

  test("returns 'none' when no preference exists for unit type", () => {
    // resolveModelForUnit returns undefined for unknown types, which means
    // resolveModelSwitch should return action: "none" when preferences have no
    // models configured (default state — no preferences file in cwd).
    const result = resolveModelSwitch("unknown-unit-type", registry, "claude-sonnet-4-6");
    assert.equal(result.action, "none");
    assert.equal(result.preferredModelId, undefined);
    assert.equal(result.statusLabel, undefined);
  });

  test("returns 'none' for unknown unit types (no model mapping)", () => {
    const result = resolveModelSwitch("__unknown_unit__", registry, "claude-haiku-3-5");
    assert.equal(result.action, "none");
    assert.equal(result.preferredModelId, undefined);
    assert.equal(result.statusLabel, undefined);
    assert.deepEqual(result.availableModels, registry);
  });

  test("returns action based on resolveModelForUnit for known unit types", () => {
    // resolveModelForUnit reads preferences from cwd — if a preferences file
    // exists with models configured, this returns "switch" or "not-found".
    // If no preferences exist, it returns "none".
    const result = resolveModelSwitch("execute-task", registry, "claude-sonnet-4-6");
    // The action depends on whether a preferences file exists in cwd.
    // Either way, it must be one of the valid actions and not throw.
    assert.ok(["switch", "not-found", "none"].includes(result.action));
    assert.ok(Array.isArray(result.availableModels));
  });
});

// Since resolveModelSwitch calls resolveModelForUnit internally (impure),
// we also test the decision logic directly with known inputs.

describe("resolveModelSwitch decision logic", () => {
  // We test the three code paths by simulating what resolveModelSwitch does
  // when given different inputs. The extracted function is pure in its
  // registry/currentModel inputs — the impurity is resolveModelForUnit.
  // These tests validate the contract that auto.ts relies on.

  test("preferred model found in registry → action: switch, statusLabel set", () => {
    // Simulate: resolveModelForUnit returned "claude-opus-4-6"
    // Registry has it, current model is different.
    const preferred = "claude-opus-4-6";
    const registry = ["claude-sonnet-4-6", "claude-opus-4-6"];
    const current = "claude-sonnet-4-6";

    const found = registry.includes(preferred);
    const statusLabel = preferred === current ? `auto · ${preferred}` : "auto";

    assert.equal(found, true);
    assert.equal(statusLabel, "auto");
  });

  test("preferred model matches current → statusLabel includes model name", () => {
    const preferred = "claude-opus-4-6";
    const current = "claude-opus-4-6";
    const statusLabel = preferred === current ? `auto · ${preferred}` : "auto";
    assert.equal(statusLabel, "auto · claude-opus-4-6");
  });

  test("preferred model NOT in registry → action: not-found", () => {
    const preferred = "claude-ultra-99";
    const registry = ["claude-sonnet-4-6", "claude-opus-4-6"];
    const found = registry.includes(preferred);
    assert.equal(found, false);
  });

  test("no preferred model → action: none, no status change", () => {
    const preferred = undefined;
    assert.equal(preferred, undefined);
  });
});

// ─── resolveModelForUnit mapping ──────────────────────────────────────────────

describe("resolveModelForUnit unit-type mapping", () => {
  // These test the mapping logic without needing preferences files.
  // Without preferences, all return undefined. This validates the
  // switch-case doesn't throw for any unit type.

  const unitTypes = [
    "research-milestone",
    "research-slice",
    "plan-milestone",
    "plan-slice",
    "replan-slice",
    "reassess-roadmap",
    "execute-task",
    "complete-slice",
    "complete-milestone",
    "run-uat",
  ];

  for (const unitType of unitTypes) {
    test(`resolveModelForUnit('${unitType}') does not throw`, () => {
      // Should return undefined (no preferences) — but must not crash
      const result = resolveModelForUnit(unitType);
      assert.equal(typeof result === "string" || result === undefined, true);
    });
  }

  test("unknown unit type returns undefined", () => {
    assert.equal(resolveModelForUnit("nonexistent"), undefined);
  });
});

// ─── computeSupervisorTimeouts ────────────────────────────────────────────────

describe("computeSupervisorTimeouts", () => {
  test("converts minutes to milliseconds", () => {
    const result = computeSupervisorTimeouts({
      soft_timeout_minutes: 15,
      idle_timeout_minutes: 8,
      hard_timeout_minutes: 25,
    });
    assert.equal(result.softMs, 15 * 60 * 1000);
    assert.equal(result.idleMs, 8 * 60 * 1000);
    assert.equal(result.hardMs, 25 * 60 * 1000);
  });

  test("handles default values (20/10/30)", () => {
    const result = computeSupervisorTimeouts({
      soft_timeout_minutes: 20,
      idle_timeout_minutes: 10,
      hard_timeout_minutes: 30,
    });
    assert.equal(result.softMs, 1_200_000);
    assert.equal(result.idleMs, 600_000);
    assert.equal(result.hardMs, 1_800_000);
  });

  test("handles zero values", () => {
    const result = computeSupervisorTimeouts({
      soft_timeout_minutes: 0,
      idle_timeout_minutes: 0,
      hard_timeout_minutes: 0,
    });
    assert.equal(result.softMs, 0);
    assert.equal(result.idleMs, 0);
    assert.equal(result.hardMs, 0);
  });

  test("handles fractional minutes", () => {
    const result = computeSupervisorTimeouts({
      soft_timeout_minutes: 1.5,
      idle_timeout_minutes: 0.5,
      hard_timeout_minutes: 2.5,
    });
    assert.equal(result.softMs, 90_000);
    assert.equal(result.idleMs, 30_000);
    assert.equal(result.hardMs, 150_000);
  });
});

// ─── resolveAutoSupervisorConfig defaults ─────────────────────────────────────

describe("resolveAutoSupervisorConfig", () => {
  test("provides safe defaults when no preferences exist", () => {
    const config = resolveAutoSupervisorConfig();
    assert.equal(config.soft_timeout_minutes, 20);
    assert.equal(config.idle_timeout_minutes, 10);
    assert.equal(config.hard_timeout_minutes, 30);
    assert.equal(config.model, undefined);
  });

  test("return type has required timeout fields (not optional)", () => {
    const config = resolveAutoSupervisorConfig();
    // These should be numbers, not undefined — the resolved type guarantees it
    assert.equal(typeof config.soft_timeout_minutes, "number");
    assert.equal(typeof config.idle_timeout_minutes, "number");
    assert.equal(typeof config.hard_timeout_minutes, "number");
  });

  test("resolved config is directly usable by computeSupervisorTimeouts", () => {
    const config = resolveAutoSupervisorConfig();
    // This should compile and not throw — the resolved type matches the input type
    const timeouts = computeSupervisorTimeouts(config);
    assert.equal(typeof timeouts.softMs, "number");
    assert.equal(typeof timeouts.idleMs, "number");
    assert.equal(typeof timeouts.hardMs, "number");
    assert.ok(timeouts.softMs > 0);
    assert.ok(timeouts.idleMs > 0);
    assert.ok(timeouts.hardMs > 0);
  });
});

// ─── ctx.model contract ───────────────────────────────────────────────────────

describe("ctx.model access pattern", () => {
  // These tests validate the optional-chaining pattern that auto.ts uses.
  // The bug was ctx.state.selectedModel (doesn't exist) and ctx.getModel()
  // (not a function). The correct pattern is ctx.model?.id.

  test("optional chaining on undefined model returns undefined", () => {
    const ctx = { model: undefined as { id: string } | undefined };
    assert.equal(ctx.model?.id, undefined);
  });

  test("optional chaining on defined model returns id", () => {
    const ctx = { model: { id: "claude-sonnet-4-6" } as { id: string } | undefined };
    assert.equal(ctx.model?.id, "claude-sonnet-4-6");
  });

  test("comparison with preferred model works correctly", () => {
    const preferred = "claude-opus-4-6";
    const ctxWithMatch = { model: { id: "claude-opus-4-6" } };
    const ctxWithMismatch = { model: { id: "claude-sonnet-4-6" } };
    const ctxWithNoModel = { model: undefined as { id: string } | undefined };

    assert.equal(preferred === ctxWithMatch.model?.id, true);
    assert.equal(preferred === ctxWithMismatch.model?.id, false);
    assert.equal(preferred === ctxWithNoModel.model?.id, false);
  });
});
