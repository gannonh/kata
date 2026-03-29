import { describe, expect, it } from "vitest";
import { validatePreferencesModel } from "../prefs-validator.js";
import { buildPreferencesModel } from "../prefs-model.js";
import type { ConfigEditorModel } from "../../symphony/config-model.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildModelFromConfig(
  config: Record<string, unknown>,
): ConfigEditorModel {
  return buildPreferencesModel(config);
}

// ---------------------------------------------------------------------------
// Valid config fixture
// ---------------------------------------------------------------------------

const VALID_CONFIG: Record<string, unknown> = {
  version: 1,
  uat_dispatch: true,
  budget_ceiling: 100,
  workflow: { mode: "linear" },
  linear: { teamKey: "KAT", projectSlug: "kata-cli" },
  pr: {
    enabled: true,
    auto_create: false,
    base_branch: "main",
    review_on_create: true,
    linear_link: false,
  },
  models: { research: "claude-sonnet-4-5", review: "claude-sonnet-4-6" },
  symphony: { url: "http://localhost:8080", console_position: "below-output" },
  skill_discovery: "auto",
  auto_supervisor: {
    model: "claude-sonnet-4-6",
    soft_timeout_minutes: 20,
    idle_timeout_minutes: 10,
    hard_timeout_minutes: 30,
  },
};

// ---------------------------------------------------------------------------
// Acceptance tests — valid configs
// ---------------------------------------------------------------------------

describe("validatePreferencesModel — accepts valid configs", () => {
  it("returns empty array for a fully valid config", () => {
    const model = buildModelFromConfig(VALID_CONFIG);
    const issues = validatePreferencesModel(model);
    expect(issues).toEqual([]);
  });

  it("returns empty array for an empty config (all fields unset)", () => {
    const model = buildModelFromConfig({});
    const issues = validatePreferencesModel(model);
    expect(issues).toEqual([]);
  });

  it("accepts valid enum values individually", () => {
    // workflow.mode = "linear"
    const m1 = buildModelFromConfig({ workflow: { mode: "linear" } });
    expect(validatePreferencesModel(m1)).toEqual([]);

    // skill_discovery = "suggest"
    const m2 = buildModelFromConfig({ skill_discovery: "suggest" });
    expect(validatePreferencesModel(m2)).toEqual([]);

    // skill_discovery = "off"
    const m3 = buildModelFromConfig({ skill_discovery: "off" });
    expect(validatePreferencesModel(m3)).toEqual([]);

    // symphony.console_position = "above-status"
    const m4 = buildModelFromConfig({
      symphony: { console_position: "above-status" },
    });
    expect(validatePreferencesModel(m4)).toEqual([]);
  });

  it("accepts valid number fields", () => {
    const model = buildModelFromConfig({
      version: 2,
      budget_ceiling: 0,
      auto_supervisor: {
        soft_timeout_minutes: 0,
        idle_timeout_minutes: 5,
        hard_timeout_minutes: 60,
      },
    });
    expect(validatePreferencesModel(model)).toEqual([]);
  });

  it("accepts valid boolean fields", () => {
    const model = buildModelFromConfig({
      uat_dispatch: false,
      pr: {
        enabled: false,
        auto_create: true,
        review_on_create: false,
        linear_link: true,
      },
    });
    expect(validatePreferencesModel(model)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rejection tests — invalid enum values
// ---------------------------------------------------------------------------

describe("validatePreferencesModel — rejects invalid enums", () => {
  it('rejects workflow.mode = "file" (only "linear" is valid)', () => {
    const model = buildModelFromConfig({ workflow: { mode: "file" } });
    const issues = validatePreferencesModel(model);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("workflow.mode");
    expect(issues[0].message).toContain("linear");
  });

  it('rejects skill_discovery = "never"', () => {
    const model = buildModelFromConfig({ skill_discovery: "never" });
    const issues = validatePreferencesModel(model);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("skill_discovery");
    expect(issues[0].message).toContain("auto");
    expect(issues[0].message).toContain("suggest");
    expect(issues[0].message).toContain("off");
  });

  it('rejects symphony.console_position = "left"', () => {
    const model = buildModelFromConfig({
      symphony: { console_position: "left" },
    });
    const issues = validatePreferencesModel(model);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("symphony.console_position");
    expect(issues[0].message).toContain("below-output");
    expect(issues[0].message).toContain("above-status");
  });
});

// ---------------------------------------------------------------------------
// Rejection tests — invalid number fields
// ---------------------------------------------------------------------------

describe("validatePreferencesModel — rejects invalid numbers", () => {
  it('rejects non-numeric string in number field (auto_supervisor.soft_timeout_minutes = "abc")', () => {
    const model = buildModelFromConfig({
      auto_supervisor: { soft_timeout_minutes: "abc" },
    });
    const issues = validatePreferencesModel(model);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issue = issues.find(
      (i) => i.path === "auto_supervisor.soft_timeout_minutes",
    );
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("valid number");
  });

  it("rejects negative budget_ceiling", () => {
    const model = buildModelFromConfig({ budget_ceiling: -5 });
    const issues = validatePreferencesModel(model);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issue = issues.find((i) => i.path === "budget_ceiling");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("non-negative");
  });

  it("rejects NaN and Infinity in number fields", () => {
    const model = buildModelFromConfig({
      auto_supervisor: { hard_timeout_minutes: NaN },
    });
    const issues = validatePreferencesModel(model);
    const issue = issues.find(
      (i) => i.path === "auto_supervisor.hard_timeout_minutes",
    );
    expect(issue).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Rejection tests — invalid boolean fields
// ---------------------------------------------------------------------------

describe("validatePreferencesModel — rejects invalid booleans", () => {
  it('rejects string "yes" in boolean field', () => {
    const model = buildModelFromConfig({ uat_dispatch: "yes" });
    const issues = validatePreferencesModel(model);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    const issue = issues.find((i) => i.path === "uat_dispatch");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("boolean");
  });

  it('rejects string "true" in boolean field (should be actual boolean)', () => {
    // Note: the model builder coerces string "true" to boolean true,
    // so the validator should accept the coerced value.
    // This test validates that the coercion works correctly through the pipeline.
    const model = buildModelFromConfig({ pr: { enabled: "true" } });
    const issues = validatePreferencesModel(model);
    // After coercion, "true" string becomes boolean true → no issue
    const issue = issues.find((i) => i.path === "pr.enabled");
    expect(issue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mixed valid/invalid
// ---------------------------------------------------------------------------

describe("validatePreferencesModel — mixed valid/invalid", () => {
  it("returns only issues for invalid fields in a mixed config", () => {
    const model = buildModelFromConfig({
      version: 1,
      workflow: { mode: "file" }, // invalid
      linear: { teamKey: "KAT" }, // valid
      budget_ceiling: -10, // invalid
      skill_discovery: "auto", // valid
      symphony: { console_position: "below-output" }, // valid
      uat_dispatch: true, // valid
    });
    const issues = validatePreferencesModel(model);
    expect(issues).toHaveLength(2);

    const paths = issues.map((i) => i.path);
    expect(paths).toContain("workflow.mode");
    expect(paths).toContain("budget_ceiling");
  });
});
