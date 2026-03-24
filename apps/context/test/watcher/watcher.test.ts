/**
 * Watcher contract tests — S04/T01
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWatcher } from "../../src/watcher/index.js";
import { loadConfig } from "../../src/config.js";
import type { WatcherEvent } from "../../src/watcher/types.js";

describe("Watcher", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kata-watcher-test-"));
    // Create .kata/index dir so it's a valid project root
    mkdirSync(join(tmpDir, ".kata", "index"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("createWatcher returns a Watcher interface", () => {
    const config = loadConfig(tmpDir);
    const watcher = createWatcher(tmpDir, config);
    expect(watcher).toBeDefined();
    expect(typeof watcher.start).toBe("function");
    expect(typeof watcher.stop).toBe("function");
    expect(typeof watcher.on).toBe("function");
  });

  it("emits start event on start()", async () => {
    const config = loadConfig(tmpDir);
    const watcher = createWatcher(tmpDir, config, { debounceMs: 50 });
    const events: WatcherEvent[] = [];
    watcher.on((e) => events.push(e));

    await watcher.start();
    await watcher.stop();

    expect(events.some((e) => e.type === "start")).toBe(true);
  });

  it("stops cleanly without errors", async () => {
    const config = loadConfig(tmpDir);
    const watcher = createWatcher(tmpDir, config, { debounceMs: 50 });
    await watcher.start();
    await watcher.stop();
    // No error thrown = pass
  });

  it("debounces rapid changes", async () => {
    const config = loadConfig(tmpDir);
    const watcher = createWatcher(tmpDir, config, { debounceMs: 100 });
    const events: WatcherEvent[] = [];
    watcher.on((e) => events.push(e));

    await watcher.start();

    // Simulate rapid file changes
    const testFile = join(tmpDir, "test.ts");
    writeFileSync(testFile, "const a = 1;");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(testFile, "const a = 2;");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(testFile, "const a = 3;");

    // Wait for debounce + processing
    await new Promise((r) => setTimeout(r, 500));
    await watcher.stop();

    // Should have coalesced into a small number of change events
    const changeEvents = events.filter((e) => e.type === "change");
    expect(changeEvents.length).toBeLessThanOrEqual(2);
  });

  it("ignores .kata/ path changes", async () => {
    const config = loadConfig(tmpDir);
    const watcher = createWatcher(tmpDir, config, { debounceMs: 50 });
    const events: WatcherEvent[] = [];
    watcher.on((e) => events.push(e));

    await watcher.start();

    // Write to .kata/index — should be ignored
    writeFileSync(join(tmpDir, ".kata", "index", "test.db"), "data");
    await new Promise((r) => setTimeout(r, 200));

    await watcher.stop();

    const changeEvents = events.filter((e) => e.type === "change");
    // Normalize to forward slashes for cross-platform compatibility
    const hasKataPath = changeEvents.some((e) =>
      e.files?.some((f) => f.replace(/\\/g, "/").includes(".kata/")),
    );
    expect(hasKataPath).toBe(false);
  });

  it("event has correct shape", async () => {
    const config = loadConfig(tmpDir);
    const watcher = createWatcher(tmpDir, config, { debounceMs: 50 });
    const events: WatcherEvent[] = [];
    watcher.on((e) => events.push(e));

    await watcher.start();
    await watcher.stop();

    const startEvent = events.find((e) => e.type === "start");
    expect(startEvent).toBeDefined();
    expect(startEvent!.timestamp).toBeDefined();
    expect(typeof startEvent!.timestamp).toBe("string");
  });
});
