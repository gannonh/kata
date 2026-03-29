import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isProjectConfigured,
  runOnboarding,
  shouldSkipOnboarding,
  setSkipOnboarding,
  _resetSkipFlag,
  _setDeps,
  type OnboardingDeps,
} from "../onboarding.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `kata-onboard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  // Resolve symlinks (macOS /var -> /private/var) so path comparisons work
  return realpathSync(dir);
}

function writePreferences(basePath: string, content: string): void {
  const kataDir = join(basePath, ".kata");
  mkdirSync(kataDir, { recursive: true });
  writeFileSync(join(kataDir, "preferences.md"), content, "utf-8");
}

/**
 * Build a preferences.md with frontmatter containing the given linear block.
 */
function prefsWithLinear(linearYaml: string): string {
  return `---\nversion: 1\nworkflow:\n  mode: linear\nlinear:\n${linearYaml}\n---\n`;
}

function makeMockCtx(overrides: {
  hasUI?: boolean;
  inputReturns?: Array<string | null>;
} = {}): any {
  const inputReturns = overrides.inputReturns ?? ["lin_api_test123"];
  let inputCallIndex = 0;
  const notifications: Array<{ message: string; level: string }> = [];

  return {
    hasUI: overrides.hasUI ?? true,
    ui: {
      input: vi.fn(async () => {
        const value = inputReturns[inputCallIndex] ?? null;
        inputCallIndex++;
        return value;
      }),
      notify: vi.fn((message: string, level: string) => {
        notifications.push({ message, level });
      }),
    },
    _notifications: notifications,
  };
}

function makeMockDeps(overrides: Partial<OnboardingDeps> = {}): OnboardingDeps {
  const storedCreds: Record<string, any> = {};

  return {
    getAuthFilePath: () => "/tmp/fake-auth.json",
    createAuthStorage: () => ({
      set: (provider: string, cred: any) => {
        storedCreds[provider] = cred;
      },
    }),
    createLinearClient: () => ({
      getViewer: async () => ({ id: "user-1", name: "Test User", email: "test@test.com" }),
    }),
    ensurePreferences: vi.fn(() => true),
    ensureGitignore: vi.fn(() => true),
    ...overrides,
    _storedCreds: storedCreds,
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("onboarding", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    _resetSkipFlag();
  });

  afterEach(() => {
    _setDeps(null);
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ─── isProjectConfigured ──────────────────────────────────────────────────

  describe("isProjectConfigured", () => {
    it("returns false when .kata/ does not exist", () => {
      expect(isProjectConfigured(tmpDir)).toBe(false);
    });

    it("returns false when preferences exist but linear block is empty", () => {
      writePreferences(tmpDir, prefsWithLinear("  {}"));
      expect(isProjectConfigured(tmpDir)).toBe(false);
    });

    it("returns false when preferences exist but linear block has no known identifier", () => {
      writePreferences(tmpDir, prefsWithLinear("  foo: bar"));
      expect(isProjectConfigured(tmpDir)).toBe(false);
    });

    it("returns true when preferences have linear.teamId", () => {
      writePreferences(tmpDir, prefsWithLinear("  teamId: some-uuid"));
      expect(isProjectConfigured(tmpDir)).toBe(true);
    });

    it("returns true when preferences have linear.projectId", () => {
      writePreferences(tmpDir, prefsWithLinear("  projectId: some-uuid"));
      expect(isProjectConfigured(tmpDir)).toBe(true);
    });

    it("returns true when preferences have linear.teamKey", () => {
      writePreferences(tmpDir, prefsWithLinear("  teamKey: KAT"));
      expect(isProjectConfigured(tmpDir)).toBe(true);
    });

    it("returns true when preferences have linear.projectSlug", () => {
      writePreferences(tmpDir, prefsWithLinear("  projectSlug: abc123"));
      expect(isProjectConfigured(tmpDir)).toBe(true);
    });

    it("returns true when preferences have both teamKey and projectSlug", () => {
      writePreferences(tmpDir, prefsWithLinear("  teamKey: KAT\n  projectSlug: abc123"));
      expect(isProjectConfigured(tmpDir)).toBe(true);
    });
  });

  // ─── shouldSkipOnboarding / setSkipOnboarding ─────────────────────────────

  describe("skip flag", () => {
    it("defaults to false", () => {
      expect(shouldSkipOnboarding()).toBe(false);
    });

    it("can be set to true", () => {
      setSkipOnboarding(true);
      expect(shouldSkipOnboarding()).toBe(true);
    });

    it("can be reset to false", () => {
      setSkipOnboarding(true);
      setSkipOnboarding(false);
      expect(shouldSkipOnboarding()).toBe(false);
    });

    it("_resetSkipFlag resets to false", () => {
      setSkipOnboarding(true);
      _resetSkipFlag();
      expect(shouldSkipOnboarding()).toBe(false);
    });
  });

  // ─── runOnboarding ────────────────────────────────────────────────────────

  describe("runOnboarding", () => {
    it("returns 'skipped' with warning when ctx.hasUI is false", async () => {
      const ctx = makeMockCtx({ hasUI: false });
      const deps = makeMockDeps();
      _setDeps(deps);

      const result = await runOnboarding(ctx);

      expect(result).toBe("skipped");
      expect(ctx.ui.input).not.toHaveBeenCalled();
      expect(ctx.ui.notify).toHaveBeenCalledWith(
        expect.stringContaining("interactive terminal"),
        "warning",
      );
    });

    it("returns 'completed' on valid API key", async () => {
      const ctx = makeMockCtx({ inputReturns: ["lin_api_valid"] });
      const deps = makeMockDeps();
      _setDeps(deps);

      try {
        const result = await runOnboarding(ctx, tmpDir);

        expect(result).toBe("completed");
        expect(ctx.ui.input).toHaveBeenCalledOnce();
        expect(deps.ensurePreferences).toHaveBeenCalledWith(tmpDir);
        expect(deps.ensureGitignore).toHaveBeenCalledWith(tmpDir);
        expect(process.env.LINEAR_API_KEY).toBe("lin_api_valid");
        expect(ctx._notifications.some(
          (n: any) => n.message.includes("✓") && n.level === "info",
        )).toBe(true);
      } finally {
        delete process.env.LINEAR_API_KEY;
      }
    });

    it("returns 'skipped' on empty input", async () => {
      const ctx = makeMockCtx({ inputReturns: [""] });
      const deps = makeMockDeps();
      _setDeps(deps);

      const result = await runOnboarding(ctx);

      expect(result).toBe("skipped");
      expect(deps.ensurePreferences).not.toHaveBeenCalled();
    });

    it("returns 'skipped' on null input", async () => {
      const ctx = makeMockCtx({ inputReturns: [null] });
      const deps = makeMockDeps();
      _setDeps(deps);

      const result = await runOnboarding(ctx);

      expect(result).toBe("skipped");
    });

    it("retries once on auth error then succeeds", async () => {
      const ctx = makeMockCtx({
        inputReturns: ["bad_key", "good_key"],
      });
      let callCount = 0;
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => {
            callCount++;
            if (callCount === 1) {
              throw new Error("401 Unauthorized");
            }
            return { id: "user-1", name: "Test", email: "t@t.com" };
          },
        }),
      });
      _setDeps(deps);

      try {
        const result = await runOnboarding(ctx, tmpDir);

        expect(result).toBe("completed");
        expect(ctx.ui.input).toHaveBeenCalledTimes(2);
        expect(ctx._notifications.some(
          (n: any) => n.message.includes("Invalid API key") && n.level === "error",
        )).toBe(true);
        expect(process.env.LINEAR_API_KEY).toBe("good_key");
      } finally {
        delete process.env.LINEAR_API_KEY;
      }
    });

    it("returns 'skipped' after two consecutive failures", async () => {
      const ctx = makeMockCtx({
        inputReturns: ["bad1", "bad2"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => {
            throw new Error("401 Unauthorized");
          },
        }),
      });
      _setDeps(deps);

      const result = await runOnboarding(ctx);

      expect(result).toBe("skipped");
      expect(ctx.ui.input).toHaveBeenCalledTimes(2);
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("cancelled") && n.level === "warning",
      )).toBe(true);
    });

    it("shows network error message for non-auth errors", async () => {
      const ctx = makeMockCtx({
        inputReturns: ["key1", "key2"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => {
            throw new Error("fetch failed: ENOTFOUND");
          },
        }),
      });
      _setDeps(deps);

      const result = await runOnboarding(ctx);

      expect(result).toBe("skipped");
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("Could not reach Linear API") && n.level === "error",
      )).toBe(true);
    });

    it("stores credentials in auth storage", async () => {
      const ctx = makeMockCtx({ inputReturns: ["lin_api_stored"] });
      const storedCreds: Record<string, any> = {};
      const deps = makeMockDeps({
        createAuthStorage: () => ({
          set: (provider: string, cred: any) => {
            storedCreds[provider] = cred;
          },
        }),
      });
      _setDeps(deps);

      try {
        await runOnboarding(ctx, tmpDir);

        expect(storedCreds.linear).toEqual({
          type: "api_key",
          key: "lin_api_stored",
        });
      } finally {
        delete process.env.LINEAR_API_KEY;
      }
    });

    it("returns 'skipped' if empty input after a failed attempt", async () => {
      const ctx = makeMockCtx({
        inputReturns: ["bad_key", ""],
      });
      let callCount = 0;
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => {
            callCount++;
            if (callCount === 1) {
              throw new Error("401 Unauthorized");
            }
            return { id: "user-1", name: "Test", email: "t@t.com" };
          },
        }),
      });
      _setDeps(deps);

      const result = await runOnboarding(ctx);

      expect(result).toBe("skipped");
    });

    it("returns 'skipped' when ensurePreferences throws", async () => {
      const ctx = makeMockCtx({ inputReturns: ["lin_api_good"] });
      const deps = makeMockDeps({
        ensurePreferences: vi.fn(() => {
          throw new Error("Permission denied");
        }),
      });
      _setDeps(deps);

      try {
        const result = await runOnboarding(ctx, tmpDir);

        expect(result).toBe("skipped");
        expect(ctx._notifications.some(
          (n: any) => n.message.includes("Failed to create project config") && n.level === "error",
        )).toBe(true);
      } finally {
        delete process.env.LINEAR_API_KEY;
      }
    });
  });
});
