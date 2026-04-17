import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GithubBackend, type GithubBackendClient, type GithubBackendConfig } from "../github-backend.js";

interface IssueShape {
  number: number;
  title: string;
  body?: string | null;
  state: "open" | "closed";
  labels: string[];
}

class FixtureGithubClient implements GithubBackendClient {
  private issues: IssueShape[] = [];
  private nextNumber = 1;
  private parentByChild = new Map<number, number>();
  private childrenByParent = new Map<number, Set<number>>();

  async listIssues() {
    return this.issues
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((issue) => ({ ...issue, labels: [...issue.labels] }));
  }

  async getIssue(number: number) {
    const issue = this.issues.find((candidate) => candidate.number === number);
    return issue ? { ...issue, labels: [...issue.labels] } : null;
  }

  async createIssue(payload: { title: string; body?: string; labels?: string[] }) {
    const issue: IssueShape = {
      number: this.nextNumber++,
      title: payload.title,
      body: payload.body ?? "",
      labels: payload.labels ? [...payload.labels] : [],
      state: "open",
    };
    this.issues.push(issue);
    return { ...issue, labels: [...issue.labels] };
  }

  async updateIssue(number: number, payload: { title?: string; body?: string; state?: "open" | "closed"; labels?: string[] }) {
    const issue = this.issues.find((candidate) => candidate.number === number);
    if (!issue) throw new Error(`Issue #${number} not found`);
    if (payload.title !== undefined) issue.title = payload.title;
    if (payload.body !== undefined) issue.body = payload.body;
    if (payload.state !== undefined) issue.state = payload.state;
    if (payload.labels !== undefined) issue.labels = [...payload.labels];
    return { ...issue, labels: [...issue.labels] };
  }

  count(prefix: string): number {
    return this.issues.filter((issue) => issue.title.startsWith(prefix)).length;
  }

  async listSubIssueNumbers(parentIssueNumber: number): Promise<number[]> {
    return [...(this.childrenByParent.get(parentIssueNumber) ?? new Set<number>())].sort((a, b) => a - b);
  }

  async addSubIssue(parentIssueNumber: number, subIssueNumber: number): Promise<void> {
    if (parentIssueNumber === subIssueNumber) return;
    const existingParent = this.parentByChild.get(subIssueNumber);
    if (existingParent && existingParent !== parentIssueNumber) {
      throw new Error(`Task #${subIssueNumber} already linked to parent #${existingParent}`);
    }
    this.parentByChild.set(subIssueNumber, parentIssueNumber);
    const children = this.childrenByParent.get(parentIssueNumber) ?? new Set<number>();
    children.add(subIssueNumber);
    this.childrenByParent.set(parentIssueNumber, children);
  }
}

const CONFIG: GithubBackendConfig = {
  token: "token",
  repoOwner: "kata-sh",
  repoName: "kata-mono",
  stateMode: "labels",
  labelPrefix: "kata:",
};

const ROADMAP = `# M009: GitHub parity

## Slices

- [ ] **S02: Planning artifact authoring** \`risk:high\` \`depends:[]\`
> After this: GitHub artifacts persist.
`;

const PLAN_V1 = `# S02: Planning artifact authoring

## Tasks

- [ ] **T01: Lock metadata contract** \`est:2h\`
  - Verify: pnpm test metadata

- [ ] **T02: Implement upsert path** \`est:3h\`
  - Verify: pnpm test backend
`;

const PLAN_V2 = `# S02: Planning artifact authoring

## Tasks

- [ ] **T01: Lock metadata contract** \`est:2h\`
  - Verify: pnpm test metadata

- [ ] **T02: Implement upsert path** \`est:3h\`
  - Verify: pnpm test backend

- [ ] **T03: Add dependency readback checks** \`est:2h\`
  - Verify: pnpm test dependency
`;

describe("GitHub planning integration", () => {
  it("round-trips create -> derive -> replan without duplicate artifacts", async () => {
    const client = new FixtureGithubClient();
    const workspace = mkdtempSync(join(tmpdir(), "github-integration-"));
    const backend = new GithubBackend(workspace, CONFIG, client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);
    const sliceScope = await backend.resolveSliceScope("M009", "S02");
    expect(sliceScope).toEqual({ issueId: expect.any(String) });

    await backend.writeDocument("S02-PLAN", PLAN_V1, sliceScope);

    const stateAfterFirstPlan = await backend.deriveState();
    expect(stateAfterFirstPlan.activeMilestone?.id).toBe("M009");
    expect(stateAfterFirstPlan.activeSlice?.id).toBe("S02");
    expect(stateAfterFirstPlan.activeTask?.id).toBe("T01");

    expect(client.count("[T01]")).toBe(1);
    expect(client.count("[T02]")).toBe(1);

    await backend.writeDocument("S02-PLAN", PLAN_V2, sliceScope);

    const stateAfterReplan = await backend.deriveState();
    expect(stateAfterReplan.activeMilestone?.id).toBe("M009");
    expect(stateAfterReplan.activeSlice?.id).toBe("S02");
    expect(stateAfterReplan.activeTask?.id).toBe("T01");

    expect(client.count("[T01]")).toBe(1);
    expect(client.count("[T02]")).toBe(1);
    expect(client.count("[T03]")).toBe(1);

    const readback = await backend.readDocument("S02-PLAN", sliceScope);
    expect(readback).toContain("T03: Add dependency readback checks");
  });
});
