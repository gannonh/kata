import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";

import { buildSkillBundle } from "../scripts/build-skill-bundle.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("buildSkillBundle", () => {
  test("renders setup + golden-path core skills with progressive disclosure references", async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "kata-skill-bundle-"));

    await buildSkillBundle({
      sourceRoot,
      outputDir,
    });

    const setupSkill = path.join(outputDir, "kata-setup", "SKILL.md");
    const coreSkills = [
      "kata-complete-milestone",
      "kata-execute-phase",
      "kata-health",
      "kata-new-milestone",
      "kata-new-project",
      "kata-plan-phase",
      "kata-progress",
      "kata-setup",
      "kata-verify-work",
    ];
    const planSkill = path.join(outputDir, "kata-plan-phase", "SKILL.md");
    const planReferences = path.join(outputDir, "kata-plan-phase", "references");
    const planWorkflowRef = path.join(planReferences, "workflow.md");
    const planRuntimeRef = path.join(planReferences, "runtime-contract.md");
    const planSetupRef = path.join(planReferences, "setup.md");
    const planAlignmentRef = path.join(planReferences, "alignment.md");
    const planKataCallScript = path.join(outputDir, "kata-plan-phase", "scripts", "kata-call.mjs");

    expect(existsSync(setupSkill)).toBe(true);
    expect(readFileSync(setupSkill, "utf8")).toContain("name: kata-setup");
    expect(readFileSync(setupSkill, "utf8")).toContain("references/setup.md");
    expect(readFileSync(setupSkill, "utf8")).toContain("references/workflow.md");
    expect(readFileSync(setupSkill, "utf8")).toContain("references/runtime-contract.md");

    for (const skillName of coreSkills) {
      const skillPath = path.join(outputDir, skillName, "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
      const content = readFileSync(skillPath, "utf8");
      expect(content).toContain(`name: ${skillName}`);
      expect(content).toContain("## Execution Rules");
      expect(content).toContain("references/workflow.md");
      expect(content).toContain("references/runtime-contract.md");
      expect(content).toContain("references/setup.md");
      expect(content).toContain("references/alignment.md");
    }

    expect(existsSync(planReferences)).toBe(true);
    expect(existsSync(planWorkflowRef)).toBe(true);
    expect(existsSync(planRuntimeRef)).toBe(true);
    expect(existsSync(planSetupRef)).toBe(true);
    expect(existsSync(planAlignmentRef)).toBe(true);
    expect(existsSync(planKataCallScript)).toBe(true);
    expect(readFileSync(planSkill, "utf8")).toContain("compatibility:");
    expect(readFileSync(planWorkflowRef, "utf8")).toContain("Source: `apps/orchestrator/skills-src/workflows/plan-phase.md`");
    expect(readFileSync(planRuntimeRef, "utf8")).toContain("- `artifact.write`");
    expect(readFileSync(planSetupRef, "utf8")).toContain("@kata-sh/cli setup");

    rmSync(outputDir, { recursive: true, force: true });
  });
});
