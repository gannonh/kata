import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { SymphonyRuntime } from "./runtime.ts";
import { STATE_ENTRY_TYPE, type LastKnownSymphonyState } from "./state.ts";

function contextWithEntries(entries: unknown[]): ExtensionContext {
  return {
    sessionManager: {
      getEntries: () => entries,
    },
  } as unknown as ExtensionContext;
}

function lastKnownState(baseUrl: string): LastKnownSymphonyState {
  return {
    baseUrl,
    runningCount: 1,
    retryCount: 0,
    blockedCount: 0,
    completedCount: 2,
    pollingChecking: false,
    nextPollInMs: 1000,
    updatedAt: "2026-05-14T00:00:01.000Z",
  };
}

describe("SymphonyRuntime", () => {
  it("clears the active attachment and last known state", () => {
    const runtime = new SymphonyRuntime();
    const baseUrl = "http://127.0.0.1:8080";
    runtime.state.attachedBaseUrl = baseUrl;
    runtime.state.lastKnownState = lastKnownState(baseUrl);
    runtime.client = {} as SymphonyRuntime["client"];

    expect(runtime.clearAttachmentIfBaseUrl("http://127.0.0.1:8081")).toBe(false);
    expect(runtime.state.attachedBaseUrl).toBe(baseUrl);

    expect(runtime.clearAttachmentIfBaseUrl(baseUrl)).toBe(true);
    expect(runtime.state.attachedBaseUrl).toBeUndefined();
    expect(runtime.state.lastKnownState).toBeUndefined();
    expect(runtime.client).toBeUndefined();
  });

  it("keeps restored state shared with the process manager", async () => {
    const runtime = new SymphonyRuntime();

    runtime.restore(
      contextWithEntries([
        {
          type: "custom",
          customType: STATE_ENTRY_TYPE,
          data: {
            attachedBaseUrl: "http://127.0.0.1:8080",
            ownedProcess: {
              pid: 123,
              command: "symphony --no-tui",
              cwd: "/repo",
              baseUrl: "http://127.0.0.1:8080",
              startedAt: "2026-05-14T00:00:00.000Z",
            },
          },
        },
      ]),
    );

    expect(runtime.state.ownedProcess?.pid).toBe(123);

    await expect(runtime.processManager.stopOwned()).rejects.toMatchObject({ kind: "not_owned" });
    expect(runtime.state.ownedProcess).toBeUndefined();
  });
});
