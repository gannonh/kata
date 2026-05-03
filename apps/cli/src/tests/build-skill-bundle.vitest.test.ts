import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const cliRoot = process.cwd();

describe("skill bundle generation", () => {
  it("generates progressive-disclosure skills from the CLI skill source", () => {
    const result = spawnSync(process.execPath, ["scripts/bundle-skills.mjs"], {
      cwd: cliRoot,
      encoding: "utf8",
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);

    const skillPath = path.join(cliRoot, "skills", "kata-plan-phase", "SKILL.md");
    const workflowReferencePath = path.join(cliRoot, "skills", "kata-plan-phase", "references", "workflow.md");
    const runtimeReferencePath = path.join(cliRoot, "skills", "kata-plan-phase", "references", "runtime-contract.md");
    const setupReferencePath = path.join(cliRoot, "skills", "kata-plan-phase", "references", "setup.md");
    const cliRuntimeReferencePath = path.join(cliRoot, "skills", "kata-plan-phase", "references", "cli-runtime.md");
    const artifactContractReferencePath = path.join(
      cliRoot,
      "skills",
      "kata-plan-phase",
      "references",
      "artifact-contract.md",
    );
    const helperScriptPath = path.join(cliRoot, "skills", "kata-plan-phase", "scripts", "kata-call.mjs");
    const artifactInputHelperScriptPath = path.join(
      cliRoot,
      "skills",
      "kata-plan-phase",
      "scripts",
      "kata-artifact-input.mjs",
    );

    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(workflowReferencePath)).toBe(true);
    expect(existsSync(runtimeReferencePath)).toBe(true);
    expect(existsSync(cliRuntimeReferencePath)).toBe(true);
    expect(existsSync(artifactContractReferencePath)).toBe(true);
    expect(existsSync(helperScriptPath)).toBe(true);
    expect(existsSync(artifactInputHelperScriptPath)).toBe(true);

    const skill = readFileSync(skillPath, "utf8");
    const workflow = readFileSync(workflowReferencePath, "utf8");
    const runtime = readFileSync(runtimeReferencePath, "utf8");
    const setup = readFileSync(setupReferencePath, "utf8");
    const helperScript = readFileSync(helperScriptPath, "utf8");
    const artifactInputHelperScript = readFileSync(artifactInputHelperScriptPath, "utf8");

    expect(skill).toContain("references/alignment.md");
    expect(skill).toContain("references/workflow.md");
    expect(skill).toContain("references/runtime-contract.md");
    expect(skill).toContain("references/cli-runtime.md");
    expect(skill).toContain("references/artifact-contract.md");
    expect(skill).toContain("scripts/kata-artifact-input.mjs");
    expect(skill).toContain("## Process");
    expect(skill).toContain("Read `references/workflow.md` before taking action. Execute that workflow end-to-end.");
    expect(skill).toContain("Preserve every workflow gate");
    expect(skill).toContain("## Resource Loading");
    expect(skill).toContain("Must read:");
    expect(skill).toContain("Read when needed:");
    expect(workflow).not.toContain("Source:");
    expect(workflow).not.toContain("apps/cli/dist/loader.js");
    expect(runtime).toContain("project.getContext");
    expect(runtime).toContain("slice.create");
    expect(existsSync(path.join(cliRoot, "skills", "kata-plan-issue", "SKILL.md"))).toBe(true);
    expect(readFileSync(path.join(cliRoot, "skills", "kata-plan-issue", "references", "workflow.md"), "utf8")).toContain("issue.create");
    expect(readFileSync(path.join(cliRoot, "skills", "kata-plan-issue", "references", "workflow.md"), "utf8")).toContain("backend with `issue.create` support");
    expect(existsSync(path.join(cliRoot, "skills", "kata-execute-issue", "SKILL.md"))).toBe(true);
    expect(readFileSync(path.join(cliRoot, "skills", "kata-execute-issue", "references", "workflow.md"), "utf8")).toContain("issue.listOpen");
    expect(readFileSync(path.join(cliRoot, "skills", "kata-execute-issue", "references", "workflow.md"), "utf8")).toContain("backend with `issue.listOpen`, `issue.get`, and `issue.updateStatus` support");
    expect(existsSync(path.join(cliRoot, "skills", "kata-execute-issue", "templates", "implementer-prompt.md"))).toBe(true);
    expect(setup).toContain("`setup` installs or refreshes Kata skills for the selected target");
    expect(setup).toContain("Kata Type");
    expect(setup).toContain("Kata Artifact Scope");
    expect(setup).not.toContain("The Project `Status` field must include these options");
    expect(helperScript).toContain("loadDotEnv(process.cwd())");
    expect(helperScript).toContain("path.resolve(process.cwd(), process.env.KATA_CLI_ROOT)");
    expect(artifactInputHelperScript).toContain("JSON.stringify(payload, null, 2)");
    expect(existsSync(path.join(cliRoot, "skills", "kata-discuss-phase"))).toBe(false);
  });

  it("generates artifact input JSON from Markdown without hand escaping", () => {
    const fixtureDir = path.join(tmpdir(), `kata-artifact-input-${Date.now()}`);
    const scriptsDir = path.join(fixtureDir, "scripts");
    const markdownPath = path.join(fixtureDir, "verification.md");
    const outputPath = path.join(fixtureDir, "artifact.json");

    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(
      path.join(scriptsDir, "kata-artifact-input.mjs"),
      readFileSync(path.join(cliRoot, "skills-src", "scripts", "kata-artifact-input.mjs"), "utf8"),
      "utf8",
    );
    writeFileSync(markdownPath, "# Verification\n\n- `pnpm test` passed.\n| A | B |\n|---|---|\n", "utf8");

    const result = spawnSync(
      process.execPath,
      [
        "scripts/kata-artifact-input.mjs",
        "--scope-type",
        "task",
        "--scope-id",
        "T001",
        "--artifact-type",
        "verification",
        "--title",
        "T001 Verification",
        "--content-file",
        markdownPath,
        "--output",
        outputPath,
      ],
      {
        cwd: fixtureDir,
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toMatchObject({
      scopeType: "task",
      scopeId: "T001",
      artifactType: "verification",
      title: "T001 Verification",
      content: "# Verification\n\n- `pnpm test` passed.\n| A | B |\n|---|---|\n",
      format: "markdown",
    });
  });

  it("generates helpers that route CLI commands separately from runtime operations", () => {
    const fixtureDir = path.join(tmpdir(), `kata-skill-helper-${Date.now()}`);
    const scriptsDir = path.join(fixtureDir, "scripts");
    const fakeCliDir = path.join(fixtureDir, "fake-cli", "dist");
    const callsPath = path.join(fixtureDir, "calls.jsonl");

    mkdirSync(scriptsDir, { recursive: true });
    mkdirSync(fakeCliDir, { recursive: true });
    writeFileSync(path.join(fixtureDir, ".env"), "KATA_CLI_ROOT=./fake-cli\nESCAPED=\"path\\\\to\\\"file\"\n", "utf8");
    writeFileSync(
      path.join(fakeCliDir, "loader.js"),
      [
        "#!/usr/bin/env node",
        "import { appendFileSync } from 'node:fs';",
        `appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ args: process.argv.slice(2), escaped: process.env.ESCAPED }) + "\\n");`,
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      path.join(scriptsDir, "kata-call.mjs"),
      readFileSync(path.join(cliRoot, "skills-src", "scripts", "kata-call.mjs"), "utf8"),
      "utf8",
    );

    const doctor = spawnSync(process.execPath, ["scripts/kata-call.mjs", "doctor"], {
      cwd: fixtureDir,
      encoding: "utf8",
    });
    expect(doctor.status, doctor.stderr || doctor.stdout).toBe(0);

    const health = spawnSync(process.execPath, ["scripts/kata-call.mjs", "health.check"], {
      cwd: fixtureDir,
      encoding: "utf8",
    });
    expect(health.status, health.stderr || health.stdout).toBe(0);
    const json = spawnSync(process.execPath, ["scripts/kata-call.mjs", "json", "request.json"], {
      cwd: fixtureDir,
      encoding: "utf8",
    });
    expect(json.status, json.stderr || json.stdout).toBe(0);
    const help = spawnSync(process.execPath, ["scripts/kata-call.mjs"], {
      cwd: fixtureDir,
      encoding: "utf8",
    });
    expect(help.status, help.stderr || help.stdout).toBe(0);

    const calls = readFileSync(callsPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(calls.map((call) => call.args)).toEqual([["doctor"], ["call", "health.check"], ["json", "request.json"], ["help"]]);
    expect(calls.every((call) => call.escaped === String.raw`path\to"file`)).toBe(true);
  });
});
