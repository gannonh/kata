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
  updatedAt?: string | null;
}

class FakeGithubClient implements GithubBackendClient {
  private issues: MutableIssue[] = [];
  private nextNumber = 1;
  private listIssuesCalls = 0;
  private parentByChild = new Map<number, number>();
  private childrenByParent = new Map<number, Set<number>>();
  private commentsByIssue = new Map<number, Array<{
    id: number;
    body: string;
    created_at: string;
    updated_at: string;
    html_url: string;
  }>>();
  private nextCommentId = 1;
  private projectStatusUpdates: Array<{ issueNumber: number; stateName: string }> = [];

  constructor(seed: MutableIssue[] = []) {
    this.issues = seed.map((issue) => ({ ...issue, labels: [...issue.labels], updatedAt: issue.updatedAt ?? "2026-04-12T00:00:00.000Z" }));
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
      updatedAt: "2026-04-12T00:00:00.000Z",
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
    issue.updatedAt = "2026-04-12T00:00:00.000Z";

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

  seedComments(issueNumber: number, comments: Array<{ id: number; body: string }>): void {
    this.commentsByIssue.set(
      issueNumber,
      comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        created_at: "2026-04-12T00:00:00.000Z",
        updated_at: "2026-04-12T00:00:00.000Z",
        html_url: `https://github.com/${CONFIG.repoOwner}/${CONFIG.repoName}/issues/comments/${comment.id}`,
      })),
    );
    if (comments.length > 0) {
      this.nextCommentId = Math.max(this.nextCommentId, ...comments.map((comment) => comment.id + 1));
    }
  }

  async listIssueComments(issueNumber: number) {
    return [...(this.commentsByIssue.get(issueNumber) ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((comment) => ({ ...comment }));
  }

  async createIssueComment(issueNumber: number, body: string) {
    const comment = {
      id: this.nextCommentId++,
      body,
      created_at: "2026-04-12T00:00:00.000Z",
      updated_at: "2026-04-12T00:00:00.000Z",
      html_url: `https://github.com/${CONFIG.repoOwner}/${CONFIG.repoName}/issues/comments/${this.nextCommentId - 1}`,
    };
    const list = this.commentsByIssue.get(issueNumber) ?? [];
    list.push(comment);
    this.commentsByIssue.set(issueNumber, list);
    return { ...comment };
  }

  async updateIssueComment(commentId: number, body: string) {
    for (const comments of this.commentsByIssue.values()) {
      const match = comments.find((comment) => comment.id === commentId);
      if (!match) continue;
      match.body = body;
      match.updated_at = "2026-04-12T00:01:00.000Z";
      return { ...match };
    }
    throw new Error(`Comment ${commentId} not found`);
  }

  async updateProjectV2ItemStatus(issueNumber: number, stateName: string): Promise<string> {
    this.projectStatusUpdates.push({ issueNumber, stateName });
    return stateName;
  }

  getProjectStatusUpdates(): Array<{ issueNumber: number; stateName: string }> {
    return [...this.projectStatusUpdates];
  }

  updatedCommentBodies(): string[] {
    return [...this.commentsByIssue.values()].flat().map((comment) => comment.body);
  }

  lastCreatedIssue(): MutableIssue | undefined {
    return this.issues[this.issues.length - 1];
  }
}

const CONFIG: GithubBackendConfig = {
  token: "test-token",
  repoOwner: "kata-sh",
  repoName: "kata-mono",
  stateMode: "labels",
  labelPrefix: "kata:",
};

function makeBackend(client: FakeGithubClient, config: GithubBackendConfig = CONFIG): GithubBackend {
  return new GithubBackend("/tmp/kata-github-artifacts", config, client);
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

describe("GithubBackend canonical worker operations", () => {
  it("getIssue returns detail with optional child tasks and comments", async () => {
    const client = new FakeGithubClient([
      { number: 21, title: "[S01] Slice", state: "open", labels: ["kata:slice"], body: "slice plan" },
      { number: 22, title: "[T01] Task", state: "open", labels: ["kata:task"], body: "task plan" },
    ]);
    await client.addSubIssue(21, 22);
    client.seedComments(21, [{ id: 9001, body: "## Agent Workpad\n\nold" }]);

    const backend = makeBackend(client);
    const issue = await backend.getIssue("21", { includeChildren: true, includeComments: true });

    expect(issue?.identifier).toBe("#21");
    expect(issue?.children.map((child) => child.identifier)).toEqual(["#22"]);
    expect(issue?.comments.length).toBe(1);
    expect(issue?.comments[0]).toMatchObject({
      body: "## Agent Workpad\n\nold",
      marker: null,
    });

    const compact = await backend.getIssue("21", { includeChildren: false, includeComments: false });
    expect(compact?.children).toEqual([]);
    expect(compact?.comments).toEqual([]);
  });

  it("getIssue accepts scoped identifiers used in worker prompts", async () => {
    const client = new FakeGithubClient([
      { number: 29, title: "[S09] Slice", state: "open", labels: ["kata:slice"], body: "slice body" },
    ]);
    const backend = makeBackend(client);

    const bracketScoped = await backend.getIssue("[S09]#29", { includeChildren: false, includeComments: false });
    const repoScoped = await backend.getIssue("kata-sh/kata-mono#29", { includeChildren: false, includeComments: false });

    expect(bracketScoped?.identifier).toBe("#29");
    expect(repoScoped?.identifier).toBe("#29");
  });

  it("upsertComment updates marker comment in place", async () => {
    const client = new FakeGithubClient([
      { number: 30, title: "[S02] Slice", state: "open", labels: ["kata:slice"], body: "body" },
    ]);
    client.seedComments(30, [{ id: 77, body: "## Agent Workpad\n\nold" }]);

    const backend = makeBackend(client);
    await backend.upsertComment({
      issueId: "30",
      marker: "## Agent Workpad",
      body: "## Agent Workpad\n\nnew",
    });

    expect(client.updatedCommentBodies()).toContain("## Agent Workpad\n\nnew");
  });

  it("upsertComment does not match marker text embedded in unrelated prose", async () => {
    const client = new FakeGithubClient([
      { number: 31, title: "[S03] Slice", state: "open", labels: ["kata:slice"], body: "body" },
    ]);
    client.seedComments(31, [{ id: 78, body: "This note mentions ## Agent Workpad but is not the workpad." }]);

    const backend = makeBackend(client);
    const result = await backend.upsertComment({
      issueId: "31",
      marker: "## Agent Workpad",
      body: "## Agent Workpad\n\nnew",
    });

    expect(result.action).toBe("created");
    expect(client.updatedCommentBodies()).toContain("This note mentions ## Agent Workpad but is not the workpad.");
    expect(client.updatedCommentBodies()).toContain("## Agent Workpad\n\nnew");
  });

  it("createFollowupIssue creates issue and relation metadata", async () => {
    const client = new FakeGithubClient([
      { number: 40, title: "[T01] Parent", state: "open", labels: ["kata:task"], body: "parent" },
    ]);
    const backend = makeBackend(client);

    const followup = await backend.createFollowupIssue({
      title: "Follow-up: flaky test guard",
      description: "Track flaky guardrails",
      parentIssueId: "40",
      relationType: "blocked_by",
    });

    expect(followup.identifier).toMatch(/^#/);
    expect(client.lastCreatedIssue()?.title).toBe("Follow-up: flaky test guard");
    expect(client.lastCreatedIssue()?.labels).toEqual(["kata:backlog"]);
    expect(await client.listSubIssueNumbers(40)).toContain(Number(followup.id));
  });

  it("createFollowupIssue validates parent before creating an issue", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await expect(backend.createFollowupIssue({
      title: "Follow-up: flaky test guard",
      description: "Track flaky guardrails",
      parentIssueId: "404",
      relationType: "blocked_by",
    })).rejects.toThrow("Parent GitHub issue not found: 404");

    expect(client.lastCreatedIssue()).toBeUndefined();
  });

  it("createFollowupIssue does not coerce relates_to into a sub-issue link", async () => {
    const client = new FakeGithubClient([
      { number: 41, title: "[T02] Parent", state: "open", labels: ["kata:task"], body: "parent" },
    ]);
    const backend = makeBackend(client);

    const followup = await backend.createFollowupIssue({
      title: "Follow-up: note",
      description: "Track note",
      parentIssueId: "41",
      relationType: "relates_to",
    });

    expect(followup.parentIdentifier).toBe("#41");
    expect(await client.listSubIssueNumbers(41)).toEqual([]);
  });

  it("createFollowupIssue rejects relationType without parent", async () => {
    const backend = makeBackend(new FakeGithubClient());

    await expect(backend.createFollowupIssue({
      title: "Follow-up: guard",
      description: "desc",
      relationType: "relates_to",
    })).rejects.toThrow("parentIssueId is required when relationType is provided");
  });

  it("updateIssueState maps PR lifecycle phases to canonical labels", async () => {
    const client = new FakeGithubClient([
      { number: 51, title: "[S03] Review flow", state: "open", labels: ["kata:slice", "kata:in-progress"] },
    ]);
    const backend = makeBackend(client);

    const updated = await backend.updateIssueState("51", "human-review");

    expect(updated).toMatchObject({
      issueId: "51",
      phase: "human-review",
      state: "kata:human-review",
    });
    const issue = await client.getIssue(51);
    expect(issue?.state).toBe("open");
    expect(issue?.labels).toContain("kata:human-review");
    expect(issue?.labels).not.toContain("kata:in-progress");
  });

  it("updateIssueState accepts scoped identifiers used in worker prompts", async () => {
    const client = new FakeGithubClient([
      { number: 50, title: "[S03] Review flow", state: "open", labels: ["kata:slice", "kata:in-progress"] },
    ]);
    const backend = makeBackend(client);

    const updated = await backend.updateIssueState("[S03]#50", "human-review");

    expect(updated).toMatchObject({
      issueId: "50",
      phase: "human-review",
      state: "kata:human-review",
    });
    const issue = await client.getIssue(50);
    expect(issue?.labels).toContain("kata:human-review");
    expect(issue?.labels).not.toContain("kata:in-progress");
  });

  it("updateIssueState(done) closes issue and applies terminal label", async () => {
    const client = new FakeGithubClient([
      { number: 52, title: "[S04] Merge flow", state: "open", labels: ["kata:slice", "kata:merging"] },
    ]);
    const backend = makeBackend(client);

    const updated = await backend.updateIssueState("52", "done");

    expect(updated).toMatchObject({
      issueId: "52",
      phase: "done",
      state: "closed",
    });
    const issue = await client.getIssue(52);
    expect(issue?.state).toBe("closed");
    expect(issue?.labels).toContain("kata:done");
    expect(issue?.labels).not.toContain("kata:merging");
  });

  it("updateIssueState in projects_v2 mode updates project status and syncs canonical phase labels", async () => {
    const client = new FakeGithubClient([
      { number: 53, title: "[S05] Projects flow", state: "open", labels: ["kata:slice", "kata:in-progress"] },
    ]);
    const backend = makeBackend(client, {
      ...CONFIG,
      stateMode: "projects_v2",
      githubProjectNumber: 17,
    });

    const updated = await backend.updateIssueState("53", "agent-review");

    expect(updated).toMatchObject({
      issueId: "53",
      phase: "agent-review",
      state: "Agent Review",
    });
    expect(client.getProjectStatusUpdates()).toEqual([
      { issueNumber: 53, stateName: "Agent Review" },
    ]);

    const issue = await client.getIssue(53);
    expect(issue?.state).toBe("open");
    expect(issue?.labels).toContain("kata:slice");
    expect(issue?.labels).toContain("kata:agent-review");
    expect(issue?.labels).not.toContain("kata:in-progress");
  });

  it("isSlicePlanned falls back to metadata-linked tasks when no sub-issue links exist yet", async () => {
    const client = new FakeGithubClient([
      {
        number: 60,
        title: "[S07] Slice",
        state: "open",
        labels: ["kata:slice"],
        body: serializeGithubArtifactMetadata({
          schema: "kata/github-artifact/v1",
          kind: "slice",
          kataId: "S07",
          milestoneId: "M009",
        }),
      },
      {
        number: 61,
        title: "[T07] Task",
        state: "open",
        labels: ["kata:task"],
        body: serializeGithubArtifactMetadata({
          schema: "kata/github-artifact/v1",
          kind: "task",
          kataId: "T07",
          sliceId: "S07",
          milestoneId: "M009",
        }),
      },
    ]);
    const backend = makeBackend(client);

    await expect(backend.isSlicePlanned("M009", "S07")).resolves.toBe(true);
  });

  it("isSlicePlanned honors custom label prefixes in the legacy fallback", async () => {
    const client = new FakeGithubClient([
      {
        number: 62,
        title: "[S08] Slice",
        state: "open",
        labels: ["symphony:slice"],
        body: "slice body",
      },
      {
        number: 63,
        title: "[T08] Task",
        state: "open",
        labels: ["symphony:task", "symphony:slice:s08"],
        body: "task body",
      },
    ]);
    const backend = makeBackend(client, {
      ...CONFIG,
      labelPrefix: "symphony",
    });

    await expect(backend.isSlicePlanned("M009", "S08")).resolves.toBe(true);
  });
});

describe("GithubBackend artifact persistence", () => {
  it("surfaces milestone target dates from live artifact bodies", async () => {
    const client = new FakeGithubClient([
      {
        number: 10,
        title: "[M901] Live mutation test",
        state: "open",
        labels: ["kata:milestone"],
        body: `<!-- KATA:GITHUB_ARTIFACT {"schema":"kata/github-artifact/v1","kind":"milestone","kataId":"M901"} -->\n\nScratch milestone\n\nTarget date: 2026-04-30`,
        updatedAt: "2026-04-17T22:58:07Z",
      },
    ]);
    const backend = makeBackend(client);

    const milestones = await backend.listMilestones();
    expect(milestones).toEqual([
      expect.objectContaining({
        id: "10",
        name: "[M901] Live mutation test",
        targetDate: "2026-04-30",
        updatedAt: "2026-04-17T22:58:07Z",
      }),
    ]);
  });

  it("createMilestone preserves existing plain body text when optional fields are omitted on update", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.createMilestone({
      kataId: "M111",
      title: "First title",
      description: "Keep this description",
    });

    await backend.createMilestone({
      kataId: "M111",
      title: "Renamed milestone",
    });

    const milestone = client.findIssueByKataId("M111");
    expect(milestone?.title).toBe("[M111] Renamed milestone");
    expect(milestone?.body).toContain("Keep this description");
  });

  it("surfaces slice milestone ids in issue inventory", async () => {
    const client = new FakeGithubClient([
      {
        number: 11,
        title: "[S91] Live mutation slice",
        state: "open",
        labels: ["kata:slice"],
        body: `<!-- KATA:GITHUB_ARTIFACT {"schema":"kata/github-artifact/v1","kind":"slice","kataId":"S91","milestoneId":"M901"} -->\n\nSlice body`,
        updatedAt: "2026-04-17T22:59:54Z",
      },
    ]);
    const backend = makeBackend(client);

    const slices = await backend.listSlices();
    expect(slices).toEqual([
      expect.objectContaining({
        id: "11",
        identifier: "#11",
        milestoneName: "M901",
        updatedAt: "2026-04-17T22:59:54Z",
      }),
    ]);
  });

  it("listTasks includes parent issue identifier and updatedAt", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);
    const scope = await backend.resolveSliceScope("M009", "S02");
    expect(scope).toEqual({ issueId: expect.any(String) });
    await backend.writeDocument("S02-PLAN", SLICE_PLAN, scope);

    const tasks = await backend.listTasks(String(scope!.issueId));
    expect(tasks).toEqual([
      expect.objectContaining({
        identifier: "#4",
        parentIdentifier: String(scope!.issueId),
        updatedAt: "2026-04-12T00:00:00.000Z",
      }),
      expect.objectContaining({
        identifier: "#5",
        parentIdentifier: String(scope!.issueId),
        updatedAt: "2026-04-12T00:00:00.000Z",
      }),
    ]);
  });

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

  it("lists milestone slices via roadmap fallback when slice issues lack milestone metadata", async () => {
    const client = new FakeGithubClient();
    const backend = makeBackend(client);

    await backend.writeDocument("M009-ROADMAP", ROADMAP);

    const s01 = client.findIssueByKataId("S01");
    const s02 = client.findIssueByKataId("S02");
    expect(s01).toBeTruthy();
    expect(s02).toBeTruthy();

    await client.updateIssue(s01!.number, { body: "# S01\n\nLegacy body without metadata" });
    await client.updateIssue(s02!.number, { body: "# S02\n\nLegacy body without metadata" });

    const slices = await backend.listSlices({ milestoneId: "M009" });
    expect(slices.map((slice) => slice.identifier)).toEqual([`#${s01!.number}`, `#${s02!.number}`]);
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

  it("treats legacy plain-body artifacts as planned when task content still points at the slice", async () => {
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

    expect(await backend.isSlicePlanned("M001", "S01")).toBe(true);
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
