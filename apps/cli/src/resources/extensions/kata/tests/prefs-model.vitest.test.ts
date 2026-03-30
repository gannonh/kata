import { describe, expect, it } from "vitest";
import {
  buildPreferencesModel,
  PREFS_FIELD_DEFINITIONS,
  PREFS_SECTION_DEFINITIONS,
  getPrefsFieldDefinitionsForSection,
} from "../prefs-model.js";

// ---------------------------------------------------------------------------
// All flat and nested keys from KataPreferences that should be represented
// ---------------------------------------------------------------------------

const EXPECTED_PREFS_KEYS = [
  // General
  "version",
  "uat_dispatch",
  "budget_ceiling",
  // Workflow
  "workflow.mode",
  // Linear
  "linear.teamKey",
  "linear.projectSlug",
  "linear.teamId",
  // PR
  "pr.enabled",
  "pr.auto_create",
  "pr.base_branch",
  "pr.review_on_create",
  "pr.linear_link",
  // Models
  "models.research",
  "models.planning",
  "models.execution",
  "models.completion",
  "models.review",
  // Symphony
  "symphony.url",
  "symphony.workflow_path",
  "symphony.console_position",
  // Skills
  "always_use_skills",
  "prefer_skills",
  "avoid_skills",
  "skill_rules",
  "custom_instructions",
  "skill_discovery",
  // Auto Supervisor
  "auto_supervisor.model",
  "auto_supervisor.soft_timeout_minutes",
  "auto_supervisor.idle_timeout_minutes",
  "auto_supervisor.hard_timeout_minutes",
];

describe("PREFS_SECTION_DEFINITIONS", () => {
  it("contains exactly 8 sections", () => {
    expect(PREFS_SECTION_DEFINITIONS).toHaveLength(8);
  });

  it("has all expected section keys", () => {
    const keys = PREFS_SECTION_DEFINITIONS.map((s) => s.key);
    expect(keys).toEqual([
      "general",
      "workflow",
      "linear",
      "pr",
      "models",
      "symphony",
      "skills",
      "auto_supervisor",
    ]);
  });

  it("every section has a label and description", () => {
    for (const section of PREFS_SECTION_DEFINITIONS) {
      expect(section.label).toBeTruthy();
      expect(section.description).toBeTruthy();
    }
  });
});

describe("PREFS_FIELD_DEFINITIONS", () => {
  it("covers every KataPreferences key", () => {
    const fieldPaths = PREFS_FIELD_DEFINITIONS.map((f) => f.path.join("."));
    for (const expectedKey of EXPECTED_PREFS_KEYS) {
      expect(fieldPaths).toContain(expectedKey);
    }
  });

  it("every field belongs to a valid section", () => {
    const validSections = new Set(
      PREFS_SECTION_DEFINITIONS.map((s) => s.key),
    );
    for (const field of PREFS_FIELD_DEFINITIONS) {
      expect(validSections.has(field.section)).toBe(true);
    }
  });

  it("getPrefsFieldDefinitionsForSection returns the right fields", () => {
    const prFields = getPrefsFieldDefinitionsForSection("pr");
    expect(prFields.map((f) => f.key)).toEqual([
      "enabled",
      "auto_create",
      "base_branch",
      "review_on_create",
      "linear_link",
    ]);
  });
});

describe("field types", () => {
  function findField(pathStr: string) {
    return PREFS_FIELD_DEFINITIONS.find((f) => f.path.join(".") === pathStr);
  }

  it("pr.enabled is boolean", () => {
    expect(findField("pr.enabled")?.type).toBe("boolean");
  });

  it("models.research is string", () => {
    expect(findField("models.research")?.type).toBe("string");
  });

  it("workflow.mode is enum with 'linear'", () => {
    const f = findField("workflow.mode");
    expect(f?.type).toBe("enum");
    expect(f?.enumValues).toEqual(["linear"]);
  });

  it("skill_discovery is enum with auto/suggest/off", () => {
    const f = findField("skill_discovery");
    expect(f?.type).toBe("enum");
    expect(f?.enumValues).toEqual(["auto", "suggest", "off"]);
  });

  it("symphony.console_position is enum", () => {
    const f = findField("symphony.console_position");
    expect(f?.type).toBe("enum");
    expect(f?.enumValues).toEqual(["below-output", "above-status"]);
  });

  it("always_use_skills is string[]", () => {
    expect(findField("always_use_skills")?.type).toBe("string[]");
  });

  it("skill_rules is string[]", () => {
    expect(findField("skill_rules")?.type).toBe("string[]");
  });

  it("custom_instructions is string[]", () => {
    expect(findField("custom_instructions")?.type).toBe("string[]");
  });

  it("version is number", () => {
    expect(findField("version")?.type).toBe("number");
  });

  it("auto_supervisor.soft_timeout_minutes is number", () => {
    expect(findField("auto_supervisor.soft_timeout_minutes")?.type).toBe(
      "number",
    );
  });
});

describe("buildPreferencesModel", () => {
  it("returns a model with 8 sections from empty config", () => {
    const model = buildPreferencesModel({});
    expect(model.sections).toHaveLength(8);
    expect(model.sections.map((s) => s.key)).toEqual([
      "general",
      "workflow",
      "linear",
      "pr",
      "models",
      "symphony",
      "skills",
      "auto_supervisor",
    ]);
  });

  it("populates values from config", () => {
    const config = {
      version: 1,
      uat_dispatch: true,
      budget_ceiling: 50,
      workflow: { mode: "linear" },
      linear: { teamKey: "KAT", projectSlug: "abc123" },
      pr: { enabled: true, auto_create: false, base_branch: "main" },
      models: { research: "claude-sonnet-4-6", planning: "claude-opus-4-6" },
      symphony: { url: "http://localhost:8080", console_position: "below-output" },
      always_use_skills: ["skill-a", "skill-b"],
      prefer_skills: ["skill-c"],
      avoid_skills: [],
      skill_discovery: "auto",
      custom_instructions: ["Do X"],
      auto_supervisor: { model: "claude-sonnet-4-6", soft_timeout_minutes: 15 },
    };

    const model = buildPreferencesModel(config as Record<string, unknown>);

    // Check General section
    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBe(1);
    expect(general.fields.find((f) => f.key === "uat_dispatch")?.value).toBe(true);
    expect(general.fields.find((f) => f.key === "budget_ceiling")?.value).toBe(50);

    // Check Workflow section
    const workflow = model.sections.find((s) => s.key === "workflow")!;
    expect(workflow.fields.find((f) => f.key === "mode")?.value).toBe("linear");

    // Check Linear section
    const linear = model.sections.find((s) => s.key === "linear")!;
    expect(linear.fields.find((f) => f.key === "teamKey")?.value).toBe("KAT");
    expect(linear.fields.find((f) => f.key === "projectSlug")?.value).toBe("abc123");

    // Check PR section
    const pr = model.sections.find((s) => s.key === "pr")!;
    expect(pr.fields.find((f) => f.key === "enabled")?.value).toBe(true);
    expect(pr.fields.find((f) => f.key === "auto_create")?.value).toBe(false);
    expect(pr.fields.find((f) => f.key === "base_branch")?.value).toBe("main");

    // Check Models section
    const models = model.sections.find((s) => s.key === "models")!;
    expect(models.fields.find((f) => f.key === "research")?.value).toBe(
      "claude-sonnet-4-6",
    );
    expect(models.fields.find((f) => f.key === "planning")?.value).toBe(
      "claude-opus-4-6",
    );

    // Check Symphony section
    const symphony = model.sections.find((s) => s.key === "symphony")!;
    expect(symphony.fields.find((f) => f.key === "url")?.value).toBe(
      "http://localhost:8080",
    );
    expect(
      symphony.fields.find((f) => f.key === "console_position")?.value,
    ).toBe("below-output");

    // Check Skills section
    const skills = model.sections.find((s) => s.key === "skills")!;
    expect(
      skills.fields.find((f) => f.key === "always_use_skills")?.value,
    ).toEqual(["skill-a", "skill-b"]);
    expect(skills.fields.find((f) => f.key === "prefer_skills")?.value).toEqual(
      ["skill-c"],
    );
    expect(skills.fields.find((f) => f.key === "avoid_skills")?.value).toEqual(
      [],
    );
    expect(
      skills.fields.find((f) => f.key === "custom_instructions")?.value,
    ).toEqual(["Do X"]);
    expect(
      skills.fields.find((f) => f.key === "skill_discovery")?.value,
    ).toBe("auto");

    // Check Auto Supervisor section
    const autoSupervisor = model.sections.find(
      (s) => s.key === "auto_supervisor",
    )!;
    expect(autoSupervisor.fields.find((f) => f.key === "model")?.value).toBe(
      "claude-sonnet-4-6",
    );
    expect(
      autoSupervisor.fields.find((f) => f.key === "soft_timeout_minutes")
        ?.value,
    ).toBe(15);
  });

  it("defaults to empty/null for missing config values", () => {
    const model = buildPreferencesModel({});

    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBeNull();
    expect(general.fields.find((f) => f.key === "uat_dispatch")?.value).toBeNull();

    const linear = model.sections.find((s) => s.key === "linear")!;
    expect(linear.fields.find((f) => f.key === "teamKey")?.value).toBe("");

    const skills = model.sections.find((s) => s.key === "skills")!;
    expect(
      skills.fields.find((f) => f.key === "always_use_skills")?.value,
    ).toEqual([]);
  });

  it("has a workflow field with config reference", () => {
    const config = { version: 1 };
    const model = buildPreferencesModel(config);
    expect(model.workflow.config).toBe(config);
    expect(model.workflow.raw).toBe("");
    expect(model.workflow.body).toBe("");
  });

  it("coerces string values from arrays", () => {
    // When a string field receives an array, it joins with space
    const config = { symphony: { url: ["a", "b"] } };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const symphony = model.sections.find((s) => s.key === "symphony")!;
    expect(symphony.fields.find((f) => f.key === "url")?.value).toBe("a b");
  });

  it("coerces number from string", () => {
    const config = { version: "2" };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBe(2);
  });

  it("returns null for empty string number", () => {
    const config = { version: "" };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBeNull();
  });

  it("returns raw value for non-numeric string in number field", () => {
    const config = { version: "abc" };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBe("abc");
  });

  it("returns raw value for unexpected type in number field", () => {
    const config = { version: [1, 2] };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toEqual([1, 2]);
  });

  it("coerces boolean from string 'true'/'false'", () => {
    const config = { pr: { enabled: "true", auto_create: "false" } };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const pr = model.sections.find((s) => s.key === "pr")!;
    expect(pr.fields.find((f) => f.key === "enabled")?.value).toBe(true);
    expect(pr.fields.find((f) => f.key === "auto_create")?.value).toBe(false);
  });

  it("returns raw value for non-boolean string in boolean field", () => {
    const config = { pr: { enabled: "maybe" } };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const pr = model.sections.find((s) => s.key === "pr")!;
    expect(pr.fields.find((f) => f.key === "enabled")?.value).toBe("maybe");
  });

  it("returns raw value for unexpected type in boolean field", () => {
    const config = { pr: { enabled: 42 } };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const pr = model.sections.find((s) => s.key === "pr")!;
    expect(pr.fields.find((f) => f.key === "enabled")?.value).toBe(42);
  });

  it("coerces string[] from a single string", () => {
    const config = { always_use_skills: "single-skill" };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const skills = model.sections.find((s) => s.key === "skills")!;
    expect(
      skills.fields.find((f) => f.key === "always_use_skills")?.value,
    ).toEqual(["single-skill"]);
  });

  it("coerces string[] from empty string returns empty array", () => {
    const config = { always_use_skills: "" };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const skills = model.sections.find((s) => s.key === "skills")!;
    expect(
      skills.fields.find((f) => f.key === "always_use_skills")?.value,
    ).toEqual([]);
  });

  it("readPath returns undefined for non-object intermediate", () => {
    const config = { linear: "not-an-object" };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const linear = model.sections.find((s) => s.key === "linear")!;
    expect(linear.fields.find((f) => f.key === "teamKey")?.value).toBe("");
  });

  it("model sections are structurally compatible with ConfigEditorModel", () => {
    const model = buildPreferencesModel({});
    // Verify each section has the required shape
    for (const section of model.sections) {
      expect(typeof section.key).toBe("string");
      expect(typeof section.label).toBe("string");
      expect(typeof section.description).toBe("string");
      expect(Array.isArray(section.fields)).toBe(true);
      for (const field of section.fields) {
        expect(typeof field.key).toBe("string");
        expect(typeof field.label).toBe("string");
        expect(Array.isArray(field.path)).toBe(true);
        expect(typeof field.type).toBe("string");
        expect(typeof field.required).toBe("boolean");
        expect(typeof field.description).toBe("string");
      }
    }
  });
});
