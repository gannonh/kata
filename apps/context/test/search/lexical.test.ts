import { join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { grepSearch } from "../../src/search/lexical.js";
import { GrepNotFoundError } from "../../src/types.js";

const FIXTURES_TS = join(import.meta.dirname, "../fixtures/relationships/ts");
const FIXTURES_MIXED = join(import.meta.dirname, "../fixtures/mixed");

describe("grepSearch", () => {
  // ── Basic pattern matching ──

  it("finds matches for a simple pattern", async () => {
    const results = await grepSearch("import", FIXTURES_TS);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.lineContent).toContain("import");
      expect(r.matchText).toBe("import");
      expect(r.lineNumber).toBeGreaterThan(0);
      expect(r.columnNumber).toBeGreaterThanOrEqual(0);
      expect(r.filePath).toBeTruthy();
    }
  });

  it("returns file paths relative to rootPath", async () => {
    const results = await grepSearch("import", FIXTURES_TS);
    for (const r of results) {
      expect(r.filePath).not.toContain(FIXTURES_TS);
      // Should be like "service.ts", "consumer.ts", etc.
      expect(r.filePath).toMatch(/\.ts$/);
    }
  });

  it("finds regex patterns", async () => {
    const results = await grepSearch("class\\s+\\w+Service", FIXTURES_TS);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.matchText).toMatch(/class\s+\w+Service/);
    }
  });

  it("returns correct column numbers", async () => {
    const results = await grepSearch("BaseService", FIXTURES_TS);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      // Column should point to the start of "BaseService" in the line
      expect(r.lineContent.substring(r.columnNumber, r.columnNumber + r.matchText.length)).toBe(r.matchText);
    }
  });

  // ── No matches ──

  it("returns empty array when no matches found", async () => {
    const results = await grepSearch(
      "xyzzy_this_will_never_match_anything_9999",
      FIXTURES_TS
    );
    expect(results).toEqual([]);
  });

  // ── Case sensitivity ──

  it("is case sensitive by default", async () => {
    const sensitive = await grepSearch("IMPORT", FIXTURES_TS);
    // "IMPORT" (uppercase) should not match "import" (lowercase)
    expect(sensitive.length).toBe(0);
  });

  it("supports case insensitive search", async () => {
    const results = await grepSearch("IMPORT", FIXTURES_TS, {
      caseSensitive: false,
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.lineContent.toLowerCase()).toContain("import");
    }
  });

  // ── Glob filtering ──

  it("filters by glob pattern", async () => {
    const results = await grepSearch("import", FIXTURES_TS, {
      globs: ["service.ts"],
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.filePath).toBe("service.ts");
    }
  });

  it("supports multiple globs", async () => {
    const results = await grepSearch("import", FIXTURES_TS, {
      globs: ["service.ts", "consumer.ts"],
    });
    expect(results.length).toBeGreaterThan(0);
    const files = new Set(results.map((r) => r.filePath));
    // Should only have files matching the globs
    for (const f of files) {
      expect(["service.ts", "consumer.ts"]).toContain(f);
    }
  });

  it("returns empty when glob matches no files", async () => {
    const results = await grepSearch("import", FIXTURES_TS, {
      globs: ["*.xyz"],
    });
    expect(results).toEqual([]);
  });

  // ── Context lines ──

  it("includes context lines when requested", async () => {
    const results = await grepSearch("BaseService", FIXTURES_TS, {
      contextLines: 2,
      globs: ["service.ts"],
    });
    expect(results.length).toBeGreaterThan(0);
    // At least one result should have context
    const hasContext = results.some(
      (r) => r.contextBefore.length > 0 || r.contextAfter.length > 0
    );
    expect(hasContext).toBe(true);
  });

  it("returns empty context arrays when no context requested", async () => {
    const results = await grepSearch("BaseService", FIXTURES_TS, {
      globs: ["service.ts"],
    });
    for (const r of results) {
      expect(r.contextBefore).toEqual([]);
      expect(r.contextAfter).toEqual([]);
    }
  });

  // ── maxResults ──

  it("limits results with maxResults", async () => {
    const allResults = await grepSearch("import", FIXTURES_TS);
    const limited = await grepSearch("import", FIXTURES_TS, {
      maxResults: 1,
    });
    // maxResults is per-file, so limited may have more than 1 if multiple files match.
    // But each file should have at most 1 match.
    const matchesPerFile = new Map<string, number>();
    for (const r of limited) {
      matchesPerFile.set(
        r.filePath,
        (matchesPerFile.get(r.filePath) ?? 0) + 1
      );
    }
    for (const count of matchesPerFile.values()) {
      expect(count).toBeLessThanOrEqual(1);
    }
    // The limited set should be smaller (or equal if all files have ≤1 match)
    expect(limited.length).toBeLessThanOrEqual(allResults.length);
  });

  // ── File type filter ──

  it("filters by file type", async () => {
    const results = await grepSearch("import", FIXTURES_MIXED, {
      fileType: "ts",
    });
    for (const r of results) {
      expect(r.filePath).toMatch(/\.ts$/);
    }
  });

  // ── Error handling ──

  it("throws on invalid regex pattern", async () => {
    await expect(grepSearch("[invalid", FIXTURES_TS)).rejects.toThrow();
  });

  // ── Empty directory ──

  it("returns empty for empty directory", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "grep-test-"));
    try {
      const results = await grepSearch("anything", emptyDir);
      expect(results).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true });
    }
  });

  // ── Binary files ──

  it("skips binary files", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "grep-binary-"));
    try {
      // Create a binary file with some text
      const binaryContent = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) binaryContent[i] = i;
      writeFileSync(join(tmpDir, "binary.bin"), binaryContent);
      // Create a text file
      writeFileSync(join(tmpDir, "text.txt"), "hello world\n");

      const results = await grepSearch("hello", tmpDir);
      expect(results.length).toBe(1);
      expect(results[0].filePath).toBe("text.txt");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  // ── Multiple matches on same line ──

  it("handles multiple matches on the same line", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "grep-multi-"));
    try {
      writeFileSync(join(tmpDir, "test.txt"), "foo bar foo baz foo\n");
      const results = await grepSearch("foo", tmpDir);
      // rg returns one match entry per line (with multiple submatches),
      // but our parser takes the first submatch
      expect(results.length).toBe(1);
      expect(results[0].matchText).toBe("foo");
      expect(results[0].lineContent).toBe("foo bar foo baz foo");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  // ── Subdirectory search ──

  it("searches subdirectories", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "grep-subdir-"));
    try {
      mkdirSync(join(tmpDir, "sub"));
      writeFileSync(join(tmpDir, "top.txt"), "match here\n");
      writeFileSync(join(tmpDir, "sub", "deep.txt"), "match here too\n");

      const results = await grepSearch("match", tmpDir);
      expect(results.length).toBe(2);
      const files = results.map((r) => r.filePath).sort();
      expect(files).toEqual(["sub/deep.txt", "top.txt"]);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  // ── Integration with real fixture content ──

  it("finds known content in TypeScript fixtures", async () => {
    const results = await grepSearch("AppService", FIXTURES_TS);
    expect(results.length).toBeGreaterThan(0);
    // Should find it in service.ts at minimum
    const serviceMatches = results.filter((r) => r.filePath === "service.ts");
    expect(serviceMatches.length).toBeGreaterThan(0);
  });

  it("finds exports in fixture files", async () => {
    const results = await grepSearch("export", FIXTURES_TS);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.lineContent).toContain("export");
    }
  });

  // ── GrepResult shape validation ──

  it("returns properly shaped GrepResult objects", async () => {
    const results = await grepSearch("class", FIXTURES_TS);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.filePath).toBe("string");
      expect(typeof r.lineNumber).toBe("number");
      expect(typeof r.columnNumber).toBe("number");
      expect(typeof r.matchText).toBe("string");
      expect(typeof r.lineContent).toBe("string");
      expect(Array.isArray(r.contextBefore)).toBe(true);
      expect(Array.isArray(r.contextAfter)).toBe(true);
    }
  });
});
