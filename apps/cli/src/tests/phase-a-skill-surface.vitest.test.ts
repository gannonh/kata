import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = process.cwd();

describe("Phase A skill surface", () => {
  it("manifest exposes the primary workflows and no standalone discussion shortcuts", () => {
    const manifest = JSON.parse(readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8"));
    const names = manifest.skills.map((skill: { name: string }) => skill.name).sort();

    expect(names).toEqual([
      "kata-complete-milestone",
      "kata-execute-phase",
      "kata-health",
      "kata-new-milestone",
      "kata-new-project",
      "kata-plan-phase",
      "kata-progress",
      "kata-setup",
      "kata-verify-work",
    ]);
  });

  it("workflow source files do not point at legacy orchestrator runtime paths", () => {
    const manifest = JSON.parse(readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8"));
    for (const skill of manifest.skills as Array<{ workflow: string }>) {
      const workflow = readFileSync(path.join(sourceRoot, "skills-src", "workflows", `${skill.workflow}.md`), "utf8");
      expect(workflow).not.toContain("kata-tools.cjs");
      expect(workflow).not.toContain("~/.claude/kata-orchestrator");
      expect(workflow).not.toContain(".planning/");
      expect(workflow).not.toContain("/kata:discuss");
    }
  });
});
