import { execSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runConfigEditor } from "../config-editor.js";
import {
  applyModelToConfig,
  parseWorkflowConfig,
  serializeWorkflowConfig,
  WorkflowConfigParseError,
} from "../config-parser.js";
import {
  formatConfigFieldValue,
  renderFieldChoice,
  renderSectionChoice,
} from "../config-render.js";

const workflowReferencePath = fileURLToPath(
  new URL("../../../../../../symphony/docs/WORKFLOW-REFERENCE.md", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../../../../../../../", import.meta.url));

describe("parseWorkflowConfig", () => {
  it("parses WORKFLOW-REFERENCE.md into the editor model", () => {
    const source = readFileSync(workflowReferencePath, "utf-8");
    const model = parseWorkflowConfig(source);

    expect(model.sections).toHaveLength(9);

    const tracker = model.sections.find((section) => section.key === "tracker");
    const workspace = model.sections.find((section) => section.key === "workspace");
    const agent = model.sections.find((section) => section.key === "agent");

    expect(tracker?.fields.find((field) => field.key === "kind")?.value).toBe("linear");
    expect(
      workspace?.fields.find((field) => field.key === "git_strategy")?.value,
    ).toBe("auto");
    expect(
      agent?.fields.find((field) => field.key === "backend")?.value,
    ).toBe("kata-cli");

    expect(model.workflow.body).toContain("PROMPT TEMPLATE BODY");
  });

  it("round-trips parse -> serialize -> parse without losing config values", () => {
    const source = readFileSync(workflowReferencePath, "utf-8");
    const firstPass = parseWorkflowConfig(source);
    const serialized = serializeWorkflowConfig(firstPass);
    const secondPass = parseWorkflowConfig(serialized);

    expect(applyModelToConfig(secondPass)).toEqual(applyModelToConfig(firstPass));
    expect(secondPass.workflow.body).toEqual(firstPass.workflow.body);
  });

  it("reports YAML parse errors with line numbers", () => {
    const invalid = `---\ntracker:\n  kind: linear\n  api_key: [unterminated\n---\nbody`;

    try {
      parseWorkflowConfig(invalid);
      throw new Error("expected parser to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowConfigParseError);
      const parsed = error as WorkflowConfigParseError;
      expect(parsed.line).toBeTypeOf("number");
    }
  });

  it("supports symphony.workflow_path in preferences parsing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "kata-symphony-pref-"));

    try {
      const kataDir = join(tempDir, ".kata-cli");
      const projectDir = join(tempDir, "project");
      mkdirSync(kataDir, { recursive: true });
      mkdirSync(join(projectDir, ".kata"), { recursive: true });

      writeFileSync(
        join(kataDir, "preferences.md"),
        `---\nversion: 1\nsymphony:\n  url: http://127.0.0.1:8080\n  workflow_path: /tmp/WORKFLOW.md\n---\n`,
        { encoding: "utf-8" },
      );

      const scriptPath = join(tempDir, "check-workflow-path.ts");
      const preferencesImport = new URL(
        "apps/cli/src/resources/extensions/kata/preferences.ts",
        `file://${repoRoot.endsWith("/") ? repoRoot : `${repoRoot}/`}`,
      ).href;

      writeFileSync(
        scriptPath,
        [
          `import { loadEffectiveKataPreferences } from ${JSON.stringify(preferencesImport)};`,
          `process.chdir(${JSON.stringify(projectDir)});`,
          "const loaded = loadEffectiveKataPreferences();",
          "console.log(loaded?.preferences?.symphony?.workflow_path ?? '');",
        ].join("\n"),
        { encoding: "utf-8" },
      );

      const output = execSync(`node --experimental-strip-types ${JSON.stringify(scriptPath)}`, {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOME: tempDir,
        },
        encoding: "utf-8",
      }).trim();

      expect(output).toBe("/tmp/WORKFLOW.md");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("config-render", () => {
  it("renders section labels and masks sensitive values", () => {
    const source = readFileSync(workflowReferencePath, "utf-8");
    const model = parseWorkflowConfig(source);

    const tracker = model.sections.find((section) => section.key === "tracker");
    expect(tracker).toBeDefined();

    const sectionLabel = renderSectionChoice(tracker!);
    expect(sectionLabel).toContain("Tracker");

    const apiKeyField = tracker!.fields.find((field) => field.key === "api_key");
    expect(apiKeyField).toBeDefined();

    const masked = formatConfigFieldValue(apiKeyField!, { masked: true });
    expect(masked).toContain("***");

    const fieldLabel = renderFieldChoice(apiKeyField!);
    expect(fieldLabel).toContain("API Key");
    expect(fieldLabel).toContain("***");
  });
});

describe("ConfigEditor", () => {
  it("edits number and enum fields through the guided UI flow", async () => {
    const source = readFileSync(workflowReferencePath, "utf-8");
    const model = parseWorkflowConfig(source);

    const script = [
      { type: "select", contains: "Agent (" },
      { type: "select", contains: "Max Concurrent Agents" },
      { type: "input", value: "5" },
      { type: "select", contains: "Backend" },
      { type: "select", value: "codex" },
      { type: "select", value: "← Back" },
      { type: "select", contains: "Save changes" },
      { type: "confirm", value: true },
    ] as const;

    const ui = createScriptedUi(script);
    const result = await runConfigEditor(model, ui);

    expect(result.type).toBe("saved");
    if (result.type !== "saved") return;

    const updatedAgent = result.model.sections.find(
      (section) => section.key === "agent",
    );
    expect(updatedAgent).toBeDefined();

    expect(
      updatedAgent!.fields.find((field) => field.key === "max_concurrent_agents")
        ?.value,
    ).toBe(5);
    expect(updatedAgent!.fields.find((field) => field.key === "backend")?.value).toBe(
      "codex",
    );
    expect(result.changes.some((line) => line.includes("agent.max_concurrent_agents"))).toBe(
      true,
    );
  });
});

type ScriptedStep =
  | { type: "select"; value?: string; contains?: string }
  | { type: "input"; value: string | undefined }
  | { type: "confirm"; value: boolean };

function createScriptedUi(steps: readonly ScriptedStep[]) {
  const queue = [...steps];

  return {
    async select(_title: string, options: string[]) {
      const step = queue.shift();
      if (!step || step.type !== "select") {
        throw new Error(`Unexpected select call. options=${options.join(" | ")}`);
      }

      if (step.value !== undefined) {
        const match = options.find((option) => option === step.value);
        if (!match) {
          throw new Error(`Could not find option '${step.value}' in ${options.join(" | ")}`);
        }
        return match;
      }

      if (step.contains) {
        const match = options.find((option) => option.includes(step.contains));
        if (!match) {
          throw new Error(
            `Could not find option containing '${step.contains}' in ${options.join(" | ")}`,
          );
        }
        return match;
      }

      return undefined;
    },
    async input() {
      const step = queue.shift();
      if (!step || step.type !== "input") {
        throw new Error("Unexpected input call");
      }
      return step.value;
    },
    async confirm() {
      const step = queue.shift();
      if (!step || step.type !== "confirm") {
        throw new Error("Unexpected confirm call");
      }
      return step.value;
    },
    notify() {
      // no-op for tests
    },
  };
}
