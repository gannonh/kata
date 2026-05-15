import type { AgentToolUpdateCallback, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerSymphonyTools } from "./tools.ts";
import { SymphonyRuntime } from "./runtime.ts";
import type { LastKnownSymphonyState } from "./state.ts";

type RegisteredTool = {
  name: string;
  executionMode?: string;
  execute: (id: string, params: Record<string, unknown>, signal: AbortSignal, update: AgentToolUpdateCallback | undefined, ctx: ExtensionContext) => Promise<unknown>;
};

function toolContext() {
  const setStatus = vi.fn();
  const ctx = {
    cwd: "/repo",
    hasUI: true,
    ui: { setStatus },
  } as unknown as ExtensionContext;
  return { ctx, setStatus };
}

function registerTools(runtime: SymphonyRuntime) {
  const tools = new Map<string, RegisteredTool>();
  const appendEntry = vi.fn();
  const pi = {
    registerTool: (tool: RegisteredTool) => tools.set(tool.name, tool),
    appendEntry,
  } as unknown as ExtensionAPI;

  registerSymphonyTools(pi, runtime);

  return { tools, appendEntry };
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

function progressUpdate(text: string) {
  return {
    content: [{ type: "text", text }],
    details: { status: "working" },
  };
}

describe("symphony tools", () => {
  it("registers every Symphony tool for sequential execution", () => {
    const runtime = new SymphonyRuntime();
    const { tools } = registerTools(runtime);

    expect([...tools.keys()].sort()).toEqual([
      "symphony_attach",
      "symphony_doctor",
      "symphony_help",
      "symphony_init",
      "symphony_refresh",
      "symphony_start",
      "symphony_status",
      "symphony_steer",
      "symphony_stop",
    ]);
    expect([...tools.values()].every((tool) => tool.executionMode === "sequential")).toBe(true);
  });

  it("requests a manual refresh from the tool", async () => {
    const events: string[] = [];
    const runtime = new SymphonyRuntime();
    runtime.requestRefresh = vi.fn(async () => {
      events.push("requestRefresh");
      runtime.state.lastKnownState = lastKnownState("http://127.0.0.1:8080");
      return {} as Awaited<ReturnType<SymphonyRuntime["requestRefresh"]>>;
    }) as SymphonyRuntime["requestRefresh"];
    const { tools, appendEntry } = registerTools(runtime);
    const refresh = tools.get("symphony_refresh");
    if (!refresh) throw new Error("expected refresh tool");
    const update = vi.fn(() => events.push("update"));

    const result = await refresh.execute("1", {}, new AbortController().signal, update, toolContext().ctx);

    expect(update).toHaveBeenCalledWith(progressUpdate("Refreshing Symphony..."));
    expect(events).toEqual(["update", "requestRefresh"]);
    expect(runtime.requestRefresh).toHaveBeenCalledOnce();
    expect(appendEntry).toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "Symphony refresh requested" }],
      details: { state: runtime.state.lastKnownState },
    });
  });

  it("sends a steer instruction from the tool", async () => {
    const events: string[] = [];
    const runtime = new SymphonyRuntime();
    runtime.steerWorker = vi.fn(async () => {
      events.push("steerWorker");
      return { ok: true, issueId: "issue-123", issueIdentifier: "SIM-123", delivered: true, instructionPreview: "Use auth" };
    }) as SymphonyRuntime["steerWorker"];
    const { tools, appendEntry } = registerTools(runtime);
    const steer = tools.get("symphony_steer");
    if (!steer) throw new Error("expected steer tool");
    const update = vi.fn(() => events.push("update"));

    const result = await steer.execute("1", { issueIdentifier: "SIM-123", instruction: "Use auth" }, new AbortController().signal, update, toolContext().ctx);

    expect(update).toHaveBeenCalledWith(progressUpdate("Sending steer instruction..."));
    expect(events).toEqual(["update", "steerWorker"]);
    expect(runtime.steerWorker).toHaveBeenCalledWith("SIM-123", "Use auth", expect.any(AbortSignal));
    expect(appendEntry).toHaveBeenCalled();
    expect(result).toMatchObject({
      content: [{ type: "text", text: "Steer delivered to SIM-123: Use auth" }],
      details: { result: expect.objectContaining({ issueIdentifier: "SIM-123" }) },
    });
  });

  it("restricts tool attach URLs to loopback hosts before attaching", async () => {
    const runtime = new SymphonyRuntime();
    runtime.attach = vi.fn(async (baseUrl: string) => {
      runtime.state.attachedBaseUrl = baseUrl;
      runtime.state.lastKnownState = lastKnownState(baseUrl);
      return {};
    }) as unknown as SymphonyRuntime["attach"];

    const { tools } = registerTools(runtime);
    const attach = tools.get("symphony_attach");
    if (!attach) throw new Error("expected attach tool");
    const { ctx, setStatus } = toolContext();
    const signal = new AbortController().signal;

    await expect(attach.execute("1", { url: "http://example.com:8080" }, signal, undefined, ctx)).rejects.toThrow("loopback host");
    expect(runtime.attach).not.toHaveBeenCalled();

    await attach.execute("2", { url: "http://localhost:8080" }, signal, undefined, ctx);

    expect(runtime.attach).toHaveBeenCalledWith("http://localhost:8080", signal);
    expect(setStatus).toHaveBeenCalledWith("symphony", "symphony http://localhost:8080");
  });

  it("clears an active owned attachment and updates status after tool stop", async () => {
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

    const { tools, appendEntry } = registerTools(runtime);
    const stop = tools.get("symphony_stop");
    if (!stop) throw new Error("expected stop tool");
    const { ctx, setStatus } = toolContext();

    await stop.execute("1", {}, new AbortController().signal, undefined, ctx);

    expect(runtime.state.attachedBaseUrl).toBeUndefined();
    expect(runtime.client).toBeUndefined();
    expect(runtime.state.lastKnownState).toBeUndefined();
    expect(appendEntry).toHaveBeenCalledWith(
      "symphony-extension-state",
      expect.objectContaining({ attachedBaseUrl: undefined, ownedProcess: undefined, lastKnownState: undefined }),
    );
    expect(setStatus).toHaveBeenCalledWith("symphony", "symphony detached");
  });
});
