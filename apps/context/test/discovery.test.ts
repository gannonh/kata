import { join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { discoverFiles } from "../src/discovery.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import type { Config } from "../src/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "mixed");

function configWith(overrides: Partial<Config> = {}): Config {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides };
}

describe("discoverFiles", () => {
  it("finds .ts, .tsx, .py files recursively in mixed fixture", () => {
    const files = discoverFiles(FIXTURES, configWith());
    // Should find: utils.ts, service.ts, empty.ts, syntax-error.ts, nested/deep.ts,
    //              helpers.py, nested/models.py
    // Should NOT find: README.md, data.json
    expect(files).toContain("utils.ts");
    expect(files).toContain("service.ts");
    expect(files).toContain("helpers.py");
    expect(files).toContain("nested/deep.ts");
    expect(files).toContain("nested/models.py");
    expect(files).toContain("empty.ts");
    expect(files).toContain("syntax-error.ts");

    // Non-parseable files excluded
    expect(files).not.toContain("README.md");
    expect(files).not.toContain("data.json");
  });

  it("returns sorted results for determinism", () => {
    const files = discoverFiles(FIXTURES, configWith());
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  it("respects language filter — typescript only", () => {
    const files = discoverFiles(
      FIXTURES,
      configWith({ languages: ["typescript"] }),
    );
    expect(files.every((f) => f.endsWith(".ts") || f.endsWith(".tsx"))).toBe(
      true,
    );
    expect(files).not.toContain("helpers.py");
    expect(files).not.toContain("nested/models.py");
  });

  it("respects language filter — python only", () => {
    const files = discoverFiles(
      FIXTURES,
      configWith({ languages: ["python"] }),
    );
    expect(files.every((f) => f.endsWith(".py"))).toBe(true);
    expect(files).not.toContain("utils.ts");
  });

  it("respects custom excludes", () => {
    const files = discoverFiles(
      FIXTURES,
      configWith({ excludes: [...DEFAULT_CONFIG.excludes, "nested"] }),
    );
    expect(files).not.toContain("nested/deep.ts");
    expect(files).not.toContain("nested/models.py");
    // Files at the root level still found
    expect(files).toContain("utils.ts");
    expect(files).toContain("helpers.py");
  });

  it("skips hidden directories", () => {
    // Create a temp dir with a hidden subdirectory
    const tmp = mkdtempSync(join(tmpdir(), "kata-discover-"));
    mkdirSync(join(tmp, ".hidden"));
    writeFileSync(join(tmp, ".hidden", "secret.ts"), "export const x = 1;");
    writeFileSync(join(tmp, "visible.ts"), "export const y = 2;");

    const files = discoverFiles(tmp, configWith());
    expect(files).toContain("visible.ts");
    expect(files).not.toContain(".hidden/secret.ts");
  });

  it("skips default-excluded directories (node_modules, .git, dist)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-discover-"));
    mkdirSync(join(tmp, "node_modules"));
    writeFileSync(
      join(tmp, "node_modules", "lib.ts"),
      "export const x = 1;",
    );
    mkdirSync(join(tmp, "dist"));
    writeFileSync(join(tmp, "dist", "out.ts"), "export const y = 2;");
    writeFileSync(join(tmp, "src.ts"), "export const z = 3;");

    const files = discoverFiles(tmp, configWith());
    expect(files).toEqual(["src.ts"]);
  });

  it("returns empty array for a directory with no parseable files", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-discover-"));
    writeFileSync(join(tmp, "readme.md"), "# Hello");
    writeFileSync(join(tmp, "data.json"), "{}");

    const files = discoverFiles(tmp, configWith());
    expect(files).toEqual([]);
  });

  it("handles empty directories", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-discover-"));
    const files = discoverFiles(tmp, configWith());
    expect(files).toEqual([]);
  });

  it("skips directory symlinks to avoid cycles", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-discover-"));
    mkdirSync(join(tmp, "real"));
    writeFileSync(join(tmp, "real", "file.ts"), "export const x = 1;");
    try {
      symlinkSync(join(tmp, "real"), join(tmp, "link"), "dir");
    } catch {
      // Symlink creation may fail on some systems — skip test
      return;
    }

    const files = discoverFiles(tmp, configWith());
    // Should find the real file but not follow the symlink directory
    expect(files).toContain("real/file.ts");
    // The symlink dir is not followed — assert its contents are not duplicated
    expect(files).not.toContain("link/file.ts");
  });
});
