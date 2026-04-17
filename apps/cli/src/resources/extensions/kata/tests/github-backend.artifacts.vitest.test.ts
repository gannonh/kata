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

    expect(await backend.isSlicePlanned("M009", "S02")).toBe(true);

    await backend.writeDocument("S02-PLAN", SLICE_PLAN, scope);
    expect(client.countIssuesByPrefix("[T01]")).toBe(1);
    expect(client.countIssuesByPrefix("[T02]")).toBe(1);

    const docs = await backend.listDocuments(scope);
    expect(docs).toContain("S02-PLAN");
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
});
