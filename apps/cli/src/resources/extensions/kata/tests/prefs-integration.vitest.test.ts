import { describe, expect, it } from "vitest";
import { parsePreferencesFile } from "../prefs-parser.js";
import { writePreferencesFile } from "../prefs-writer.js";
import { validatePreferencesModel } from "../prefs-validator.js";
import {
  ConfigEditor,
  type ConfigEditorUI,
  type ConfigEditorResult,
} from "../../symphony/config-editor.js";


// ---------------------------------------------------------------------------
// Realistic preferences.md fixture
// ---------------------------------------------------------------------------

const FIXTURE_BODY = `
## Notes

These are project-specific notes that must survive round-tripping.

- Keep this content intact.
- Body preservation is critical.
`;

const FIXTURE_CONTENT = `---
version: 1
uat_dispatch: true
budget_ceiling: 100
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: kata-cli
pr:
  enabled: true
  auto_create: false
  base_branch: main
  review_on_create: true
  linear_link: false
models:
  research: claude-sonnet-4-5
  review: claude-sonnet-4-6
symphony:
  url: http://localhost:8080
  console_position: below-output
skill_discovery: auto
auto_supervisor:
  model: claude-sonnet-4-6
  soft_timeout_minutes: 20
  idle_timeout_minutes: 10
  hard_timeout_minutes: 30
---
${FIXTURE_BODY}`;

// ---------------------------------------------------------------------------
// Mock UI
// ---------------------------------------------------------------------------

type MockAction =
  | { type: "selectContaining"; text: string }
  | { type: "selectExact"; text: string }
  | { type: "input"; value: string }
  | { type: "confirm"; value: boolean };

/**
 * Mock `ConfigEditorUI` that replays a scripted sequence of actions.
 * Each `select()`, `input()`, or `confirm()` call pops the next action.
 */
class MockConfigEditorUI implements ConfigEditorUI {
  private readonly actions: MockAction[];
  private cursor = 0;
  readonly notifications: Array<{ message: string; type?: string }> = [];

  constructor(actions: MockAction[]) {
    this.actions = actions;
  }

  async select(
    _title: string,
    options: string[],
  ): Promise<string | undefined> {
    const action = this.next();
    if (action.type === "selectContaining") {
      const match = options.find((opt) => opt.includes(action.text));
      if (!match) {
        throw new Error(
          `MockUI: no option containing "${action.text}" in [${options.join(", ")}]`,
        );
      }
      return match;
    }
    if (action.type === "selectExact") {
      if (!options.includes(action.text)) {
        throw new Error(
          `MockUI: exact option "${action.text}" not in [${options.join(", ")}]`,
        );
      }
      return action.text;
    }
    throw new Error(`MockUI: expected select action, got ${action.type}`);
  }

  async input(_title: string, _placeholder?: string): Promise<string | undefined> {
    const action = this.next();
    if (action.type !== "input") {
      throw new Error(`MockUI: expected input action, got ${action.type}`);
    }
    return action.value;
  }

  async confirm(_title: string, _message: string): Promise<boolean> {
    const action = this.next();
    if (action.type !== "confirm") {
      throw new Error(`MockUI: expected confirm action, got ${action.type}`);
    }
    return action.value;
  }

  notify(message: string, type?: "info" | "warning" | "error"): void {
    this.notifications.push({ message, type });
  }

  private next(): MockAction {
    if (this.cursor >= this.actions.length) {
      throw new Error(
        `MockUI: ran out of scripted actions at step ${this.cursor}`,
      );
    }
    return this.actions[this.cursor++];
  }

  get consumed(): number {
    return this.cursor;
  }
}

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

describe("ConfigEditor integration with preferences model", () => {
  it("scenario 1: edit a string field (linear.teamKey) → save → validate → write", async () => {
    // Parse fixture
    const { model, body } = parsePreferencesFile(FIXTURE_CONTENT);

    // Script: select Linear section → select Team Key field → input new value → back → save → confirm
    const mockUI = new MockConfigEditorUI([
      { type: "selectContaining", text: "Linear" },          // select Linear section
      { type: "selectContaining", text: "Team Key" },         // select teamKey field
      { type: "input", value: "NEW" },                        // input new value
      { type: "selectContaining", text: "← Back" },           // back to section list
      { type: "selectContaining", text: "Save changes" },     // save
      { type: "confirm", value: true },                        // confirm save
    ]);

    // Run ConfigEditor
    const editor = new ConfigEditor(model, mockUI);
    const result: ConfigEditorResult = await editor.run();

    // Assert saved
    expect(result.type).toBe("saved");
    if (result.type !== "saved") throw new Error("unreachable");

    // Assert changes include the teamKey edit
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    const teamKeyChange = result.changes.find((c) => c.includes("teamKey"));
    expect(teamKeyChange).toBeDefined();
    expect(teamKeyChange).toContain("KAT");
    expect(teamKeyChange).toContain("NEW");

    // Validate the saved model — no issues
    const issues = validatePreferencesModel(result.model);
    expect(issues).toEqual([]);

    // Write and check output
    const output = writePreferencesFile(result.model, body);
    expect(output).toContain("teamKey: NEW");
    // Old value should not appear
    expect(output).not.toMatch(/teamKey: KAT\b/);

    // Body preservation: markdown body is identical
    expect(output).toContain(FIXTURE_BODY);
  });

  it("scenario 2: edit an enum field (skill_discovery) → save → validate → write", async () => {
    // Parse fixture
    const { model, body } = parsePreferencesFile(FIXTURE_CONTENT);

    // Script: select Skills section → select Skill Discovery field → select "suggest" → back → save → confirm
    const mockUI = new MockConfigEditorUI([
      { type: "selectContaining", text: "Skills" },           // select Skills section
      { type: "selectContaining", text: "Skill Discovery" },  // select skill_discovery field
      { type: "selectExact", text: "suggest" },                // select enum value "suggest"
      { type: "selectContaining", text: "← Back" },           // back to section list
      { type: "selectContaining", text: "Save changes" },     // save
      { type: "confirm", value: true },                        // confirm save
    ]);

    // Run ConfigEditor
    const editor = new ConfigEditor(model, mockUI);
    const result: ConfigEditorResult = await editor.run();

    // Assert saved
    expect(result.type).toBe("saved");
    if (result.type !== "saved") throw new Error("unreachable");

    // Assert changes include the skill_discovery edit
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    const sdChange = result.changes.find((c) => c.includes("skill_discovery"));
    expect(sdChange).toBeDefined();
    expect(sdChange).toContain("suggest");

    // Validate the saved model — no issues
    const issues = validatePreferencesModel(result.model);
    expect(issues).toEqual([]);

    // Write and check output
    const output = writePreferencesFile(result.model, body);
    expect(output).toContain("skill_discovery: suggest");
    expect(output).not.toMatch(/skill_discovery: auto\b/);

    // Body preservation
    expect(output).toContain(FIXTURE_BODY);
  });

  it("scenario 3: cancel → no side effects", async () => {
    // Parse fixture
    const { model, body } = parsePreferencesFile(FIXTURE_CONTENT);

    // Snapshot original output for comparison
    const originalOutput = writePreferencesFile(model, body);

    // Script: cancel immediately
    const mockUI = new MockConfigEditorUI([
      { type: "selectContaining", text: "Cancel" },  // select cancel
    ]);

    // Run ConfigEditor
    const editor = new ConfigEditor(model, mockUI);
    const result: ConfigEditorResult = await editor.run();

    // Assert cancelled
    expect(result.type).toBe("cancelled");

    // Verify model is unchanged — write produces the same output
    const afterOutput = writePreferencesFile(result.model, body);
    expect(afterOutput).toBe(originalOutput);
  });

  it("body is byte-identical after full save pipeline", async () => {
    // Parse fixture
    const { model, body } = parsePreferencesFile(FIXTURE_CONTENT);

    // Edit something trivial, then save
    const mockUI = new MockConfigEditorUI([
      { type: "selectContaining", text: "Linear" },
      { type: "selectContaining", text: "Team Key" },
      { type: "input", value: "CHANGED" },
      { type: "selectContaining", text: "← Back" },
      { type: "selectContaining", text: "Save changes" },
      { type: "confirm", value: true },
    ]);

    const editor = new ConfigEditor(model, mockUI);
    const result = await editor.run();
    expect(result.type).toBe("saved");

    // Write the output
    if (result.type !== "saved") throw new Error("unreachable");
    const output = writePreferencesFile(result.model, body);

    // Extract the body portion after the closing ---
    const closingIndex = output.indexOf("---\n", 4); // skip the opening ---
    const outputBody = output.slice(closingIndex + 4);

    // Body must be byte-identical to the original fixture body
    expect(outputBody).toBe(FIXTURE_BODY);
  });
});
