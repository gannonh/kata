import { describe, expect, it } from "vitest";

import { GithubBackend, type GithubBackendClient, type GithubBackendConfig } from "../github-backend.js";
import type { KataState } from "../types.js";

const CONFIG: GithubBackendConfig = {
  token: "token",
  repoOwner: "kata-sh",
  repoName: "kata-mono",
  stateMode: "labels",
  labelPrefix: "kata:",
};

const NOOP_CLIENT: GithubBackendClient = {
  async listIssues() {
    return [];
  },
  async getIssue() {
    return null;
  },
  async createIssue() {
    throw new Error("not expected");
  },
  async updateIssue() {
    throw new Error("not expected");
  },
  async listSubIssueNumbers() {
    return [];
  },
  async addSubIssue() {
    throw new Error("not expected");
  },
};

function makeState(overrides: Partial<KataState> = {}): KataState {
  return {
    activeMilestone: { id: "M009", title: "GitHub backend parity" },
    activeSlice: { id: "S02", title: "GitHub planning artifacts" },
    activeTask: null,
    phase: "planning",
    blockers: [],
    recentDecisions: [],
    nextAction: "Plan S02",
    registry: [{ id: "M009", title: "GitHub backend parity", status: "active" }],
    ...overrides,
  };
}

describe("GithubBackend planning prompts", () => {
  it("plan milestone prompt requires GitHub artifact upsert and dependency materialization", async () => {
    const backend = new GithubBackend("/tmp/github-prompt", CONFIG, NOOP_CLIENT);
    const prompt = await backend.buildPrompt("pre-planning", makeState({ phase: "pre-planning", activeSlice: null }));

    expect(prompt).toContain("KATA:GITHUB_ARTIFACT");
    expect(prompt).toMatch(/Idempotency check/i);
    expect(prompt).toMatch(/depends:\[/i);
    expect(prompt).toMatch(/dependency metadata/i);
    expect(prompt).toMatch(/never use `linear_\*` tools/i);
    expect(prompt).toMatch(/Use backend-aware `kata_\*` tools as the primary write path/i);
    expect(prompt).toMatch(/Never read local `\.kata\/\*\.md` planning files/i);
  });

  it("plan slice prompt requires deterministic dependency readback and task upserts", async () => {
    const backend = new GithubBackend("/tmp/github-prompt", CONFIG, NOOP_CLIENT);
    const prompt = await backend.buildPrompt("planning", makeState({ phase: "planning" }));

    expect(prompt).toContain("S02-PLAN");
    expect(prompt).toMatch(/existing task issues/i);
    expect(prompt).toMatch(/dependency readback/i);
    expect(prompt).toMatch(/stable IDs/i);
    expect(prompt).toMatch(/Do not read\/write local `\.kata\/\*\.md` planning files/i);
    expect(prompt).toMatch(/Link every task to the slice via real GitHub sub-issue relationships/i);
  });

  it("discuss prompt uses the shared discuss template with GitHub-specific backend guidance", () => {
    const backend = new GithubBackend("/tmp/github-prompt", CONFIG, NOOP_CLIENT);
    const prompt = backend.buildDiscussPrompt("M010", "Discuss planning for M010.");

    expect(prompt).toContain('Say exactly: "What would you like to build?"');
    expect(prompt).toMatch(/GitHub mode discussion is enabled/i);
    expect(prompt).toContain("KATA:GITHUB_ARTIFACT");
    expect(prompt).toMatch(/Do not read or write local `\.kata\/\*\.md` planning artifacts/i);
    expect(prompt).toMatch(/Do not use `linear_\*` tools in GitHub mode/i);
    expect(prompt).toMatch(/Milestone M010 ready\./i);
  });
});
