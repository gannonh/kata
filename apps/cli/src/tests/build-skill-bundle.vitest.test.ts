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
    const cliRuntimeReferencePath = path.join(cliRoot, "skills", "kata-plan-phase", "references", "cli-runtime.md");
    const artifactContractReferencePath = path.join(
      cliRoot,
      "skills",
      "kata-plan-phase",
      "references",
      "artifact-contract.md",
    );
    const helperScriptPath = path.join(cliRoot, "skills", "kata-plan-phase", "scripts", "kata-call.mjs");

    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(workflowReferencePath)).toBe(true);
    expect(existsSync(runtimeReferencePath)).toBe(true);
    expect(existsSync(cliRuntimeReferencePath)).toBe(true);
    expect(existsSync(artifactContractReferencePath)).toBe(true);
    expect(existsSync(helperScriptPath)).toBe(true);

    const skill = readFileSync(skillPath, "utf8");
    const workflow = readFileSync(workflowReferencePath, "utf8");
    const runtime = readFileSync(runtimeReferencePath, "utf8");
    const helperScript = readFileSync(helperScriptPath, "utf8");

    expect(skill).toContain("references/alignment.md");
    expect(skill).toContain("references/workflow.md");
    expect(skill).toContain("references/runtime-contract.md");
    expect(skill).toContain("references/cli-runtime.md");
    expect(skill).toContain("references/artifact-contract.md");
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
    expect(helperScript).toContain("loadDotEnv(process.cwd())");
    expect(helperScript).toContain("path.resolve(process.cwd(), process.env.KATA_CLI_ROOT)");
    expect(existsSync(path.join(cliRoot, "skills", "kata-discuss-phase"))).toBe(false);
  });

  it("generates helpers that route CLI commands separately from runtime operations", () => {
    const fixtureDir = path.join(tmpdir(), `kata-skill-helper-${Date.now()}`);
    const scriptsDir = path.join(fixtureDir, "scripts");
    const fakeCliDir = path.join(fixtureDir, "fake-cli", "dist");
    const callsPath = path.join(fixtureDir, "calls.jsonl");

    mkdirSync(scriptsDir, { recursive: true });
    mkdirSync(fakeCliDir, { recursive: true });
    writeFileSync(path.join(fixtureDir, ".env"), "KATA_CLI_ROOT=./fake-cli\n", "utf8");
    writeFileSync(
      path.join(fakeCliDir, "loader.js"),
      [
        "#!/usr/bin/env node",
        "import { appendFileSync } from 'node:fs';",
        `appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
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

    const calls = readFileSync(callsPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(calls).toEqual([["doctor"], ["call", "health.check"]]);
  });
});
