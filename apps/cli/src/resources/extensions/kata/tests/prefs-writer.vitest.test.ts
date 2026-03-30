import { describe, expect, it } from "vitest";
import { buildPreferencesModel } from "../prefs-model.js";
import { parsePreferencesFile } from "../prefs-parser.js";
import {
  applyPrefsModelToConfig,
  writePreferencesFile,
} from "../prefs-writer.js";

describe("applyPrefsModelToConfig", () => {
  it("writes populated values back to nested config paths", () => {
    const config = {
      version: 1,
      linear: { teamKey: "KAT", projectSlug: "abc" },
      pr: { enabled: true, base_branch: "main" },
    };

    const model = buildPreferencesModel(config as Record<string, unknown>);
    const result = applyPrefsModelToConfig(model);

    expect(result.version).toBe(1);
    expect((result.linear as Record<string, unknown>).teamKey).toBe("KAT");
    expect((result.linear as Record<string, unknown>).projectSlug).toBe("abc");
    expect((result.pr as Record<string, unknown>).enabled).toBe(true);
    expect((result.pr as Record<string, unknown>).base_branch).toBe("main");
  });

  it("omits unset/null fields from output", () => {
    const model = buildPreferencesModel({});
    const result = applyPrefsModelToConfig(model);

    // Required string fields (teamKey, projectSlug) produce empty strings,
    // so the linear block exists but optional unrequired fields are absent.
    expect(result.pr).toBeUndefined();
    expect(result.models).toBeUndefined();
    expect(result.symphony).toBeUndefined();
    expect(result.version).toBeUndefined();
    expect(result.always_use_skills).toBeUndefined();
  });

  it("serializes string[] fields as arrays", () => {
    const config = {
      always_use_skills: ["skill-a", "skill-b"],
      custom_instructions: ["Do X", "Do Y"],
    };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const result = applyPrefsModelToConfig(model);

    expect(result.always_use_skills).toEqual(["skill-a", "skill-b"]);
    expect(result.custom_instructions).toEqual(["Do X", "Do Y"]);
  });
});

describe("writePreferencesFile", () => {
  it("produces valid YAML frontmatter + body", () => {
    const config = {
      version: 1,
      workflow: { mode: "linear" },
      linear: { teamKey: "KAT" },
    };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const body = "# My Preferences\n\nSome content.\n";
    const output = writePreferencesFile(model, body);

    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("\n---\n");
    expect(output.endsWith(body)).toBe(true);
  });

  it("nested objects are serialized correctly", () => {
    const config = {
      linear: { teamKey: "KAT", projectSlug: "abc123" },
      pr: { enabled: true, auto_create: false },
      models: { research: "claude-sonnet-4-6" },
    };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const output = writePreferencesFile(model, "");

    expect(output).toContain("linear:");
    expect(output).toContain("teamKey: KAT");
    expect(output).toContain("projectSlug: abc123");
    expect(output).toContain("pr:");
    expect(output).toContain("enabled: true");
    expect(output).toContain("auto_create: false");
    expect(output).toContain("models:");
    expect(output).toContain("research: claude-sonnet-4-6");
  });

  it("string[] fields are formatted as YAML arrays", () => {
    const config = {
      always_use_skills: ["skill-a", "skill-b"],
      prefer_skills: ["skill-c"],
    };
    const model = buildPreferencesModel(config as Record<string, unknown>);
    const output = writePreferencesFile(model, "");

    expect(output).toContain("always_use_skills:");
    expect(output).toContain("- skill-a");
    expect(output).toContain("- skill-b");
    expect(output).toContain("prefer_skills:");
    expect(output).toContain("- skill-c");
  });

  it("empty config produces minimal frontmatter", () => {
    const model = buildPreferencesModel({});
    const output = writePreferencesFile(model, "Body.\n");

    // Should start with --- and have closing ---
    expect(output).toMatch(/^---\n/);
    expect(output).toContain("---\nBody.\n");
  });

  it("edit-then-write: changed value appears, others preserved", () => {
    const fixture = `---
version: 1
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: abc123
pr:
  enabled: true
  base_branch: main
models:
  research: claude-sonnet-4-6
---
# Body content
`;

    const { model, body } = parsePreferencesFile(fixture);

    // Change a value
    const prSection = model.sections.find((s) => s.key === "pr")!;
    const baseBranchField = prSection.fields.find(
      (f) => f.key === "base_branch",
    )!;
    baseBranchField.value = "develop";

    const output = writePreferencesFile(model, body);

    // The changed value appears
    expect(output).toContain("base_branch: develop");

    // Other values preserved
    expect(output).toContain("version: 1");
    expect(output).toContain("teamKey: KAT");
    expect(output).toContain("projectSlug: abc123");
    expect(output).toContain("enabled: true");
    expect(output).toContain("research: claude-sonnet-4-6");
    expect(output).toContain("mode: linear");

    // Body preserved
    expect(output.endsWith("# Body content\n")).toBe(true);
  });

  it("edit-then-write: setting a new value adds it", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);

    // Add a new value
    const linear = model.sections.find((s) => s.key === "linear")!;
    const teamKeyField = linear.fields.find((f) => f.key === "teamKey")!;
    teamKeyField.value = "MYTEAM";

    const output = writePreferencesFile(model, body);
    expect(output).toContain("teamKey: MYTEAM");
    expect(output).toContain("version: 1");
  });

  it("handles boolean fields with string values", () => {
    const fixture = `---
pr:
  enabled: true
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const pr = model.sections.find((s) => s.key === "pr")!;
    pr.fields.find((f) => f.key === "enabled")!.value = "true";
    pr.fields.find((f) => f.key === "auto_create")!.value = "false";
    const output = writePreferencesFile(model, body);
    expect(output).toContain("enabled: true");
    expect(output).toContain("auto_create: false");
  });

  it("handles number fields with string values", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const general = model.sections.find((s) => s.key === "general")!;
    general.fields.find((f) => f.key === "version")!.value = "2";
    const output = writePreferencesFile(model, body);
    expect(output).toContain("version: 2");
  });

  it("handles empty number string by omitting the field", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const general = model.sections.find((s) => s.key === "general")!;
    general.fields.find((f) => f.key === "version")!.value = "";
    const output = writePreferencesFile(model, body);
    expect(output).not.toContain("version");
  });

  it("handles null boolean by omitting", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const pr = model.sections.find((s) => s.key === "pr")!;
    pr.fields.find((f) => f.key === "enabled")!.value = null;
    const output = writePreferencesFile(model, body);
    expect(output).not.toContain("enabled");
  });

  it("handles empty string boolean by omitting", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const pr = model.sections.find((s) => s.key === "pr")!;
    pr.fields.find((f) => f.key === "enabled")!.value = "";
    const output = writePreferencesFile(model, body);
    expect(output).not.toContain("enabled");
  });

  it("handles string[] from newline-delimited string", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const skills = model.sections.find((s) => s.key === "skills")!;
    skills.fields.find((f) => f.key === "always_use_skills")!.value =
      "skill-a\nskill-b\n";
    const output = writePreferencesFile(model, body);
    expect(output).toContain("- skill-a");
    expect(output).toContain("- skill-b");
  });

  it("handles non-array, non-string string[] value", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const skills = model.sections.find((s) => s.key === "skills")!;
    skills.fields.find((f) => f.key === "always_use_skills")!.value = 42;
    const output = writePreferencesFile(model, body);
    // 42 is not a string or array, so no skills written
    expect(output).not.toContain("always_use_skills");
  });

  it("handles non-boolean, non-string boolean value passthrough", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const pr = model.sections.find((s) => s.key === "pr")!;
    pr.fields.find((f) => f.key === "enabled")!.value = 42;
    const output = writePreferencesFile(model, body);
    // 42 is not a valid boolean, but it should be written as-is
    expect(output).toContain("enabled: 42");
  });

  it("handles non-string boolean that isn't parseable", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const pr = model.sections.find((s) => s.key === "pr")!;
    pr.fields.find((f) => f.key === "enabled")!.value = "maybe";
    const output = writePreferencesFile(model, body);
    // "maybe" is not true/false, so it gets written as the raw string
    expect(output).toContain("enabled: maybe");
  });

  it("handles non-finite number string value", () => {
    const fixture = `---
version: 1
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);
    const general = model.sections.find((s) => s.key === "general")!;
    general.fields.find((f) => f.key === "version")!.value = "abc";
    const output = writePreferencesFile(model, body);
    expect(output).toContain("version: abc");
  });

  it("edit-then-write: clearing an optional value removes it", () => {
    const fixture = `---
version: 1
linear:
  teamKey: KAT
  teamId: some-uuid
---
Body.
`;
    const { model, body } = parsePreferencesFile(fixture);

    // Clear the optional teamId value
    const linear = model.sections.find((s) => s.key === "linear")!;
    const teamIdField = linear.fields.find((f) => f.key === "teamId")!;
    teamIdField.value = "";

    const output = writePreferencesFile(model, body);
    // optional teamId should be removed since it's empty
    expect(output).not.toContain("teamId");
    // linear section remains because required fields exist
    expect(output).toContain("linear:");
    expect(output).toContain("teamKey: KAT");
  });
});
