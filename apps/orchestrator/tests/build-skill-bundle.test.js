import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";

import { buildSkillBundle } from "../scripts/build-skill-bundle.js";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("buildSkillBundle", () => {
  test("renders setup + core workflow skills with SKILL frontmatter", async () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "kata-skill-bundle-"));

    await buildSkillBundle({
      sourceRoot,
      outputDir,
    });

    const setupSkill = path.join(outputDir, "kata-setup", "SKILL.md");
    const planSkill = path.join(outputDir, "kata-plan-phase", "SKILL.md");

    expect(existsSync(setupSkill)).toBe(true);
    expect(existsSync(planSkill)).toBe(true);
    expect(readFileSync(setupSkill, "utf8")).toContain("name: kata-setup");
    expect(readFileSync(planSkill, "utf8")).toContain("name: kata-plan-phase");
    expect(readFileSync(planSkill, "utf8")).toContain("@kata-sh/cli setup");

    rmSync(outputDir, { recursive: true, force: true });
  });
});
