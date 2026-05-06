import { describe, expect, it } from "vitest";

import { readTrackerConfig } from "../backends/read-tracker-config.js";
import { DEFAULT_LINEAR_STATE_NAMES, resolveLinearAuthToken } from "../backends/linear/config.js";

describe("Linear tracker config", () => {
  it("parses complete Linear preferences", async () => {
    const config = await readTrackerConfig({
      preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  team: KATA
  project: kata-cli
  authEnv: LINEAR_TOKEN
  activeMilestoneId: milestone-123
  states:
    backlog: Backlog
    todo: Todo
    in_progress: Started
    agent_review: Agent Review
    human_review: Human Review
    merging: Merging
    done: Complete
  labels:
    slice: kata/slice
---
`,
    });

    expect(config).toEqual({
      kind: "linear",
      workspace: "kata",
      team: "KATA",
      project: "kata-cli",
      authEnv: "LINEAR_TOKEN",
      activeMilestoneId: "milestone-123",
      states: {
        ...DEFAULT_LINEAR_STATE_NAMES,
        in_progress: "Started",
        done: "Complete",
      },
      labels: { slice: "kata/slice" },
    });
  });

  it("uses default Linear state names when preferences omit states", async () => {
    const config = await readTrackerConfig({
      preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  team: KATA
  project: kata-cli
---
`,
    });

    expect(config).toMatchObject({
      kind: "linear",
      workspace: "kata",
      team: "KATA",
      project: "kata-cli",
      states: DEFAULT_LINEAR_STATE_NAMES,
    });
  });

  it("requires workspace, team, and project for Linear mode", async () => {
    await expect(readTrackerConfig({
      preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  team: KATA
---
`,
    })).rejects.toMatchObject({ code: "INVALID_CONFIG", message: "linear.project is required" });
  });

  it("rejects blank Linear state names", async () => {
    await expect(readTrackerConfig({
      preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  team: KATA
  project: kata-cli
  states:
    done: ""
---
`,
    })).rejects.toMatchObject({ code: "INVALID_CONFIG", message: "linear.states.done is required" });
  });

  it("resolves Linear auth from the configured env var first", () => {
    expect(resolveLinearAuthToken({
      authEnv: "KATA_LINEAR_TOKEN",
      env: {
        KATA_LINEAR_TOKEN: "lin_configured",
        LINEAR_API_KEY: "lin_api_key",
        LINEAR_TOKEN: "lin_token",
      },
    })).toBe("lin_configured");
  });

  it("resolves Linear auth from default env vars", () => {
    expect(resolveLinearAuthToken({ env: { LINEAR_API_KEY: "", LINEAR_TOKEN: "lin_token" } })).toBe("lin_token");
  });

  it("fails when configured auth env var is missing", () => {
    expect(() => resolveLinearAuthToken({ authEnv: "KATA_LINEAR_TOKEN", env: { LINEAR_API_KEY: "lin_api" } })).toThrow(
      "Linear auth env var KATA_LINEAR_TOKEN is configured but not set.",
    );
  });
});
