import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const cliRoot = process.cwd();
const sourceRoot = path.join(cliRoot, "skills-src");

const inputRequiredOperations = new Set([
  "project.upsert",
  "milestone.create",
  "milestone.complete",
  "slice.list",
  "slice.create",
  "slice.updateStatus",
  "task.list",
  "task.create",
  "task.updateStatus",
  "issue.create",
  "artifact.list",
  "artifact.read",
  "artifact.write",
]);

interface ManifestSkill {
  name: string;
  workflow: string;
  contractOperations: string[];
  requiredReferences: string[];
  requiredTemplates: string[];
}

function readManifest(): { skills: ManifestSkill[] } {
  return JSON.parse(readFileSync(path.join(sourceRoot, "manifest.json"), "utf8"));
}

function readSourceWorkflow(workflowName: string) {
  return readFileSync(path.join(sourceRoot, "workflows", `${workflowName}.md`), "utf8");
}

describe("skill migration quality gates", () => {
  it("tracks required runtime references for every Phase A skill", () => {
    const manifest = readManifest();

    for (const skill of manifest.skills) {
      expect(skill.requiredReferences).toContain("cli-runtime");
      expect(skill.requiredReferences).toContain("artifact-contract");
      expect(Array.isArray(skill.requiredTemplates)).toBe(true);
    }
  });

  it("declares required progressive-disclosure references that exist in source", () => {
    for (const skill of readManifest().skills) {
      for (const reference of skill.requiredReferences) {
        expect(
          existsSync(path.join(sourceRoot, "references", `${reference}.md`)),
          `${skill.name} reference ${reference}`,
        ).toBe(true);
      }
      for (const template of skill.requiredTemplates) {
        expect(
          existsSync(path.join(sourceRoot, "templates", `${template}.md`)),
          `${skill.name} template ${template}`,
        ).toBe(true);
      }
    }
  });

  it("does not ship skeleton-only runtime instructions", () => {
    const manifest = readManifest();

    for (const skill of manifest.skills) {
      const workflow = readSourceWorkflow(skill.workflow);

      for (const operation of skill.contractOperations) {
        expect(
          workflow,
          `${skill.name} shows executable helper command for ${operation}`,
        ).toContain(`scripts/kata-call.mjs ${operation}`);

        if (inputRequiredOperations.has(operation)) {
          expect(workflow, `${skill.name} ${operation} uses --input`).toContain(`${operation} --input`);
          expect(workflow, `${skill.name} ${operation} has JSON object example`).toContain("```json");
        }
      }
    }
  });

  it("keeps the core Phase A workflows behaviorally migrated", () => {
    const projectWorkflow = readSourceWorkflow("new-project");
    expect(projectWorkflow).toContain("questioning");
    expect(projectWorkflow).toContain("project.upsert");
    expect(projectWorkflow).toContain("artifact.write");
    expect(projectWorkflow).toContain("kata-new-milestone");

    const milestoneWorkflow = readSourceWorkflow("new-milestone");
    expect(milestoneWorkflow).toContain("milestone.create");
    expect(milestoneWorkflow).toContain("requirements");
    expect(milestoneWorkflow).toContain("roadmap");
    expect(milestoneWorkflow).toContain("kata-plan-phase");

    const planWorkflow = readSourceWorkflow("plan-phase");
    expect(planWorkflow).toContain("slice.create");
    expect(planWorkflow).toContain("task.create");
    expect(planWorkflow).toContain("plan");
    expect(planWorkflow).toContain("phase gate");

    const planIssueWorkflow = readSourceWorkflow("plan-issue");
    expect(planIssueWorkflow).toContain("issue.create");
    expect(planIssueWorkflow).toContain("# Design");
    expect(planIssueWorkflow).toContain("# Plan");
    expect(planIssueWorkflow).toContain("Do not create milestones, slices, or tasks");
    expect(planIssueWorkflow).toContain("Do not draft the design, do not draft the implementation plan");
    expect(planIssueWorkflow).toContain("Do not include the implementation plan yet");
    expect(planIssueWorkflow).toContain("Do not run `issue.create` until the user approves both the design and the plan");
  });
});
