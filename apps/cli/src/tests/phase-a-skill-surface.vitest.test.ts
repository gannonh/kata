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

  it("workflow source files do not point at inactive runtime paths", () => {
    const manifest = JSON.parse(readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8"));
    for (const skill of manifest.skills as Array<{ workflow: string }>) {
      const workflow = readFileSync(path.join(sourceRoot, "skills-src", "workflows", `${skill.workflow}.md`), "utf8");
      expect(workflow).not.toContain("kata-tools.cjs");
      expect(workflow).not.toContain("~/.claude/kata-orchestrator");
      expect(workflow).not.toContain("." + "planning/");
      expect(workflow).not.toContain("/" + "kata:" + "discuss");
    }
  });

  it("treats verify-work as evidence recording by default instead of UAT", () => {
    const executeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "execute-phase.md"),
      "utf8",
    );
    const verifyWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "verify-work.md"),
      "utf8",
    );
    const manifest = readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8");

    expect(executeWorkflow).toContain("run `kata-verify-work` to record verification evidence");
    expect(executeWorkflow).not.toContain("for user-facing verification");
    expect(verifyWorkflow).toContain("Do not infer that verification is user-facing from the skill name.");
    expect(verifyWorkflow).toContain('Use `artifactType: "uat"` only when the plan explicitly calls for user acceptance testing.');
    expect(manifest).not.toContain("demo");
    expect(manifest).toContain("Use UAT artifacts only when the plan explicitly calls for user acceptance testing.");
  });

  it("keeps task verification owned by verify-work instead of execute-phase", () => {
    const executeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "execute-phase.md"),
      "utf8",
    );
    const verifyWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "verify-work.md"),
      "utf8",
    );
    const manifest = readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8");

    expect(executeWorkflow).toContain("verificationState\": \"pending");
    expect(executeWorkflow).toContain("must not set `verificationState: verified`");
    expect(verifyWorkflow).toContain("verificationState\": \"verified");
    expect(manifest).toContain("Do not set `verificationState: verified`; `kata-verify-work` owns verification.");
  });

  it("treats a slice as the execute-phase unit of work", () => {
    const executeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "execute-phase.md"),
      "utf8",
    );
    const manifest = readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8");

    expect(executeWorkflow).toContain("execute one approved slice");
    expect(executeWorkflow).toContain("complete every executable task in the slice");
    expect(executeWorkflow).toContain("execute every executable task in that slice before routing to `kata-verify-work`");
    expect(manifest).toContain("Do not stop after one task when additional executable tasks remain in the approved slice.");
  });

  it("requires complete-milestone to inspect slice and task verification state", () => {
    const completeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "complete-milestone.md"),
      "utf8",
    );
    const manifest = readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8");

    expect(completeWorkflow).toContain("slice.list");
    expect(completeWorkflow).toContain("task.list");
    expect(completeWorkflow).toContain("verificationState` other than `verified`");
    expect(completeWorkflow).toContain("task verification artifacts live on task scope");
    expect(completeWorkflow).not.toContain("todo app MVP");
    expect(manifest).toContain('"slice.list"');
    expect(manifest).toContain('"task.list"');
    expect(manifest).toContain('"artifact.list"');
    expect(manifest).toContain('"artifact.read"');
    expect(manifest).toContain("Every required task is done with `verificationState: verified`.");
  });

  it("uses project snapshots for concrete next-step recommendations", () => {
    const verifyWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "verify-work.md"),
      "utf8",
    );
    const progressWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "progress.md"),
      "utf8",
    );
    const completeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "complete-milestone.md"),
      "utf8",
    );
    const manifest = readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8");

    expect(verifyWorkflow).toContain("project.getSnapshot");
    expect(verifyWorkflow).toContain("Recommend exactly the workflow named by `snapshot.nextAction.workflow`");
    expect(verifyWorkflow).toContain("Do not recommend `kata-complete-milestone` unless");
    expect(progressWorkflow).toContain("Use the snapshot as the source of truth");
    expect(progressWorkflow).toContain("Recommended Next Action");
    expect(progressWorkflow).toContain("Other Possible Actions");
    expect(progressWorkflow).toContain("/kata-execute-phase S003");
    expect(progressWorkflow).toContain("/kata-plan-phase S004");
    expect(completeWorkflow).toContain("If `snapshot.nextAction.workflow` is not `kata-complete-milestone`");
    expect(manifest).toContain('"project.getSnapshot"');
  });
});
