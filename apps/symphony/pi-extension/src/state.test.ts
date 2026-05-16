import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, restoreStateFromEntries, STATE_ENTRY_TYPE } from "./state.ts";

const ownedProcess = {
  pid: 123,
  command: "symphony",
  cwd: "/repo",
  baseUrl: "http://127.0.0.1:8080",
  startedAt: "2026-05-14T00:00:00.000Z",
};

const lastKnownState = {
  baseUrl: "http://127.0.0.1:8080",
  trackerProjectUrl: "https://github.com/gannonh/kata/issues",
  runningCount: 1,
  retryCount: 2,
  blockedCount: 3,
  completedCount: 4,
  pollingChecking: false,
  nextPollInMs: 5000,
  updatedAt: "2026-05-14T00:00:01.000Z",
};

describe("extension state persistence", () => {
  it("restores the latest snapshot and clears stale optional fields", () => {
    const state = restoreStateFromEntries([
      {
        type: "custom",
        customType: STATE_ENTRY_TYPE,
        data: {
          binaryPath: "/usr/local/bin/symphony",
          attachedBaseUrl: "http://127.0.0.1:8080",
          ownedProcess,
          console: { showDetails: true },
          stopOwnedOnShutdown: false,
          lastKnownState,
        },
      },
      {
        type: "custom",
        customType: STATE_ENTRY_TYPE,
        data: {
          binaryPath: "/opt/symphony",
          console: { showDetails: false },
          stopOwnedOnShutdown: true,
          lastKnownState: {
            baseUrl: "http://127.0.0.1:9090",
            runningCount: 0,
            retryCount: 0,
            blockedCount: 0,
            completedCount: 1,
            pollingChecking: true,
            nextPollInMs: 1000,
            updatedAt: "2026-05-14T00:00:02.000Z",
          },
        },
      },
    ]);

    expect(state).toEqual({
      binaryPath: "/opt/symphony",
      console: { showDetails: false },
      stopOwnedOnShutdown: true,
      lastKnownState: {
        baseUrl: "http://127.0.0.1:9090",
        runningCount: 0,
        retryCount: 0,
        blockedCount: 0,
        completedCount: 1,
        pollingChecking: true,
        nextPollInMs: 1000,
        updatedAt: "2026-05-14T00:00:02.000Z",
      },
    });
  });

  it("migrates legacy dashboard details state to console details state", () => {
    const state = restoreStateFromEntries([
      {
        type: "custom",
        customType: STATE_ENTRY_TYPE,
        data: {
          dashboard: { showDetails: false },
        },
      },
    ]);

    expect(state.console.showDetails).toBe(false);
  });

  it("ignores invalid nested persisted data", () => {
    const invalidPids = ["123", 0, -1, 1.5];

    for (const pid of invalidPids) {
      const state = restoreStateFromEntries([
        {
          type: "custom",
          customType: STATE_ENTRY_TYPE,
          data: {
            ownedProcess,
            lastKnownState,
          },
        },
        {
          type: "custom",
          customType: STATE_ENTRY_TYPE,
          data: {
            ownedProcess: { ...ownedProcess, pid },
            console: { showDetails: true },
            stopOwnedOnShutdown: false,
            lastKnownState: { ...lastKnownState, runningCount: "1" },
          },
        },
      ]);

      expect(state).toEqual({
        console: { showDetails: true },
        stopOwnedOnShutdown: false,
      });
    }
  });

  it("canonicalizes restored base URLs before storing them", () => {
    const state = restoreStateFromEntries([
      {
        type: "custom",
        customType: STATE_ENTRY_TYPE,
        data: {
          attachedBaseUrl: " HTTP://LOCALHOST:8080/api///?debug=true#panel ",
          ownedProcess: { ...ownedProcess, baseUrl: "http://127.0.0.1:8080///?debug=true#panel" },
          lastKnownState: { ...lastKnownState, baseUrl: "http://127.0.0.1:8080///?debug=true#panel" },
        },
      },
    ]);

    expect(state.attachedBaseUrl).toBe("http://localhost:8080/api");
    expect(state.ownedProcess?.baseUrl).toBe("http://127.0.0.1:8080");
    expect(state.lastKnownState?.baseUrl).toBe("http://127.0.0.1:8080");
  });

  it("ignores persisted base URLs with non-http protocols", () => {
    const state = restoreStateFromEntries([
      {
        type: "custom",
        customType: STATE_ENTRY_TYPE,
        data: {
          attachedBaseUrl: "file:///tmp/symphony.sock",
          ownedProcess: { ...ownedProcess, baseUrl: "data:text/plain,symphony" },
          console: { showDetails: true },
          stopOwnedOnShutdown: false,
          lastKnownState: { ...lastKnownState, baseUrl: "ws://127.0.0.1:8080" },
        },
      },
    ]);

    expect(state).toEqual({
      console: { showDetails: true },
      stopOwnedOnShutdown: false,
    });
  });
});

describe("normalizeBaseUrl", () => {
  it("normalizes http and https URLs", () => {
    expect(normalizeBaseUrl(" http://127.0.0.1:8080/ ")).toBe("http://127.0.0.1:8080");
    expect(normalizeBaseUrl("https://example.com/api///?debug=true#panel")).toBe("https://example.com/api");
  });

  it("rejects non-http base URLs", () => {
    expect(() => normalizeBaseUrl("file:///tmp/symphony.sock")).toThrow("URL must use http or https");
    expect(() => normalizeBaseUrl("data:text/plain,symphony")).toThrow("URL must use http or https");
  });
});
