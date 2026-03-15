/**
 * Tests for output formatters.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  outputJson,
  outputQuiet,
  formatHeader,
  formatKeyValue,
  formatTable,
  output,
  type OutputOptions,
} from "../src/formatters.js";

// ── Capture stdout ──

let logOutput: string[];

beforeEach(() => {
  logOutput = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logOutput.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── outputJson ──

describe("outputJson", () => {
  it("writes pretty-printed JSON to stdout", () => {
    outputJson({ foo: "bar", count: 42 });
    expect(logOutput).toHaveLength(1);
    const parsed = JSON.parse(logOutput[0]!);
    expect(parsed).toEqual({ foo: "bar", count: 42 });
  });

  it("handles arrays", () => {
    outputJson([1, 2, 3]);
    const parsed = JSON.parse(logOutput[0]!);
    expect(parsed).toEqual([1, 2, 3]);
  });

  it("handles null", () => {
    outputJson(null);
    expect(logOutput[0]).toBe("null");
  });

  it("produces valid JSON for nested objects", () => {
    const data = { a: { b: { c: [1, 2] } } };
    outputJson(data);
    expect(JSON.parse(logOutput[0]!)).toEqual(data);
  });
});

// ── outputQuiet ──

describe("outputQuiet", () => {
  it("writes one line per item", () => {
    outputQuiet(["foo", "bar", "baz"]);
    expect(logOutput).toEqual(["foo", "bar", "baz"]);
  });

  it("writes nothing for empty array", () => {
    outputQuiet([]);
    expect(logOutput).toEqual([]);
  });
});

// ── formatHeader ──

describe("formatHeader", () => {
  it("creates a header with underline", () => {
    const result = formatHeader("Status");
    expect(result).toContain("Status");
    expect(result).toContain("──────");
  });

  it("underline matches header length", () => {
    const result = formatHeader("Test");
    const lines = result.split("\n").filter(Boolean);
    expect(lines[1]!.length).toBe(lines[0]!.length);
  });
});

// ── formatKeyValue ──

describe("formatKeyValue", () => {
  it("aligns keys to the longest", () => {
    const result = formatKeyValue([
      ["Short", "1"],
      ["Longer key", "2"],
    ]);
    const lines = result.split("\n");
    // Both lines should have the same key column width
    expect(lines[0]!).toMatch(/^\s+Short\s+1$/);
    expect(lines[1]!).toMatch(/^\s+Longer key\s+2$/);
  });

  it("handles numeric values", () => {
    const result = formatKeyValue([["Count", 42]]);
    expect(result).toContain("42");
  });

  it("returns empty string for empty pairs", () => {
    expect(formatKeyValue([])).toBe("");
  });
});

// ── formatTable ──

describe("formatTable", () => {
  it("formats headers and rows with separator", () => {
    const result = formatTable(
      ["Name", "Kind"],
      [
        ["foo", "function"],
        ["Bar", "class"],
      ],
    );
    expect(result).toContain("Name");
    expect(result).toContain("Kind");
    expect(result).toContain("foo");
    expect(result).toContain("function");
    expect(result).toContain("Bar");
    expect(result).toContain("class");
    // Should have a separator line
    expect(result).toContain("─");
  });

  it("shows '(no results)' for empty rows", () => {
    const result = formatTable(["Name"], []);
    expect(result).toContain("(no results)");
  });

  it("auto-sizes columns to fit data", () => {
    const result = formatTable(
      ["A", "B"],
      [["longvalue", "x"]],
    );
    // "longvalue" is longer than header "A", column should be wide enough
    expect(result).toContain("longvalue");
  });
});

// ── output dispatcher ──

describe("output", () => {
  it("uses JSON mode when json=true", () => {
    const opts: OutputOptions = { json: true, quiet: false };
    output({ x: 1 }, ["line"], () => "human", opts);
    expect(logOutput).toHaveLength(1);
    expect(JSON.parse(logOutput[0]!)).toEqual({ x: 1 });
  });

  it("uses quiet mode when quiet=true", () => {
    const opts: OutputOptions = { json: false, quiet: true };
    output({ x: 1 }, ["line1", "line2"], () => "human", opts);
    expect(logOutput).toEqual(["line1", "line2"]);
  });

  it("uses human mode by default", () => {
    const opts: OutputOptions = { json: false, quiet: false };
    output({ x: 1 }, ["line"], () => "human output", opts);
    expect(logOutput).toEqual(["human output"]);
  });

  it("json takes precedence over quiet", () => {
    const opts: OutputOptions = { json: true, quiet: true };
    output({ x: 1 }, ["line"], () => "human", opts);
    expect(logOutput).toHaveLength(1);
    expect(JSON.parse(logOutput[0]!)).toEqual({ x: 1 });
  });
});
