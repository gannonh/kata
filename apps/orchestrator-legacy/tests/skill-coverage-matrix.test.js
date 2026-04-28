import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(sourceRoot, "skills-src", "manifest.json");

const CORE_SKILL_WORKFLOW_MAP = {
  "kata-new-project": "new-project",
  "kata-discuss-phase": "discuss-phase",
  "kata-plan-phase": "plan-phase",
  "kata-execute-phase": "execute-phase",
  "kata-verify-work": "verify-work",
  "kata-quick": "quick",
  "kata-progress": "progress",
  "kata-health": "health",
};

const SUPPORTED_RUNTIME_OPERATIONS = new Set([
  "project.getContext",
  "milestone.getActive",
  "slice.list",
  "task.list",
  "artifact.list",
  "artifact.read",
  "artifact.write",
  "execution.getStatus",
]);

describe("skill coverage matrix", () => {
  test("manifest enforces core skill to workflow mappings and runtime metadata", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(Array.isArray(manifest.skills)).toBe(true);

    for (const [skillName, workflowName] of Object.entries(CORE_SKILL_WORKFLOW_MAP)) {
      const skill = manifest.skills.find((entry) => entry.name === skillName);
      expect(Boolean(skill)).toBe(true);
      expect(skill.workflow).toBe(workflowName);
      expect(typeof skill.setupHint).toBe("string");
      expect(skill.setupHint).toContain("@kata-sh/cli setup");

      const workflowPath = path.join(sourceRoot, "kata", "workflows", `${workflowName}.md`);
      expect(existsSync(workflowPath)).toBe(true);

      expect(Array.isArray(skill.contractOperations)).toBe(true);
      expect(skill.contractOperations.length).toBeGreaterThan(0);
      for (const operation of skill.contractOperations) {
        expect(SUPPORTED_RUNTIME_OPERATIONS.has(operation)).toBe(true);
      }
    }
  });
});
