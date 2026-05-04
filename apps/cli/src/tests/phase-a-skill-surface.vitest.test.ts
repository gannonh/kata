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
      "kata-execute-issue",
      "kata-execute-phase",
      "kata-health",
      "kata-new-milestone",
      "kata-new-project",
      "kata-plan-issue",
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

  it("paves verify-work artifact writes through the JSON encoder helper", () => {
    const verifyWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "verify-work.md"),
      "utf8",
    );

    expect(verifyWorkflow).toContain("kata-artifact-input.mjs");
    expect(verifyWorkflow).toContain("--content-file /tmp/T001-verification.md");
    expect(verifyWorkflow).not.toContain('"content": "# Verification');
    expect(verifyWorkflow).not.toContain('"content": "# Verification\\n');
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
    expect(completeWorkflow).toContain("Read task summaries and verification artifacts selectively");
    expect(completeWorkflow).not.toContain("todo app MVP");
    expect(manifest).toContain('"slice.list"');
    expect(manifest).toContain('"task.list"');
    expect(manifest).toContain('"artifact.list"');
    expect(manifest).toContain('"artifact.read"');
    expect(manifest).toContain("Every required task is done with `verificationState: verified`.");
  });

  it("requires complete-milestone to update project closeout artifacts before completion", () => {
    const completeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "complete-milestone.md"),
      "utf8",
    );
    const artifactContract = readFileSync(
      path.join(sourceRoot, "skills-src", "references", "artifact-contract.md"),
      "utf8",
    );
    const manifest = readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8");

    expect(completeWorkflow).toContain('"scopeType": "project"');
    expect(completeWorkflow).toContain('"artifactType": "project-brief"');
    expect(completeWorkflow).toContain('"artifactType": "requirements"');
    expect(completeWorkflow).toContain("These live on the project tracking issue");
    expect(completeWorkflow).toContain("Update Project Closeout Artifacts");
    expect(completeWorkflow).toContain("Stop before `milestone.complete` if a required project artifact read or write is missing or fails.");
    expect(completeWorkflow.indexOf("Update Project Closeout Artifacts")).toBeLessThan(
      completeWorkflow.indexOf("## Stage 7: Complete Milestone"),
    );
    expect(completeWorkflow).toContain("kata-artifact-input.mjs");
    expect(artifactContract).toContain("Milestone closeout updates may add or refresh these sections");
    expect(completeWorkflow).not.toContain("- `## Key Decisions`");
    expect(artifactContract).toContain("During milestone closeout, update project requirements");
    expect(manifest).toContain("update project closeout artifacts");
    expect(manifest).toContain("Do not run `milestone.complete` after a failed project closeout artifact read or write.");
  });

  it("keeps milestone closeout idempotent and delays the complete banner until success", () => {
    const completeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "complete-milestone.md"),
      "utf8",
    );
    const artifactContract = readFileSync(
      path.join(sourceRoot, "skills-src", "references", "artifact-contract.md"),
      "utf8",
    );
    const manifest = readFileSync(path.join(sourceRoot, "skills-src", "manifest.json"), "utf8");

    expect(completeWorkflow).toContain("Kata > VERIFYING");
    expect(completeWorkflow).toContain("reserve `Kata > MILESTONE COMPLETE` for the final success output after `milestone.complete` succeeds");
    expect(completeWorkflow).toContain("idempotent closeout mode");
    expect(completeWorkflow).toContain("preserve unchanged sections");
    expect(completeWorkflow).toContain("confirm any carry-forward requirement reclassification before marking it validated");
    expect(completeWorkflow).toContain("project tracking issue or URL when known");
    expect(completeWorkflow).toContain("Report the changed artifact sections");
    expect(artifactContract).toContain("preserve unchanged sections and report which sections changed in the completion output");
    expect(manifest).toContain("updated idempotently when they already exist");
    expect(manifest).toContain("Carry-forward requirements are only reclassified after explicit confirmation and evidence.");
    expect(manifest).toContain("project tracking issue when the backend reports it and reports what changed in the project artifacts");
    expect(manifest).toContain("Do not reclassify a carry-forward requirement as validated without explicit confirmation.");
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
    const planWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "plan-phase.md"),
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
    expect(planWorkflow).toContain("resolve that requirement through `snapshot.roadmap.requirementToSliceIds` first");
    expect(planWorkflow).toContain("Reload the project snapshot after creating or updating backend planning state");
    expect(planWorkflow).toContain("End with the reloaded snapshot's next action");
    expect(progressWorkflow).toContain("Prefer slice targets when a missing requirement maps to a roadmap slice");
    expect(progressWorkflow).toContain("/kata-execute-phase S003");
    expect(progressWorkflow).toContain("/kata-plan-phase S004");
    expect(completeWorkflow).toContain("If `snapshot.nextAction.workflow` is not `kata-complete-milestone`");
    expect(manifest).toContain('"project.getSnapshot"');
  });

  it("documents dependency-aware phase planning and execution", () => {
    const planWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "plan-phase.md"),
      "utf8",
    );
    const executeWorkflow = readFileSync(
      path.join(sourceRoot, "skills-src", "workflows", "execute-phase.md"),
      "utf8",
    );
    const roadmapTemplate = readFileSync(path.join(sourceRoot, "skills-src", "templates", "roadmap.md"), "utf8");

    expect(planWorkflow).toContain("Inspect `snapshot.roadmap.sliceDependencies`");
    expect(planWorkflow).toContain('"blockedBy": ["S001", "S002"]');
    expect(planWorkflow).toContain("unknown, ambiguous, or names work that has no backend slice ID yet");
    expect(executeWorkflow).toContain("Use `snapshot.nextAction` as the source of truth for executable slice selection");
    expect(executeWorkflow).toContain("Do not execute slices whose `blockedBy` dependencies include known non-done blockers");
    expect(executeWorkflow).toContain("Do not move a Backlog blocked slice forward");
    expect(roadmapTemplate).toContain("| Planned Slice | Backend Slice ID | Blocked By | Requirements |");
    expect(roadmapTemplate).toContain("Backend Slice: S003; Depends on: S001, S002");
    expect(roadmapTemplate).toContain("use `None` or an empty cell when there are no dependencies");
  });
});
