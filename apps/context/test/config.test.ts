import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { DEFAULT_CONFIG, DEFAULT_EXCLUDES } from "../src/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("loadConfig", () => {
  it("returns defaults when no config file exists", () => {
    const config = loadConfig("/nonexistent/path");
    expect(config.languages).toEqual([]);
    expect(config.excludes).toEqual([...DEFAULT_EXCLUDES]);
    expect(config.summaryThreshold).toBe(5);
    expect(config.watch).toBe(false);
    expect(config.providers.openai.model).toBe("text-embedding-3-small");
    expect(config.providers.anthropic.model).toBe("claude-sonnet-4-20250514");
  });

  it("returns a fresh copy (not the same object reference)", () => {
    const a = loadConfig("/nonexistent/path");
    const b = loadConfig("/nonexistent/path");
    expect(a).not.toBe(b);
    expect(a.excludes).not.toBe(b.excludes);
  });

  it("merges user config with defaults", () => {
    const config = loadConfig(join(FIXTURES, "config-project"));
    expect(config.languages).toEqual(["typescript"]);
    expect(config.excludes).toEqual(["node_modules", ".git", "vendor"]);
    expect(config.summaryThreshold).toBe(10);
    expect(config.watch).toBe(true);
    // Provider defaults preserved since user didn't override
    expect(config.providers.openai.model).toBe("text-embedding-3-small");
  });

  it("returns defaults when .kata subdir is missing", () => {
    // Pass a directory that exists but whose config.json is not valid JSON
    // We'll test this by creating a scenario — for now, test that
    // a directory with no .kata subdir works (same as no config)
    const config = loadConfig(FIXTURES);
    expect(config).toEqual(DEFAULT_CONFIG);
  });
});
