import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { SymphonyRuntime } from "./runtime.ts";
import { STATE_ENTRY_TYPE } from "./state.ts";

function contextWithEntries(entries: unknown[]): ExtensionContext {
  return {
    sessionManager: {
      getEntries: () => entries,
    },
  } as unknown as ExtensionContext;
}

describe("SymphonyRuntime", () => {
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
