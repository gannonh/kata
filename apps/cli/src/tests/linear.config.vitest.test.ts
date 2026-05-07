import { describe, expect, it } from "vitest";

import readTrackerConfig from "../backends/read-tracker-config.js";
import { DEFAULT_LINEAR_STATE_NAMES, resolveLinearAuthToken } from "../backends/linear/config.js";

describe("Linear tracker config", () => {
  it("parses complete Linear preferences", async () => {
    await expect(
      readTrackerConfig({
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
    in_progress: Started
    done: Complete
  labels:
    slice: kata/slice
---`,
      }),
    ).resolves.toEqual({
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
      labels: {
        slice: "kata/slice",
      },
    });
  });

  it("uses default Linear state names when preferences omit states", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  team: KATA
  project: kata-cli
---`,
      }),
    ).resolves.toMatchObject({
      kind: "linear",
      states: DEFAULT_LINEAR_STATE_NAMES,
    });
  });

  it("requires workspace, team, and project for Linear mode", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: linear
linear:
  team: KATA
  project: kata-cli
---`,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: "linear.workspace is required",
    });

    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  project: kata-cli
---`,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: "linear.team is required",
    });

    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  team: KATA
---`,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: "linear.project is required",
    });
  });

  it("rejects blank Linear state names", async () => {
    await expect(
      readTrackerConfig({
        preferencesContent: `---
workflow:
  mode: linear
linear:
  workspace: kata
  team: KATA
  project: kata-cli
  states:
    done: " "
---`,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONFIG",
      message: "linear.states.done is required",
    });
  });

  it("prefers configured authEnv over LINEAR_API_KEY and LINEAR_TOKEN", () => {
    expect(
      resolveLinearAuthToken({
        authEnv: "CUSTOM_LINEAR_TOKEN",
        env: {
          CUSTOM_LINEAR_TOKEN: " custom-token ",
          LINEAR_API_KEY: "api-token",
          LINEAR_TOKEN: "linear-token",
        },
      }),
    ).toBe("custom-token");
  });

  it("falls back to LINEAR_API_KEY when authEnv is absent", () => {
    expect(
      resolveLinearAuthToken({
        env: {
          LINEAR_API_KEY: " api-token ",
          LINEAR_TOKEN: "linear-token",
        },
      }),
    ).toBe("api-token");
  });

  it("falls back to LINEAR_TOKEN when LINEAR_API_KEY is blank", () => {
    expect(
      resolveLinearAuthToken({
        env: {
          LINEAR_API_KEY: " ",
          LINEAR_TOKEN: " linear-token ",
        },
      }),
    ).toBe("linear-token");
  });
});
