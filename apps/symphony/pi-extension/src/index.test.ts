import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => unknown;
  const instances: Array<{
    state: {
      stopOwnedOnShutdown: boolean;
      ownedProcess?: { baseUrl?: string };
    };
    processManager: { shutdown: ReturnType<typeof vi.fn> };
    restore: ReturnType<typeof vi.fn>;
    clearAttachmentIfBaseUrl: ReturnType<typeof vi.fn>;
    persist: ReturnType<typeof vi.fn>;
  }> = [];

  const SymphonyRuntime = vi.fn(function SymphonyRuntimeMock() {
    const runtime = {
      state: { stopOwnedOnShutdown: true },
      processManager: { shutdown: vi.fn(async () => undefined) },
      restore: vi.fn(),
      clearAttachmentIfBaseUrl: vi.fn(),
      persist: vi.fn(),
    };
    instances.push(runtime);
    return runtime;
  });

  return {
    instances,
    SymphonyRuntime,
    registerSymphonyCommands: vi.fn(),
    registerSymphonyTools: vi.fn(),
    setSymphonyStatus: vi.fn(),
    handlers: new Map<string, Handler>(),
  };
});

vi.mock("./runtime.ts", () => ({ SymphonyRuntime: mocks.SymphonyRuntime }));
vi.mock("./commands.ts", () => ({
  registerSymphonyCommands: mocks.registerSymphonyCommands,
  setSymphonyStatus: mocks.setSymphonyStatus,
}));
vi.mock("./tools.ts", () => ({ registerSymphonyTools: mocks.registerSymphonyTools }));

import symphonyExtension from "./index.ts";

function extensionApi(): ExtensionAPI {
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(event, handler);
    }),
    appendEntry: vi.fn(),
  } as unknown as ExtensionAPI;
}

beforeEach(() => {
  mocks.instances.length = 0;
  mocks.handlers.clear();
  mocks.SymphonyRuntime.mockClear();
  mocks.registerSymphonyCommands.mockClear();
  mocks.registerSymphonyTools.mockClear();
  mocks.setSymphonyStatus.mockClear();
});

describe("symphony extension lifecycle", () => {
  it("cleans and persists owned attachment state when shutdown fails", async () => {
    const pi = extensionApi();
    symphonyExtension(pi);
    const runtime = mocks.instances[0];
    const shutdownError = new Error("shutdown failed");
    runtime.state.ownedProcess = { baseUrl: "http://127.0.0.1:8080" };
    runtime.processManager.shutdown.mockRejectedValueOnce(shutdownError);

    await expect(mocks.handlers.get("session_shutdown")!()).rejects.toThrow(shutdownError);

    expect(runtime.clearAttachmentIfBaseUrl).toHaveBeenCalledWith("http://127.0.0.1:8080");
    expect(runtime.persist).toHaveBeenCalledWith(pi);
  });
});
