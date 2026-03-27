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
import {
  applyModelToConfig,
  parseWorkflowConfig,
  serializeWorkflowConfig,
  WorkflowConfigParseError,
} from "../config-parser.js";

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
