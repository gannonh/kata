import { describe, expect, it } from "vitest";

import { deriveGithubState, type GithubIssueSummary, type GithubStateClient } from "../github-state.js";
import { serializeGithubArtifactMetadata } from "../github-artifacts.js";

function makeClient(issues: GithubIssueSummary[]): GithubStateClient {
  return {
    async listIssues() {
      return issues;
    },
  };
}

function withMetadata(issue: GithubIssueSummary, marker: string): GithubIssueSummary {
  return {
    ...issue,
    body: `${marker}\n\n${issue.body ?? ""}`,
  };
}

describe("GitHub planning contract", () => {
  it("derives task-to-slice linkage from metadata deterministically", async () => {
    const milestoneMarker = serializeGithubArtifactMetadata({
      schema: "kata/github-artifact/v1",
      kind: "milestone",
      kataId: "M009",
    });

    const sliceMarker = serializeGithubArtifactMetadata({
      schema: "kata/github-artifact/v1",
      kind: "slice",
      kataId: "S02",
      milestoneId: "M009",
      dependsOn: ["S01"],
    });

    const taskMarker = serializeGithubArtifactMetadata({
      schema: "kata/github-artifact/v1",
      kind: "task",
      kataId: "T01",
      milestoneId: "M009",
      sliceId: "S02",
    });

    const issues: GithubIssueSummary[] = [
      withMetadata(
        {
          number: 10,
          title: "[M009] GitHub Backend Parity",
          state: "open",
          labels: ["kata:milestone"],
          body: "",
        },
        milestoneMarker,
      ),
      withMetadata(
        {
          number: 11,
          title: "[S02] Plan authoring",
          state: "open",
          labels: ["kata:slice", "kata:planning"],
          body: "",
        },
        sliceMarker,
      ),
      withMetadata(
        {
          number: 12,
          title: "[T01] Persist roadmap artifacts",
          state: "open",
          labels: ["kata:task"],
          body: "does not mention S02 in plain text",
        },
        taskMarker,
      ),
    ];

    const state = await deriveGithubState(makeClient(issues), {
      repoOwner: "kata-sh",
      repoName: "kata-mono",
      stateMode: "labels",
      labelPrefix: "kata:",
    });

    expect(state.activeMilestone?.id).toBe("M009");
    expect(state.activeSlice?.id).toBe("S02");
    expect(state.activeTask?.id).toBe("T01");
    expect(state.phase).toBe("planning");
  });

  it("does not guess an active slice when milestone linkage metadata is absent", async () => {
    const issues: GithubIssueSummary[] = [
      {
        number: 20,
        title: "[M010] Follow-up",
        state: "open",
        labels: ["kata:milestone"],
      },
      {
        number: 21,
        title: "[S01] Slice one",
        state: "open",
        labels: ["kata:slice", "kata:executing"],
      },
    ];

    const state = await deriveGithubState(makeClient(issues), {
      repoOwner: "kata-sh",
      repoName: "kata-mono",
      stateMode: "labels",
      labelPrefix: "kata:",
    });

    expect(state.activeMilestone?.id).toBe("M010");
    expect(state.activeSlice).toBeNull();
    expect(state.phase).toBe("pre-planning");
  });
});
