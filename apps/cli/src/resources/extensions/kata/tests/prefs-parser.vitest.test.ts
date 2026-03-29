import { describe, expect, it } from "vitest";
import { parsePreferencesFile, PreferencesParseError } from "../prefs-parser.js";
import { writePreferencesFile } from "../prefs-writer.js";

// ---------------------------------------------------------------------------
// Realistic fixture
// ---------------------------------------------------------------------------

const REALISTIC_FIXTURE = `---
version: 1
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: 459f9835e809
pr:
  enabled: true
  auto_create: true
  base_branch: main
  review_on_create: false
  linear_link: true
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-6
  execution: claude-sonnet-4-6
  completion: claude-sonnet-4-6
  review: claude-sonnet-4-6
always_use_skills:
  - skill-a
  - skill-b
prefer_skills:
  - skill-c
skill_discovery: auto
symphony:
  url: http://localhost:8080
  console_position: below-output
auto_supervisor:
  model: claude-sonnet-4-6
  soft_timeout_minutes: 20
  idle_timeout_minutes: 10
  hard_timeout_minutes: 30
---
# Kata Preferences

This is the markdown body that should survive the round-trip unchanged.

## Quick Start

Some instructions here.
`;

const REALISTIC_BODY = `# Kata Preferences

This is the markdown body that should survive the round-trip unchanged.

## Quick Start

Some instructions here.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parsePreferencesFile", () => {
  it("parses a realistic preferences.md", () => {
    const { model, body } = parsePreferencesFile(REALISTIC_FIXTURE);

    expect(model.sections).toHaveLength(8);
    expect(body).toBe(REALISTIC_BODY);

    // Check workflow populated
    expect(model.workflow.config).toBeTruthy();
    expect(model.workflow.body).toBe(REALISTIC_BODY);
    expect(model.workflow.raw).toBeTruthy();

    // Spot-check values
    const linear = model.sections.find((s) => s.key === "linear")!;
    expect(linear.fields.find((f) => f.key === "teamKey")?.value).toBe("KAT");

    const pr = model.sections.find((s) => s.key === "pr")!;
    expect(pr.fields.find((f) => f.key === "enabled")?.value).toBe(true);

    const models = model.sections.find((s) => s.key === "models")!;
    expect(models.fields.find((f) => f.key === "research")?.value).toBe(
      "claude-sonnet-4-6",
    );

    const skills = model.sections.find((s) => s.key === "skills")!;
    expect(
      skills.fields.find((f) => f.key === "always_use_skills")?.value,
    ).toEqual(["skill-a", "skill-b"]);
  });

  it("handles empty frontmatter", () => {
    const content = `---

---
Some body here.
`;
    const { model, body } = parsePreferencesFile(content);

    expect(model.sections).toHaveLength(8);
    expect(body).toBe("Some body here.\n");

    // All string fields default to ""
    const linear = model.sections.find((s) => s.key === "linear")!;
    expect(linear.fields.find((f) => f.key === "teamKey")?.value).toBe("");
  });

  it("handles missing optional fields", () => {
    const content = `---
version: 1
---
Body text.
`;
    const { model, body } = parsePreferencesFile(content);

    expect(body).toBe("Body text.\n");

    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBe(1);

    // Missing fields default properly
    const pr = model.sections.find((s) => s.key === "pr")!;
    expect(pr.fields.find((f) => f.key === "enabled")?.value).toBeNull();
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nversion: 1\r\n---\r\nBody with CRLF.\r\n";
    const { model, body } = parsePreferencesFile(content);

    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBe(1);
    // Body preserves CRLF
    expect(body).toBe("Body with CRLF.\r\n");
  });

  it("handles BOM prefix", () => {
    const content = "\uFEFF---\nversion: 1\n---\nBody.\n";
    const { model, body } = parsePreferencesFile(content);

    const general = model.sections.find((s) => s.key === "general")!;
    expect(general.fields.find((f) => f.key === "version")?.value).toBe(1);
    expect(body).toBe("Body.\n");
  });

  it("throws PreferencesParseError for missing frontmatter", () => {
    expect(() => parsePreferencesFile("No frontmatter here")).toThrow(
      PreferencesParseError,
    );
  });

  it("throws PreferencesParseError for non-object YAML", () => {
    const content = `---
just a string
---
Body.
`;
    expect(() => parsePreferencesFile(content)).toThrow(PreferencesParseError);
  });

  it("throws PreferencesParseError with line number for malformed YAML", () => {
    const content = `---
version: 1
bad: [
  unterminated
---
Body.
`;
    try {
      parsePreferencesFile(content);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PreferencesParseError);
      const pe = e as PreferencesParseError;
      expect(pe.line).toBeDefined();
      expect(typeof pe.line).toBe("number");
    }
  });
});

describe("round-trip preservation", () => {
  it("parse → write produces identical frontmatter for realistic fixture", () => {
    const { model, body } = parsePreferencesFile(REALISTIC_FIXTURE);
    const output = writePreferencesFile(model, body);

    // Re-parse the output
    const { model: model2, body: body2 } = parsePreferencesFile(output);

    // Body is identical
    expect(body2).toBe(REALISTIC_BODY);

    // All field values match between parses
    for (let i = 0; i < model.sections.length; i++) {
      const section1 = model.sections[i];
      const section2 = model2.sections[i];
      expect(section2.key).toBe(section1.key);
      for (let j = 0; j < section1.fields.length; j++) {
        expect(section2.fields[j].value).toEqual(section1.fields[j].value);
      }
    }
  });

  it("body is byte-identical after round-trip", () => {
    const { model, body } = parsePreferencesFile(REALISTIC_FIXTURE);
    const output = writePreferencesFile(model, body);
    const { body: body2 } = parsePreferencesFile(output);
    expect(body2).toBe(body);
  });

  it("parse(write(parse(content))) equals parse(content)", () => {
    const parsed1 = parsePreferencesFile(REALISTIC_FIXTURE);
    const written = writePreferencesFile(parsed1.model, parsed1.body);
    const parsed2 = parsePreferencesFile(written);
    const written2 = writePreferencesFile(parsed2.model, parsed2.body);
    const parsed3 = parsePreferencesFile(written2);

    // Compare all field values
    for (let i = 0; i < parsed2.sections?.length ?? 0; i++) {
      for (let j = 0; j < parsed2.model.sections[i].fields.length; j++) {
        expect(parsed3.model.sections[i].fields[j].value).toEqual(
          parsed2.model.sections[i].fields[j].value,
        );
      }
    }
    expect(parsed3.body).toBe(parsed2.body);
  });
});
