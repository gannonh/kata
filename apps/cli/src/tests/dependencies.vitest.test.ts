import { describe, expect, it } from "vitest";

import {
  formatSliceDependencyIdsForTextField,
  normalizeSliceDependencyId,
  parseSliceDependencyIds,
} from "../domain/dependencies.js";

describe("slice dependency helpers", () => {
  it("normalizes explicit slice identifiers", () => {
    expect(normalizeSliceDependencyId("S001")).toBe("S001");
    expect(normalizeSliceDependencyId("s001")).toBe("S001");
    expect(normalizeSliceDependencyId("[S001]")).toBe("S001");
    expect(normalizeSliceDependencyId("[S001] Some title")).toBe("S001");
    expect(normalizeSliceDependencyId("S1")).toBe("S001");
  });

  it("returns null for empty and malformed dependency identifiers", () => {
    expect(normalizeSliceDependencyId("")).toBeNull();
    expect(normalizeSliceDependencyId("   ")).toBeNull();
    expect(normalizeSliceDependencyId("M001")).toBeNull();
    expect(normalizeSliceDependencyId("T001")).toBeNull();
    expect(normalizeSliceDependencyId("S00A")).toBeNull();
  });

  it("parses empty dependency values", () => {
    expect(parseSliceDependencyIds(undefined)).toEqual([]);
    expect(parseSliceDependencyIds(null)).toEqual([]);
    expect(parseSliceDependencyIds("")).toEqual([]);
    expect(parseSliceDependencyIds("  \n  ")).toEqual([]);
    expect(parseSliceDependencyIds([])).toEqual([]);
  });

  it("parses single dependency values", () => {
    expect(parseSliceDependencyIds("S001")).toEqual(["S001"]);
    expect(parseSliceDependencyIds("[s001] First slice")).toEqual(["S001"]);
    expect(parseSliceDependencyIds(["[S002]"])).toEqual(["S002"]);
  });

  it("parses comma and newline separated dependency values", () => {
    expect(parseSliceDependencyIds("S001, S002\n[S003]")).toEqual(["S001", "S002", "S003"]);
  });

  it("deduplicates dependencies while preserving first occurrence order", () => {
    expect(parseSliceDependencyIds("S001, s001\n[S002]\nS001")).toEqual(["S001", "S002"]);
  });

  it("ignores malformed dependency values without slice identifiers", () => {
    expect(parseSliceDependencyIds("M001, issue #1, task T001, []")).toEqual([]);
    expect(parseSliceDependencyIds(["S00A", 1, { id: "S001" }])).toEqual([]);
  });

  it("formats dependencies for GitHub Project text fields", () => {
    expect(formatSliceDependencyIdsForTextField(["s002", "[S001] First slice", "S002", "bad"])).toBe("S002\nS001");
    expect(formatSliceDependencyIdsForTextField([])).toBe("");
  });
});
