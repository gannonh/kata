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
import { resolveWorkflowPath } from "../command.js";
import { runConfigEditor } from "../config-editor.js";
import {
  applyModelToConfig,
  parseWorkflowConfig,
  serializeWorkflowConfig,
  WorkflowConfigParseError,
} from "../config-parser.js";
import {
  formatConfigFieldValue,
  normalizeStringArrayInput,
  renderFieldChoice,
  renderSectionChoice,
} from "../config-render.js";
import { validateConfigModel } from "../config-validator.js";
import { renderUpdatedWorkflowContent } from "../config-writer.js";

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

  it("preserves blank lines immediately after frontmatter", () => {
    const fixture = [
      "---",
      "tracker:",
      "  kind: linear",
      "  api_key: $LINEAR_API_KEY",
      "  project_slug: demo",
      "---",
      "",
      "# prompt body",
    ].join("\n");

    const model = parseWorkflowConfig(fixture);
    expect(model.workflow.body.startsWith("\n# prompt body")).toBe(true);
  });

  it("does not materialize optional booleans that were absent in source yaml", () => {
    const fixture = [
      "---",
      "tracker:",
      "  kind: linear",
      "  api_key: $LINEAR_API_KEY",
      "  project_slug: demo",
      "workspace:",
      "  root: /tmp/workspaces",
      "  repo: /tmp/repo",
      "agent:",
      "  max_concurrent_agents: 3",
      "kata_agent:",
      "  command: kata",
      "---",
      "prompt body",
    ].join("\n");

    const model = parseWorkflowConfig(fixture);
    const config = applyModelToConfig(model);

    expect((config.workspace as Record<string, unknown>).cleanup_on_done).toBeUndefined();
    expect((config.kata_agent as Record<string, unknown>).no_session).toBeUndefined();

    setField(model, "kata_agent", "no_session", false);
    const withExplicitFalse = applyModelToConfig(model);
    expect((withExplicitFalse.kata_agent as Record<string, unknown>).no_session).toBe(
      false,
    );
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

  it("keeps comma-containing string[] entries intact", () => {
    const normalized = normalizeStringArrayInput("FOO=a,b\nBAR=c");
    expect(normalized).toEqual(["FOO=a,b", "BAR=c"]);
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

  it("allows clearing optional enum and boolean fields", async () => {
    const fixture = [
      "---",
      "tracker:",
      "  kind: linear",
      "  api_key: $LINEAR_API_KEY",
      "  project_slug: demo",
      "workspace:",
      "  root: /tmp/workspaces",
      "  repo: /tmp/repo",
      "  git_strategy: auto",
      "  cleanup_on_done: true",
      "agent:",
      "  backend: codex",
      "---",
      "prompt body",
    ].join("\n");

    const model = parseWorkflowConfig(fixture);

    const script = [
      { type: "select", contains: "Workspace (" },
      { type: "select", contains: "Git Strategy" },
      { type: "select", value: "(unset)" },
      { type: "select", contains: "Cleanup On Done" },
      { type: "select", value: "(unset)" },
      { type: "select", value: "← Back" },
      { type: "select", contains: "Save changes" },
      { type: "confirm", value: true },
    ] as const;

    const ui = createScriptedUi(script);
    const result = await runConfigEditor(model, ui);

    expect(result.type).toBe("saved");
    if (result.type !== "saved") return;

    const workspace = result.model.sections.find((section) => section.key === "workspace");
    expect(workspace).toBeDefined();

    expect(workspace!.fields.find((field) => field.key === "git_strategy")?.value).toBe("");
    expect(workspace!.fields.find((field) => field.key === "cleanup_on_done")?.value).toBe(
      null,
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

describe("config-validator", () => {
  it("catches required, enum, and compatibility validation errors", () => {
    const source = readFileSync(workflowReferencePath, "utf-8");
    const model = parseWorkflowConfig(source);

    setField(model, "tracker", "api_key", "");
    setField(model, "agent", "backend", "invalid-backend");
    setField(model, "workspace", "git_strategy", "worktree");
    setField(model, "workspace", "repo", "https://github.com/example/repo.git");

    const issues = validateConfigModel(model);
    expect(issues.some((issue) => issue.path === "tracker.api_key")).toBe(true);
    expect(issues.some((issue) => issue.path === "agent.backend")).toBe(true);
    expect(issues.some((issue) => issue.path === "workspace.git_strategy")).toBe(
      true,
    );
  });

  it("requires workspace.repo because it is an editor-owned required field", () => {
    const source = readFileSync(workflowReferencePath, "utf-8");
    const model = parseWorkflowConfig(source);

    setField(model, "workspace", "repo", "");

    const issues = validateConfigModel(model);
    expect(issues.some((issue) => issue.path === "workspace.repo")).toBe(true);
  });

  it("accepts valid configs", () => {
    const source = readFileSync(workflowReferencePath, "utf-8");
    const model = parseWorkflowConfig(source);

    setField(model, "workspace", "repo", "/tmp/local-repo");
    setField(model, "workspace", "git_strategy", "worktree");
    setField(model, "notifications", "slack.webhook_url", "https://hooks.slack.com/services/x/y/z");
    setField(model, "notifications", "slack.events", ["all"]);

    const issues = validateConfigModel(model);
    expect(issues).toEqual([]);
  });
});

describe("config-writer", () => {
  it("preserves prompt body and yaml comments when updating frontmatter", () => {
    const fixture = [
      "---",
      "tracker:",
      "  # tracker kind comment",
      "  kind: linear",
      "  api_key: $LINEAR_API_KEY # keep me",
      "  project_slug: demo",
      "workspace:",
      "  root: /tmp/workspaces",
      "  repo: /tmp/repo",
      "  git_strategy: auto",
      "agent:",
      "  max_concurrent_agents: 3",
      "  max_turns: 20",
      "---",
      "# Prompt body",
      "You are an agent.",
    ].join("\n");

    const model = parseWorkflowConfig(fixture);
    setField(model, "agent", "max_concurrent_agents", 5);

    const updated = renderUpdatedWorkflowContent(fixture, model).content;

    expect(updated).toContain("# tracker kind comment");
    expect(updated).toContain("api_key: $LINEAR_API_KEY # keep me");
    expect(updated).toContain("max_concurrent_agents: 5");
    expect(updated).toContain("# Prompt body\nYou are an agent.");
  });

  it("does not create missing parent blocks when optional leaf values are unset", () => {
    const fixture = [
      "---",
      "tracker:",
      "  kind: linear",
      "  api_key: $LINEAR_API_KEY",
      "  project_slug: demo",
      "workspace:",
      "  root: /tmp/workspaces",
      "  repo: /tmp/repo",
      "---",
      "prompt body",
    ].join("\n");

    const model = parseWorkflowConfig(fixture);
    const updated = renderUpdatedWorkflowContent(fixture, model).content;

    expect(updated).not.toContain("prompts:");
    expect(updated).not.toContain("notifications:");
    expect(updated).not.toContain("hooks:");
    expect(updated).not.toContain("worker:");
  });

  it("updates nested keys in 4-space-indented yaml without duplicating fields", () => {
    const fixture = [
      "---",
      "tracker:",
      "    kind: linear",
      "    api_key: $LINEAR_API_KEY",
      "    project_slug: demo",
      "workspace:",
      "    root: /tmp/workspaces",
      "    repo: /tmp/repo",
      "    git_strategy: auto",
      "agent:",
      "    max_concurrent_agents: 3",
      "    max_turns: 20",
      "---",
      "prompt body",
    ].join("\n");

    const model = parseWorkflowConfig(fixture);
    setField(model, "agent", "max_turns", 25);

    const updated = renderUpdatedWorkflowContent(fixture, model).content;

    expect(updated).toContain("    max_turns: 25");
    expect(updated.match(/max_turns:/g)?.length ?? 0).toBe(1);
  });
});

describe("resolveWorkflowPath", () => {
  it("resolves in argument -> preference -> cwd order", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "symphony-path-resolve-"));

    try {
      const explicitPath = join(tempDir, "explicit.md");
      const prefPath = join(tempDir, "pref.md");
      const cwdPath = join(tempDir, "WORKFLOW.md");
      writeFileSync(explicitPath, "---\ntracker:\n  kind: linear\n---\n", "utf-8");
      writeFileSync(prefPath, "---\ntracker:\n  kind: linear\n---\n", "utf-8");
      writeFileSync(cwdPath, "---\ntracker:\n  kind: linear\n---\n", "utf-8");

      const fromArg = resolveWorkflowPath(explicitPath, tempDir, {
        symphony: { workflow_path: prefPath },
      });
      expect(fromArg).toEqual({ ok: true, path: explicitPath });

      const fromPreference = resolveWorkflowPath(undefined, tempDir, {
        symphony: { workflow_path: prefPath },
      });
      expect(fromPreference).toEqual({ ok: true, path: prefPath });

      const fromCwd = resolveWorkflowPath(undefined, tempDir, null);
      expect(fromCwd).toEqual({ ok: true, path: cwdPath });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("expands tilde paths from preferences", () => {
    const tempHome = mkdtempSync(join(tmpdir(), "symphony-path-home-"));
    const workflowDir = join(tempHome, "workflow-home");
    const workflowPath = join(workflowDir, "WORKFLOW.md");

    const originalHome = process.env.HOME;

    try {
      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(workflowPath, "---\ntracker:\n  kind: linear\n---\n", "utf-8");

      process.env.HOME = tempHome;

      const resolved = resolveWorkflowPath(undefined, "/tmp", {
        symphony: { workflow_path: "~/workflow-home/WORKFLOW.md" },
      });

      expect(resolved).toEqual({ ok: true, path: workflowPath });
    } finally {
      process.env.HOME = originalHome;
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});

function setField(
  model: ReturnType<typeof parseWorkflowConfig>,
  sectionKey: string,
  fieldKey: string,
  value: unknown,
): void {
  const section = model.sections.find((candidate) => candidate.key === sectionKey);
  if (!section) throw new Error(`Section not found: ${sectionKey}`);

  const field = section.fields.find((candidate) => candidate.key === fieldKey);
  if (!field) throw new Error(`Field not found: ${sectionKey}.${fieldKey}`);
  field.value = value;
}
