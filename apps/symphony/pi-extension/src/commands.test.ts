import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerSymphonyCommands, setSymphonyStatus } from "./commands.ts";
import { SymphonyRuntime } from "./runtime.ts";
import { type LastKnownSymphonyState } from "./state.ts";

type CommandOptions = Parameters<ExtensionAPI["registerCommand"]>[1];

function commandContext() {
  const notify = vi.fn();
  const setStatus = vi.fn();
  const ctx = {
    ui: { notify, setStatus },
    cwd: "/repo",
    hasUI: false,
  } as unknown as ExtensionCommandContext;

  return { ctx, notify, setStatus };
}

function registerCommands(runtime: SymphonyRuntime) {
  const commands = new Map<string, CommandOptions>();
  const appendEntry = vi.fn();
  const pi = {
    registerCommand: (name: string, options: CommandOptions) => commands.set(name, options),
    appendEntry,
  } as unknown as ExtensionAPI;

  registerSymphonyCommands(pi, runtime);

  return { commands, appendEntry };
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

describe("setSymphonyStatus", () => {
  it("uses the runtime attachment state", () => {
    const runtime = new SymphonyRuntime();
    const { ctx, setStatus } = commandContext();

    setSymphonyStatus(ctx, runtime);
    runtime.state.attachedBaseUrl = "http://127.0.0.1:8080";
    setSymphonyStatus(ctx, runtime);

    expect(setStatus).toHaveBeenNthCalledWith(1, "symphony", "symphony detached");
    expect(setStatus).toHaveBeenNthCalledWith(2, "symphony", "symphony http://127.0.0.1:8080");
  });
});

describe("symphony commands", () => {
  it("requests a manual refresh from the command", async () => {
    const runtime = new SymphonyRuntime();
    runtime.state.attachedBaseUrl = "http://127.0.0.1:8080";
    runtime.requestRefresh = vi.fn(async () => {
      runtime.state.lastKnownState = lastKnownState("http://127.0.0.1:8080");
      return {} as Awaited<ReturnType<SymphonyRuntime["requestRefresh"]>>;
    }) as SymphonyRuntime["requestRefresh"];

    const { commands, appendEntry } = registerCommands(runtime);
    const { ctx, notify } = commandContext();
    const refresh = commands.get("symphony:refresh");
    if (!refresh) throw new Error("expected refresh command");

    await refresh.handler("", ctx);

    expect(runtime.requestRefresh).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalledWith("symphony-extension-state", expect.objectContaining({ lastKnownState: runtime.state.lastKnownState }));
    expect(notify).toHaveBeenCalledWith("Symphony refresh requested; running 1, retry 0, blocked 0, completed 2", "info");
  });

  it("sends a steer instruction from the command", async () => {
    const runtime = new SymphonyRuntime();
    runtime.steerWorker = vi.fn(async () => ({ ok: true, issueId: "issue-123", issueIdentifier: "SIM-123", delivered: true, instructionPreview: "Use auth" })) as SymphonyRuntime["steerWorker"];

    const { commands, appendEntry } = registerCommands(runtime);
    const { ctx, notify } = commandContext();
    const steer = commands.get("symphony:steer");
    if (!steer) throw new Error("expected steer command");

    await steer.handler("SIM-123 Use auth", ctx);

    expect(runtime.steerWorker).toHaveBeenCalledWith("SIM-123", "Use auth");
    expect(appendEntry).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Steer delivered to SIM-123: Use auth", "info");
  });

  it("restricts command attach URLs to loopback hosts before attaching", async () => {
    const runtime = new SymphonyRuntime();
    runtime.attach = vi.fn(async (baseUrl: string) => {
      runtime.state.attachedBaseUrl = baseUrl;
      runtime.state.lastKnownState = lastKnownState(baseUrl);
      return {};
    }) as unknown as SymphonyRuntime["attach"];

    const { commands, appendEntry } = registerCommands(runtime);
    const { ctx, notify, setStatus } = commandContext();
    const attach = commands.get("symphony:attach");
    if (!attach) throw new Error("expected attach command");

    await attach.handler("http://example.com:8080", ctx);

    expect(runtime.attach).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("loopback host"), "error");

    await attach.handler("http://localhost:8080", ctx);

    expect(runtime.attach).toHaveBeenCalledWith("http://localhost:8080");
    expect(appendEntry).toHaveBeenCalledWith(
      "symphony-extension-state",
      expect.objectContaining({ attachedBaseUrl: "http://localhost:8080" }),
    );
    expect(setStatus).toHaveBeenCalledWith("symphony", "symphony http://localhost:8080");
    expect(notify).toHaveBeenCalledWith("Attached to Symphony at http://localhost:8080", "info");
  });

  it("clears an owned attachment and updates status after stop", async () => {
    const baseUrl = "http://127.0.0.1:8080";
    const runtime = new SymphonyRuntime();
    runtime.state.attachedBaseUrl = baseUrl;
    runtime.state.ownedProcess = {
      pid: 123,
      command: "symphony --no-tui",
      cwd: "/repo",
      baseUrl,
      startedAt: "2026-05-14T00:00:00.000Z",
    };
    runtime.state.lastKnownState = lastKnownState(baseUrl);
    runtime.client = {} as SymphonyRuntime["client"];
    runtime.processManager = {
      stopOwned: vi.fn(async () => {
        runtime.state.ownedProcess = undefined;
      }),
    } as unknown as SymphonyRuntime["processManager"];

    const { commands, appendEntry } = registerCommands(runtime);
    const { ctx, notify, setStatus } = commandContext();
    const stop = commands.get("symphony:stop");
    if (!stop) throw new Error("expected stop command");

    await stop.handler("", ctx);

    expect(runtime.processManager.stopOwned).toHaveBeenCalledOnce();
    expect(runtime.state.attachedBaseUrl).toBeUndefined();
    expect(runtime.client).toBeUndefined();
    expect(runtime.state.lastKnownState).toBeUndefined();
    expect(appendEntry).toHaveBeenCalledWith(
      "symphony-extension-state",
      expect.objectContaining({
        attachedBaseUrl: undefined,
        ownedProcess: undefined,
        lastKnownState: undefined,
      }),
    );
    expect(setStatus).toHaveBeenCalledWith("symphony", "symphony detached");
    expect(notify).toHaveBeenCalledWith("Stopped owned Symphony process", "info");
  });

  it("keeps an external attachment when stopping a different owned server", async () => {
    const runtime = new SymphonyRuntime();
    runtime.state.attachedBaseUrl = "http://127.0.0.1:8081";
    runtime.state.ownedProcess = {
      pid: 123,
      command: "symphony --no-tui",
      cwd: "/repo",
      baseUrl: "http://127.0.0.1:8080",
      startedAt: "2026-05-14T00:00:00.000Z",
    };
    runtime.state.lastKnownState = lastKnownState(runtime.state.attachedBaseUrl);
    runtime.processManager = {
      stopOwned: vi.fn(async () => {
        runtime.state.ownedProcess = undefined;
      }),
    } as unknown as SymphonyRuntime["processManager"];

    const { commands } = registerCommands(runtime);
    const { ctx, setStatus } = commandContext();
    const stop = commands.get("symphony:stop");
    if (!stop) throw new Error("expected stop command");

    await stop.handler("", ctx);

    expect(runtime.state.attachedBaseUrl).toBe("http://127.0.0.1:8081");
    expect(runtime.state.lastKnownState).toEqual(lastKnownState("http://127.0.0.1:8081"));
    expect(setStatus).toHaveBeenCalledWith("symphony", "symphony http://127.0.0.1:8081");
  });
});
