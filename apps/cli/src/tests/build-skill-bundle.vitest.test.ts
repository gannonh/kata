import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
    const helperScriptPath = path.join(cliRoot, "skills", "kata-plan-phase", "scripts", "kata-call.mjs");

    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(workflowReferencePath)).toBe(true);
    expect(existsSync(runtimeReferencePath)).toBe(true);
    expect(existsSync(helperScriptPath)).toBe(true);

    const skill = readFileSync(skillPath, "utf8");
    const workflow = readFileSync(workflowReferencePath, "utf8");
    const runtime = readFileSync(runtimeReferencePath, "utf8");
    const helperScript = readFileSync(helperScriptPath, "utf8");

    expect(skill).toContain("references/alignment.md");
    expect(skill).toContain("references/workflow.md");
    expect(skill).toContain("references/runtime-contract.md");
    expect(workflow).toContain("Source: `apps/cli/skills-src/workflows/plan-phase.md`");
    expect(runtime).toContain("project.getContext");
    expect(runtime).toContain("slice.create");
    expect(helperScript).toContain("loadDotEnv(process.cwd())");
    expect(helperScript).toContain("path.resolve(process.cwd(), process.env.KATA_CLI_ROOT)");
    expect(existsSync(path.join(cliRoot, "skills", "kata-discuss-phase"))).toBe(false);
  });
});
