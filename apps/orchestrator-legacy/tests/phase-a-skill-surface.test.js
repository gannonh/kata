import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const phaseASkillNames = [
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

const legacyPatterns = [
  "kata-tools.cjs",
  "~/.claude/kata-orchestrator",
  ".planning/",
  "/kata:discuss",
];

describe("Phase A skill surface", () => {
  test("manifest exposes exactly the Phase A skills", () => {
    const manifestPath = path.join(sourceRoot, "skills-src", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const skillNames = manifest.skills.map((skill) => skill.name).sort();

    expect(skillNames).toEqual(phaseASkillNames);
  });

  test("manifest workflow sources do not reference legacy commands or paths", () => {
    const manifestPath = path.join(sourceRoot, "skills-src", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    for (const skill of manifest.skills) {
      const workflowPath = path.join(sourceRoot, "skills-src", "workflows", `${skill.workflow}.md`);
      expect(existsSync(workflowPath), `${skill.name} workflow source should exist`).toBe(true);

      const workflowBody = readFileSync(workflowPath, "utf8");
      for (const legacyPattern of legacyPatterns) {
        expect(workflowBody).not.toContain(legacyPattern);
      }
    }
  });
});
