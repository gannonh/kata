import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, existsSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ensurePreferences, ensureGitignore } from "../gitignore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `kata-gitignore-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

// ─── Regression: no broken relative imports in extension source ───────────────

describe("extension source imports", () => {
  it("onboarding.ts does not import from app-paths (extensions run from ~/.kata-cli/, not dist/)", () => {
    // Regression for: Cannot find module '../../../app-paths.js'
    // Extensions are synced to ~/.kata-cli/agent/extensions/kata/ at runtime,
    // so relative imports that target src/app-paths.ts (which only exists in
    // the source tree) will fail. The fix is to compute paths inline.
    const onboardingSource = readFileSync(
      join(__dirname, "..", "onboarding.ts"),
      "utf-8",
    );
    expect(onboardingSource).not.toContain("app-paths");
  });
});

// ─── ensurePreferences ────────────────────────────────────────────────────────

describe("ensurePreferences", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("creates .kata/ directory and preferences.md when neither exists", () => {
    // Regression: ensurePreferences must create the .kata/ directory itself
    // on a fresh install where the directory does not yet exist.
    const kataDir = join(tmpDir, ".kata");
    expect(existsSync(kataDir)).toBe(false);

    const created = ensurePreferences(tmpDir);

    expect(created).toBe(true);
    expect(existsSync(kataDir)).toBe(true);
    expect(existsSync(join(kataDir, "preferences.md"))).toBe(true);

    const content = readFileSync(join(kataDir, "preferences.md"), "utf-8");
    expect(content).toContain("version:");
  });

  it("does not overwrite existing preferences.md", () => {
    const kataDir = join(tmpDir, ".kata");
    mkdirSync(kataDir, { recursive: true });
    const prefsPath = join(kataDir, "preferences.md");
    const original = "---\nversion: 1\ncustom: true\n---\n";
    require("node:fs").writeFileSync(prefsPath, original, "utf-8");

    const created = ensurePreferences(tmpDir);

    expect(created).toBe(false);
    expect(readFileSync(prefsPath, "utf-8")).toBe(original);
  });

  it("is idempotent — second call is a no-op", () => {
    ensurePreferences(tmpDir);
    const content1 = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");

    const created = ensurePreferences(tmpDir);

    expect(created).toBe(false);
    expect(readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8")).toBe(content1);
  });
});

describe("ensureGitignore", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("creates .gitignore with baseline patterns when it does not exist", () => {
    expect(existsSync(join(tmpDir, ".gitignore"))).toBe(false);

    const modified = ensureGitignore(tmpDir);

    expect(modified).toBe(true);
    const content = readFileSync(join(tmpDir, ".gitignore"), "utf-8");
    expect(content).toContain(".kata/activity/");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".DS_Store");
  });

  it("appends only missing patterns to an existing .gitignore", () => {
    const existing = "node_modules/\n.DS_Store\n";
    require("node:fs").writeFileSync(join(tmpDir, ".gitignore"), existing, "utf-8");

    const modified = ensureGitignore(tmpDir);

    expect(modified).toBe(true);
    const content = readFileSync(join(tmpDir, ".gitignore"), "utf-8");
    // Original content preserved
    expect(content.startsWith("node_modules/\n.DS_Store\n")).toBe(true);
    // New patterns added
    expect(content).toContain(".kata/activity/");
    // Already-present patterns not duplicated
    const nodeModulesCount = content.split("node_modules/").length - 1;
    expect(nodeModulesCount).toBe(1);
  });

  it("is idempotent — returns false when all patterns present", () => {
    ensureGitignore(tmpDir);

    const modified = ensureGitignore(tmpDir);

    expect(modified).toBe(false);
  });
});
