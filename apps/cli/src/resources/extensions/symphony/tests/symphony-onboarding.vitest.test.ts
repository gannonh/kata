import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateSymphonyUrl,
  writeSymphonyUrlToPreferences,
} from "../../../../wizard.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `symphony-onboarding-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("validateSymphonyUrl", () => {
  it("returns normalized URL for valid http URL", () => {
    expect(validateSymphonyUrl("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("returns normalized URL for valid https URL", () => {
    expect(validateSymphonyUrl("https://symphony.example.com")).toBe("https://symphony.example.com");
  });

  it("removes trailing slash", () => {
    expect(validateSymphonyUrl("http://localhost:8080/")).toBe("http://localhost:8080");
  });

  it("returns null for empty string", () => {
    expect(validateSymphonyUrl("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(validateSymphonyUrl("   ")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(validateSymphonyUrl("not-a-url")).toBeNull();
  });

  it("returns null for non-http/https protocol", () => {
    expect(validateSymphonyUrl("ftp://localhost:8080")).toBeNull();
  });
});

describe("writeSymphonyUrlToPreferences", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates preferences file when it does not exist", () => {
    const result = writeSymphonyUrlToPreferences(tmpDir, "http://localhost:8080");
    expect(result).toBe(true);

    const content = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");
    expect(content).toContain("symphony:");
    expect(content).toContain("url: http://localhost:8080");
  });

  it("adds symphony section to existing preferences without symphony config", () => {
    const kataDir = join(tmpDir, ".kata");
    mkdirSync(kataDir, { recursive: true });
    writeFileSync(
      join(kataDir, "preferences.md"),
      "---\nversion: 1\n---\n",
      "utf-8",
    );

    const result = writeSymphonyUrlToPreferences(tmpDir, "https://symphony.example.com");
    expect(result).toBe(true);

    const content = readFileSync(join(kataDir, "preferences.md"), "utf-8");
    expect(content).toContain("symphony:");
    expect(content).toContain("url: https://symphony.example.com");
    expect(content).toContain("version: 1");
  });

  it("updates url in existing symphony section", () => {
    const kataDir = join(tmpDir, ".kata");
    mkdirSync(kataDir, { recursive: true });
    writeFileSync(
      join(kataDir, "preferences.md"),
      "---\nsymphony:\n  url: http://old:8080\n---\n",
      "utf-8",
    );

    const result = writeSymphonyUrlToPreferences(tmpDir, "http://new:9090");
    expect(result).toBe(true);

    const content = readFileSync(join(kataDir, "preferences.md"), "utf-8");
    expect(content).toContain("url: http://new:9090");
    expect(content).not.toContain("http://old:8080");
  });

  it("adds url to existing symphony section without url field", () => {
    const kataDir = join(tmpDir, ".kata");
    mkdirSync(kataDir, { recursive: true });
    writeFileSync(
      join(kataDir, "preferences.md"),
      "---\nsymphony:\n  workflow_path: ./WORKFLOW.md\n---\n",
      "utf-8",
    );

    const result = writeSymphonyUrlToPreferences(tmpDir, "http://localhost:8080");
    expect(result).toBe(true);

    const content = readFileSync(join(kataDir, "preferences.md"), "utf-8");
    expect(content).toContain("url: http://localhost:8080");
    expect(content).toContain("workflow_path: ./WORKFLOW.md");
  });
});
