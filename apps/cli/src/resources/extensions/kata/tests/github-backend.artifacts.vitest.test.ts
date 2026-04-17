import { describe, expect, it } from "vitest";

import { GithubBackend, type GithubBackendClient, type GithubBackendConfig } from "../github-backend.js";
import {
  maybeParseGithubArtifactMetadata,
  serializeGithubArtifactMetadata,
} from "../github-artifacts.js";

interface MutableIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  body?: string | null;
}

class FakeGithubClient implements GithubBackendClient {
  private issues: MutableIssue[] = [];
  private nextNumber = 1;
  private listIssuesCalls = 0;
  private parentByChild = new Map<number, number>();
  private childrenByParent = new Map<number, Set<number>>();

  constructor(seed: MutableIssue[] = []) {
    this.issues = seed.map((issue) => ({ ...issue, labels: [...issue.labels] }));
    this.nextNumber =
      this.issues.length > 0 ? Math.max(...this.issues.map((issue) => issue.number)) + 1 : 1;
  }

  async listIssues() {
    this.listIssuesCalls += 1;
    return this.issues
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((issue) => ({ ...issue, labels: [...issue.labels] }));
  }

  async getIssue(number: number) {
    const issue = this.issues.find((candidate) => candidate.number === number);
    if (!issue) return null;
    return { ...issue, labels: [...issue.labels] };
  }

  async createIssue(payload: { title: string; body?: string; labels?: string[] }) {
    const issue: MutableIssue = {
      number: this.nextNumber++,
      title: payload.title,
      body: payload.body ?? "",
      state: "open",
      labels: payload.labels ? [...payload.labels] : [],
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

  countIssuesByPrefix(prefix: string): number {
    return this.issues.filter((issue) => issue.title.startsWith(prefix)).length;
  }

  findIssueByKataId(kataId: string): MutableIssue | undefined {
    return this.issues.find((issue) => issue.title.startsWith(`[${kataId}]`));
  }

  allIssues(): MutableIssue[] {
    return this.issues.map((issue) => ({ ...issue, labels: [...issue.labels] }));
  }

  getListIssuesCallCount(): number {
    return this.listIssuesCalls;
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
  token: "test-token",
  repoOwner: "kata-sh",
  repoName: "kata-mono",
  stateMode: "labels",
  labelPrefix: "kata:",
};

function makeBackend(client: FakeGithubClient): GithubBackend {
  return new GithubBackend("/tmp/kata-github-artifacts", CONFIG, client);
}

const ROADMAP = `# M009: GitHub Backend Parity

## Slices

- [ ] **S01: Bootstrap** \`risk:high\` \`depends:[]\`
> After this: bootstrap works.

- [ ] **S02: Planning authoring** \`risk:medium\` \`depends:[S01]\`
> After this: planning writes artifacts.
`;

const SLICE_PLAN = `# S02: Planning authoring

## Tasks

- [ ] **T01: Define metadata contract** \`est:2h\`
  - Verify: pnpm test metadata

- [ ] **T02: Implement upsert paths** \`est:3h\`
  - Verify: pnpm test github backend
`;

const SLICE_PLAN_LOWERCASE_IDS = `# S02: Planning authoring

## Tasks

- [ ] **t01: Define metadata contract** \`est:2h\`
  - Verify: pnpm test metadata

- [ ] **t02: Implement upsert paths** \`est:3h\`
  - Verify: pnpm test github backend
`;

const SLICE_PLAN_MALFORMED = `# S02: Planning authoring

This plan intentionally omits canonical task IDs.

## Tasks

- [ ] Define metadata contract
- [ ] Implement upsert paths
`;

describe("GithubBackend artifact persistence", () => {
  it("upserts milestone roadmap and materializes slice dependency metadata", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);

    expect(client.countIssuesByPrefix("[M009]")).toBe(1);
    expect(client.countIssuesByPrefix("[S01]")).toBe(1);
    expect(client.countIssuesByPrefix("[S02]")).toBe(1);

    const slice = client.findIssueByKataId("S02");
    expect(slice).toBeTruthy();
    const metadata = maybeParseGithubArtifactMetadata(slice?.body ?? "");
    expect(metadata?.dependsOn).toEqual(["S01"]);

    const readback = await backend.readDocument("M009-ROADMAP");
    expect(readback).toContain("S02: Planning authoring");

    await backend.writeDocument("M009-ROADMAP", ROADMAP);
    expect(client.countIssuesByPrefix("[M009]")).toBe(1);
    expect(client.countIssuesByPrefix("[S01]")).toBe(1);
    expect(client.countIssuesByPrefix("[S02]")).toBe(1);
  });

  it("upserts slice plan and creates task artifacts without duplicates", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);

    const scope = await backend.resolveSliceScope("M009", "S02");
    expect(scope).toEqual({ issueId: expect.any(String) });

    await backend.writeDocument("S02-PLAN", SLICE_PLAN, scope);

    expect(client.countIssuesByPrefix("[T01]")).toBe(1);
    expect(client.countIssuesByPrefix("[T02]")).toBe(1);

    const sliceIssueNumber = Number(scope.issueId);
    expect(await client.listSubIssueNumbers(sliceIssueNumber)).toEqual([4, 5]);

    expect(await backend.isSlicePlanned("M009", "S02")).toBe(true);

    await backend.writeDocument("S02-PLAN", SLICE_PLAN, scope);
    expect(client.countIssuesByPrefix("[T01]")).toBe(1);
    expect(client.countIssuesByPrefix("[T02]")).toBe(1);

    const docs = await backend.listDocuments(scope);
    expect(docs).toContain("S02-PLAN");
  });

  it("does not treat a slice as planned when no task sub-issues were materialized", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);

    const scope = await backend.resolveSliceScope("M009", "S02");
    expect(scope).toEqual({ issueId: expect.any(String) });

    await backend.writeDocument("S02-PLAN", SLICE_PLAN_MALFORMED, scope);

    // No canonical T## tasks should be materialized from malformed plan content.
    expect(client.countIssuesByPrefix("[T01]")).toBe(0);
    expect(client.countIssuesByPrefix("[T02]")).toBe(0);

    // Without task sub-issues, the slice is not considered planned.
    expect(await backend.isSlicePlanned("M009", "S02")).toBe(false);
  });

  it("does not treat legacy plain-body artifacts as planned without real sub-issue links", async () => {
    const client = new FakeGithubClient([
      {
        number: 341,
        title: "[S01] Command + skill discovery substrate",
        state: "open",
        labels: ["kata:slice"],
        body: [
          "# S01: Command + skill discovery substrate",
          "",
          "**Milestone:** M001 — Desktop Slash Autocomplete Parity",
          "",
          "## Tasks",
          "- [ ] **T01: Define SlashCommandEntry and SkillEntry types**",
        ].join("\n"),
      },
      {
        number: 347,
        title: "[T01] Define SlashCommandEntry and SkillEntry types",
        state: "open",
        labels: ["kata:task"],
        body: [
          "# T01: Define SlashCommandEntry and SkillEntry types",
          "",
          "**Slice:** S01",
          "**Milestone:** M001",
          "",
          "Parent: #341",
        ].join("\n"),
      },
    ]);
    const backend = makeBackend(client);

    const scope = await backend.resolveSliceScope("M001", "S01");
    expect(scope).toEqual({ issueId: "341" });

    expect(await backend.isSlicePlanned("M001", "S01")).toBe(false);
    expect(await client.listSubIssueNumbers(341)).toEqual([]);
  });

  it("requires explicit milestone/slice scope matches when resolving issues by Kata ID", async () => {
    const client = new FakeGithubClient([
      {
        number: 10,
        title: "[S01] Legacy slice without milestone metadata",
        state: "open",
        labels: ["kata:slice"],
        body: "Legacy issue body",
      },
      {
        number: 11,
        title: "[S01] Scoped slice for M010",
        state: "open",
        labels: ["kata:slice"],
        body: serializeGithubArtifactMetadata({
          schema: "kata/github-artifact/v1",
          kind: "slice",
          kataId: "S01",
          milestoneId: "M010",
        }),
      },
    ]);
    const backend = makeBackend(client);

    const scope = await backend.resolveSliceScope("M010", "S01");
    expect(scope).toEqual({ issueId: "11" });
  });

  it("reuses cached issue listings during planning upserts", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);
    const scope = await backend.resolveSliceScope("M009", "S02");
    expect(scope).toBeTruthy();
    if (!scope) throw new Error("Expected scope for S02");

    await backend.writeDocument("S02-PLAN", SLICE_PLAN, scope);

    expect(client.getListIssuesCallCount()).toBeLessThanOrEqual(1);
  });

  it("normalizes lowercase task IDs to uppercase when materializing task issues", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);
    const scope = await backend.resolveSliceScope("M009", "S02");
    expect(scope).toBeTruthy();
    if (!scope) throw new Error("Expected scope for S02");

    await backend.writeDocument("S02-PLAN", SLICE_PLAN_LOWERCASE_IDS, scope);

    expect(client.countIssuesByPrefix("[T01]")).toBe(1);
    expect(client.countIssuesByPrefix("[T02]")).toBe(1);
    expect(client.countIssuesByPrefix("[t01]")).toBe(0);
    expect(client.countIssuesByPrefix("[t02]")).toBe(0);

    const taskIssue = client.findIssueByKataId("T01");
    expect(taskIssue?.title).toContain("[T01]");
  });
});
