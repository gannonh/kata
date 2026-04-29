import { describe, expect, it } from "vitest";

import { GithubBackend, type GithubBackendClient, type GithubBackendConfig } from "../github-backend.js";
import { maybeParseGithubArtifactMetadata } from "../github-artifacts.js";

interface IssueRecord {
  number: number;
  title: string;
  state: "open" | "closed";
  labels: string[];
  body?: string | null;
}

class MemoryGithubClient implements GithubBackendClient {
  private issues: IssueRecord[] = [];
  private nextNumber = 1;
  private parentByChild = new Map<number, number>();
  private childrenByParent = new Map<number, Set<number>>();

  async listIssues() {
    return this.issues.map((issue) => ({ ...issue, labels: [...issue.labels] }));
  }

  async getIssue(number: number) {
    const issue = this.issues.find((candidate) => candidate.number === number);
    return issue ? { ...issue, labels: [...issue.labels] } : null;
  }

  async createIssue(payload: { title: string; body?: string; labels?: string[] }) {
    const issue: IssueRecord = {
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

  findByKataId(kataId: string): IssueRecord | undefined {
    return this.issues.find((issue) => issue.title.startsWith(`[${kataId}]`));
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

const ROADMAP = `# M009: GitHub backend parity

## Slices

- [ ] **S01: Bootstrap** \`risk:high\` \`depends:[]\`
> After this: baseline ready.

- [ ] **S02: Artifact authoring** \`risk:medium\` \`depends:[S01]\`
> After this: plans persist.

- [ ] **S03: CI lane** \`risk:low\` \`depends:[S01,S02]\`
> After this: CI is deterministic.
`;

describe("GitHub dependency materialization", () => {
  it("writes roadmap dependencies into durable slice metadata", async () => {
    const client = new MemoryGithubClient();
    const backend = new GithubBackend("/tmp/github-deps", CONFIG, client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);

    const s01 = maybeParseGithubArtifactMetadata(client.findByKataId("S01")?.body ?? "");
    const s02 = maybeParseGithubArtifactMetadata(client.findByKataId("S02")?.body ?? "");
    const s03 = maybeParseGithubArtifactMetadata(client.findByKataId("S03")?.body ?? "");

    expect(s01?.dependsOn ?? []).toEqual([]);
    expect(s02?.dependsOn).toEqual(["S01"]);
    expect(s03?.dependsOn).toEqual(["S01", "S02"]);

    // Rerun should not duplicate metadata or issues.
    await backend.writeDocument("M009-ROADMAP", ROADMAP);
    expect(client.findByKataId("S01")).toBeTruthy();
    expect(client.findByKataId("S02")).toBeTruthy();
    expect(client.findByKataId("S03")).toBeTruthy();
  });
});
