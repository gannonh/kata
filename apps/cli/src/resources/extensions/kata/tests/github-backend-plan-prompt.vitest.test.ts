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
  });

  it("plan slice prompt requires deterministic dependency readback and task upserts", async () => {
    const backend = new GithubBackend("/tmp/github-prompt", CONFIG, NOOP_CLIENT);
    const prompt = await backend.buildPrompt("planning", makeState({ phase: "planning" }));

    expect(prompt).toContain("S02-PLAN");
    expect(prompt).toMatch(/existing task issues/i);
    expect(prompt).toMatch(/dependency readback/i);
    expect(prompt).toMatch(/stable IDs/i);
  });
});
