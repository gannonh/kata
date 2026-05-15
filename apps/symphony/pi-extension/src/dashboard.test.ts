import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { openDashboard, SymphonyDashboardComponent } from "./dashboard.ts";
import type { SymphonyRuntime } from "./runtime.ts";
import { createDefaultState } from "./state.ts";

describe("SymphonyDashboardComponent", () => {
  it("renders Slice 1 health fields", () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.ownedProcess = { pid: 123, command: "symphony --no-tui", cwd: "/repo", baseUrl: state.attachedBaseUrl, startedAt: "2026-05-14T00:00:00Z" };
    state.lastKnownState = {
      baseUrl: state.attachedBaseUrl,
      trackerProjectUrl: "https://github.com/gannonh/kata/projects/1",
      runningCount: 2,
      retryCount: 1,
      blockedCount: 0,
      completedCount: 4,
      pollingChecking: false,
      nextPollInMs: 5000,
      updatedAt: "2026-05-14T00:00:01Z",
    };

    const dashboard = new SymphonyDashboardComponent({
      state,
      refresh: async () => undefined,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    const output = dashboard.render(120).join("\n");
    expect(output).toContain("Symphony Dashboard");
    expect(output).toContain("http://127.0.0.1:8080");
    expect(output).toContain("project: https://github.com/gannonh/kata/projects/1");
    expect(output).toContain("running: 2");
    expect(output).toContain("retry: 1");
    expect(output).toContain("owned process: pid 123");
  });

  it("closes on q", () => {
    const close = vi.fn();
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      refresh: async () => undefined,
      close,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    dashboard.handleInput("q");
    expect(close).toHaveBeenCalledOnce();
  });

  it("ignores refresh input while a refresh is already running", async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshDone = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const refresh = vi.fn(() => refreshDone);
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      refresh,
      close: () => undefined,
      requestRender: () => undefined,
      notify: () => undefined,
    });

    dashboard.handleInput("r");
    dashboard.handleInput("r");

    expect(refresh).toHaveBeenCalledOnce();
    resolveRefresh?.();
    await refreshDone;
  });

  it("notifies when a refresh fails", async () => {
    let resolveNotified: (() => void) | undefined;
    const notified = new Promise<void>((resolve) => {
      resolveNotified = resolve;
    });
    const notify = vi.fn((_message: string, _level: "info" | "warning" | "error") => {
      resolveNotified?.();
    });
    const dashboard = new SymphonyDashboardComponent({
      state: createDefaultState(),
      refresh: async () => {
        throw new Error("refresh failed");
      },
      close: () => undefined,
      requestRender: () => undefined,
      notify,
    });

    dashboard.handleInput("r");
    await notified;

    expect(notify).toHaveBeenCalledWith("refresh failed", "error");
  });
});

describe("openDashboard", () => {
  it("notifies and still opens when launch refresh fails", async () => {
    const state = createDefaultState();
    state.attachedBaseUrl = "http://127.0.0.1:8080";
    state.lastKnownState = {
      baseUrl: state.attachedBaseUrl,
      trackerProjectUrl: "https://github.com/gannonh/kata/projects/1",
      runningCount: 1,
      retryCount: 0,
      blockedCount: 0,
      completedCount: 2,
      pollingChecking: false,
      nextPollInMs: 1000,
      updatedAt: "2026-05-14T00:00:01Z",
    };

    type CustomFactory = Parameters<ExtensionContext["ui"]["custom"]>[0];
    const requestRender = vi.fn();
    const notify = vi.fn();
    const custom = vi.fn(async (factory: CustomFactory): Promise<void> => {
      const component = await factory(
        { requestRender } as unknown as Parameters<CustomFactory>[0],
        {} as Parameters<CustomFactory>[1],
        {} as Parameters<CustomFactory>[2],
        (() => undefined) as Parameters<CustomFactory>[3],
      );

      expect(component.render(120).join("\n")).toContain("running: 1");
    });
    const ctx = { ui: { notify, custom } } as unknown as ExtensionContext;
    const runtime = {
      client: {},
      state,
      refreshState: vi.fn(async () => {
        throw new Error("launch refresh failed");
      }),
      errorText: vi.fn((error: unknown) => (error instanceof Error ? `formatted: ${error.message}` : String(error))),
    } as unknown as SymphonyRuntime;

    await openDashboard(ctx, runtime);

    expect(notify).toHaveBeenCalledWith("formatted: launch refresh failed", "error");
    expect(custom).toHaveBeenCalledOnce();
  });
});
