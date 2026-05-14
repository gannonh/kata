import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSymphonyBinary, validateBinaryPath } from "./binary-resolver.ts";
import { createDefaultState } from "./state.ts";

const symphonyBinaryName = process.platform === "win32" ? "symphony.exe" : "symphony";

async function executable(path: string): Promise<string> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, "#!/bin/sh\necho symphony\n", "utf8");
  await chmod(path, 0o755);
  return path;
}

describe("Symphony binary resolver", () => {
  it("uses SYMPHONY_BIN first", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-bin-"));
    const binary = await executable(join(dir, "custom-symphony"));
    const state = createDefaultState();

    const resolved = await resolveSymphonyBinary({
      cwd: dir,
      state,
      env: { SYMPHONY_BIN: binary, PATH: "" },
      promptForPath: async () => undefined,
    });

    expect(resolved).toBe(binary);
  });

  it("finds repo-local target release binary by walking upward", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-symphony-repo-"));
    const nested = join(root, "packages", "x");
    const binary = await executable(join(root, "apps", "symphony", "target", "release", symphonyBinaryName));
    await mkdir(nested, { recursive: true });

    const resolved = await resolveSymphonyBinary({
      cwd: nested,
      state: createDefaultState(),
      env: { PATH: "" },
      promptForPath: async () => undefined,
    });

    expect(resolved).toBe(binary);
  });

  it("falls back to PATH when SYMPHONY_BIN is invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-fallback-"));
    const invalid = join(dir, "missing-symphony");
    const binary = await executable(join(dir, symphonyBinaryName));

    await expect(
      resolveSymphonyBinary({
        cwd: dir,
        state: createDefaultState(),
        env: { SYMPHONY_BIN: invalid, PATH: dir },
        promptForPath: async () => undefined,
      }),
    ).resolves.toBe(binary);
  });

  it("uses persisted user path after built-in checks fail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-persisted-"));
    const binary = await executable(join(dir, "persisted"));
    const state = createDefaultState();
    state.binaryPath = binary;

    await expect(resolveSymphonyBinary({ cwd: dir, state, env: { PATH: "" }, promptForPath: async () => undefined })).resolves.toBe(binary);
  });

  it("prompts for an absolute path and persists it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-prompt-"));
    const binary = await executable(join(dir, "prompted"));
    const state = createDefaultState();

    const resolved = await resolveSymphonyBinary({
      cwd: dir,
      state,
      env: { PATH: "" },
      promptForPath: async () => binary,
    });

    expect(resolved).toBe(binary);
    expect(state.binaryPath).toBe(binary);
  });

  it("rejects relative binary paths", async () => {
    await expect(validateBinaryPath("relative/symphony")).rejects.toThrow("Symphony binary path must be absolute");
  });

  it("rejects directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-dir-"));

    await expect(validateBinaryPath(dir)).rejects.toThrow("Symphony binary path is not a file");
  });

  it("reports a missing binary when no candidate is valid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-symphony-missing-"));

    await expect(
      resolveSymphonyBinary({
        cwd: dir,
        state: createDefaultState(),
        env: { PATH: "" },
        promptForPath: async () => undefined,
      }),
    ).rejects.toMatchObject({
      kind: "missing_binary",
      message: expect.stringContaining("Could not find Symphony binary"),
    });
  });
});
