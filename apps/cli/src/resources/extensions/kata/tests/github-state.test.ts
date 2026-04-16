import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveGithubState,
  type GithubIssueSummary,
  type GithubStateClient,
} from "../github-state.ts";

function makeClient(issues: GithubIssueSummary[]): GithubStateClient {
  return {
    async listIssues() {
      return issues;
    },
  };
}

test("deriveGithubState returns pre-planning when no milestone issues exist", async () => {
  const state = await deriveGithubState(makeClient([]), {
    repoOwner: "kata-sh",
    repoName: "kata-mono",
    stateMode: "labels",
    labelPrefix: "kata:",
  });

  assert.equal(state.phase, "pre-planning");
  assert.equal(state.activeMilestone, null);
  assert.equal(state.registry.length, 0);
  assert.deepEqual(state.progress?.milestones, { done: 0, total: 0 });
});

test("deriveGithubState derives active milestone/slice/task and executing phase", async () => {
  const issues: GithubIssueSummary[] = [
    {
      number: 10,
      title: "[M009] GitHub backend parity",
      state: "open",
      labels: ["kata:milestone"],
    },
    {
      number: 11,
      title: "[S01] CLI bootstrap",
      state: "open",
      labels: ["kata:slice", "kata:executing"],
    },
    {
      number: 12,
      title: "[T04] Wire status diagnostics",
      state: "open",
      labels: ["kata:task"],
      body: "Implements active slice S01",
    },
  ];

  const state = await deriveGithubState(makeClient(issues), {
    repoOwner: "kata-sh",
    repoName: "kata-mono",
    stateMode: "labels",
    labelPrefix: "kata:",
  });

  assert.equal(state.phase, "executing");
  assert.equal(state.activeMilestone?.id, "M009");
  assert.equal(state.activeSlice?.id, "S01");
  assert.equal(state.activeTask?.id, "T04");
  assert.equal(state.activeTask?.trackerIssueId, "12");
  assert.equal(state.activeTask?.linearIssueId, undefined);
  assert.equal(state.registry[0]?.status, "active");
  assert.deepEqual(state.progress?.tasks, { done: 0, total: 1 });
});

test("deriveGithubState falls back to verifying when some tasks are closed", async () => {
  const issues: GithubIssueSummary[] = [
    {
      number: 20,
      title: "[M010] Follow-up",
      state: "open",
      labels: ["kata:milestone"],
    },
    {
      number: 21,
      title: "[S02] Add integrations",
      state: "open",
      labels: ["kata:slice"],
    },
    {
      number: 22,
      title: "[T01] First task",
      state: "closed",
      labels: ["kata:task"],
      body: "Completed work for S02",
    },
    {
      number: 23,
      title: "[T02] Second task",
      state: "open",
      labels: ["kata:task"],
      body: "Remaining work for S02",
    },
  ];

  const state = await deriveGithubState(makeClient(issues), {
    repoOwner: "kata-sh",
    repoName: "kata-mono",
    stateMode: "labels",
    labelPrefix: "kata:",
  });

  assert.equal(state.phase, "verifying");
  assert.equal(state.activeTask?.id, "T02");
  assert.deepEqual(state.progress?.tasks, { done: 1, total: 2 });
});

test("deriveGithubState marks workflow complete when all milestones are closed", async () => {
  const issues: GithubIssueSummary[] = [
    {
      number: 30,
      title: "[M001] Foundation",
      state: "closed",
      labels: ["kata:milestone"],
    },
    {
      number: 31,
      title: "[M002] Follow-up",
      state: "closed",
      labels: ["kata:milestone"],
    },
  ];

  const state = await deriveGithubState(makeClient(issues), {
    repoOwner: "kata-sh",
    repoName: "kata-mono",
    stateMode: "labels",
    labelPrefix: "kata:",
  });

  assert.equal(state.phase, "complete");
  assert.equal(state.activeMilestone, null);
  assert.equal(state.progress?.milestones.done, 2);
  assert.equal(state.progress?.milestones.total, 2);
});
