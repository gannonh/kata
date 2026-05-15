import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { SYMPHONY_PROGRESS_FRAMES, withSymphonyLoader, withSymphonyProgress } from "./progress.ts";

const borderedLoaderMocks = vi.hoisted(() => ({
  constructorCalls: [] as Array<{ tui: unknown; theme: unknown; message: string; options: unknown }>,
  instances: [] as Array<{ signal: AbortSignal; onAbort: (() => void) | undefined; abort: () => void }>,
  signals: [] as AbortSignal[],
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
  BorderedLoader: class MockBorderedLoader {
    readonly controller: AbortController;
    readonly signal: AbortSignal;
    onAbort: (() => void) | undefined;

    constructor(tui: unknown, theme: unknown, message: string, options?: unknown) {
      this.controller = new AbortController();
      this.signal = this.controller.signal;
      borderedLoaderMocks.constructorCalls.push({ tui, theme, message, options });
      borderedLoaderMocks.instances.push(this);
      borderedLoaderMocks.signals.push(this.signal);
    }

    abort() {
      this.controller.abort();
      this.onAbort?.();
    }
  },
}));

function commandContext() {
  let resolveCustom: ((value: unknown) => void) | undefined;
  const setWorkingIndicator = vi.fn();
  const setWorkingMessage = vi.fn();
  const setStatus = vi.fn();
  const custom = vi.fn(async (factory: Parameters<ExtensionCommandContext["ui"]["custom"]>[0]) => {
    const resultPromise = new Promise((resolve) => {
      resolveCustom = resolve;
    });
    await factory(
      {} as Parameters<typeof factory>[0],
      {} as Parameters<typeof factory>[1],
      {} as Parameters<typeof factory>[2],
      (result: unknown) => {
        resolveCustom?.(result);
      },
    );
    return resultPromise;
  });

  const ctx = {
    ui: { setWorkingIndicator, setWorkingMessage, setStatus, custom },
  } as unknown as ExtensionCommandContext;

  return { ctx, setWorkingIndicator, setWorkingMessage, setStatus, custom };
}

describe("withSymphonyProgress", () => {
  it("sets indicator, message, and status, then restores after success", async () => {
    const { ctx, setWorkingIndicator, setWorkingMessage, setStatus } = commandContext();
    const restoreStatus = vi.fn();

    const result = await withSymphonyProgress(ctx, { message: "Starting Symphony...", restoreStatus }, async () => "started");

    expect(result).toBe("started");
    expect(SYMPHONY_PROGRESS_FRAMES).toEqual(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
    expect(setWorkingIndicator).toHaveBeenNthCalledWith(1, { frames: SYMPHONY_PROGRESS_FRAMES, intervalMs: 120 });
    expect(setWorkingMessage).toHaveBeenNthCalledWith(1, "Starting Symphony...");
    expect(setStatus).toHaveBeenCalledWith("symphony", "Starting Symphony...");
    expect(setWorkingIndicator).toHaveBeenNthCalledWith(2);
    expect(setWorkingMessage).toHaveBeenNthCalledWith(2);
    expect(restoreStatus).toHaveBeenCalledWith(ctx);
    expect(setWorkingMessage.mock.invocationCallOrder[1]).toBeLessThan(restoreStatus.mock.invocationCallOrder[0]);
  });

  it("restores indicator, message, and status after failure", async () => {
    const { ctx, setWorkingIndicator, setWorkingMessage } = commandContext();
    const restoreStatus = vi.fn();

    await expect(
      withSymphonyProgress(ctx, { message: "Refreshing Symphony...", restoreStatus }, async () => {
        throw new Error("refresh failed");
      }),
    ).rejects.toThrow("refresh failed");

    expect(setWorkingIndicator).toHaveBeenNthCalledWith(2);
    expect(setWorkingMessage).toHaveBeenNthCalledWith(2);
    expect(restoreStatus).toHaveBeenCalledWith(ctx);
  });
});

describe("withSymphonyLoader", () => {
  it("shows a bordered loader, passes its AbortSignal, restores status, and returns the operation result", async () => {
    borderedLoaderMocks.constructorCalls.length = 0;
    borderedLoaderMocks.instances.length = 0;
    borderedLoaderMocks.signals.length = 0;
    const { ctx, setStatus, custom } = commandContext();
    const restoreStatus = vi.fn();
    const operation = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBe(borderedLoaderMocks.signals[0]);
      return "attached";
    });

    const result = await withSymphonyLoader(ctx, { message: "Attaching Symphony...", restoreStatus }, operation);

    expect(result).toBe("attached");
    expect(setStatus).toHaveBeenCalledWith("symphony", "Attaching Symphony...");
    expect(custom).toHaveBeenCalledOnce();
    expect(borderedLoaderMocks.constructorCalls).toHaveLength(1);
    expect(borderedLoaderMocks.constructorCalls[0]?.message).toBe("Attaching Symphony...");
    expect(operation).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(restoreStatus).toHaveBeenCalledWith(ctx);
  });

  it("closes the custom loader promptly when cancelled", async () => {
    borderedLoaderMocks.constructorCalls.length = 0;
    borderedLoaderMocks.instances.length = 0;
    borderedLoaderMocks.signals.length = 0;
    const { ctx } = commandContext();
    const restoreStatus = vi.fn();
    const operation = vi.fn(() => new Promise<string>(() => {}));

    const resultPromise = withSymphonyLoader(ctx, { message: "Cancelling Symphony...", restoreStatus }, operation);

    await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
    const loader = borderedLoaderMocks.instances[0];
    expect(loader).toBeDefined();

    loader?.abort();

    await expect(resultPromise).resolves.toBeUndefined();
    expect(operation).toHaveBeenCalledWith(loader?.signal);
    expect(loader?.signal.aborted).toBe(true);
    expect(restoreStatus).toHaveBeenCalledWith(ctx);
  });

  it("restores status and propagates loader operation failures", async () => {
    borderedLoaderMocks.constructorCalls.length = 0;
    borderedLoaderMocks.instances.length = 0;
    borderedLoaderMocks.signals.length = 0;
    const { ctx } = commandContext();
    const restoreStatus = vi.fn();

    await expect(
      withSymphonyLoader(ctx, { message: "Stopping Symphony...", restoreStatus }, async () => {
        throw new Error("stop failed");
      }),
    ).rejects.toThrow("stop failed");

    expect(restoreStatus).toHaveBeenCalledWith(ctx);
  });
});
