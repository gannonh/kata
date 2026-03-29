import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isProjectConfigured,
  runOnboarding,
  shouldSkipOnboarding,
  setSkipOnboarding,
  _resetSkipFlag,
  _setDeps,
  pickLinearTeamAndProject,
  updatePreferencesLinearConfig,
  type OnboardingDeps,
  type LinearPickerResult,
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
  selectReturns?: Array<string | null | undefined>;
} = {}): any {
  const inputReturns = overrides.inputReturns ?? ["lin_api_test123"];
  let inputCallIndex = 0;
  const selectReturns = overrides.selectReturns ?? [];
  let selectCallIndex = 0;
  const notifications: Array<{ message: string; level: string }> = [];

  return {
    hasUI: overrides.hasUI ?? true,
    ui: {
      input: vi.fn(async () => {
        const value = inputReturns[inputCallIndex] ?? null;
        inputCallIndex++;
        return value;
      }),
      select: vi.fn(async () => {
        const value = selectReturns[selectCallIndex] ?? undefined;
        selectCallIndex++;
        return value;
      }),
      notify: vi.fn((message: string, level: string) => {
        notifications.push({ message, level });
      }),
    },
    _notifications: notifications,
  };
}

const DEFAULT_TEAMS = [
  { id: "team-1", key: "KAT", name: "Kata-sh" },
  { id: "team-2", key: "DEV", name: "Dev Team" },
];

const DEFAULT_PROJECTS = [
  { id: "proj-1", name: "Kata CLI", slugId: "459f9835e809" },
  { id: "proj-2", name: "Kata Desktop", slugId: "abc123def456" },
];

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
      listTeams: async () => DEFAULT_TEAMS,
      listProjects: async () => DEFAULT_PROJECTS,
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
      const ctx = makeMockCtx({
        inputReturns: ["lin_api_valid"],
        selectReturns: ["Kata-sh (KAT)", "Kata CLI"],
      });
      const deps = makeMockDeps({
        ensurePreferences: vi.fn((basePath: string) => {
          const kataDir = join(basePath, ".kata");
          mkdirSync(kataDir, { recursive: true });
          writeFileSync(
            join(kataDir, "preferences.md"),
            "---\nversion: 1\nworkflow:\n  mode: linear\nlinear: {}\n---\n",
            "utf-8",
          );
          return true;
        }),
      });
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
        selectReturns: ["Kata-sh (KAT)", "Kata CLI"],
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
          listTeams: async () => DEFAULT_TEAMS,
          listProjects: async () => DEFAULT_PROJECTS,
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
      const ctx = makeMockCtx({
        inputReturns: ["lin_api_stored"],
        selectReturns: ["Kata-sh (KAT)", "Kata CLI"],
      });
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

  // ─── pickLinearTeamAndProject ──────────────────────────────────────────────

  describe("pickLinearTeamAndProject — picker", () => {
    it("multi-team → select → multi-project → select → returns correct values", async () => {
      const ctx = makeMockCtx({
        selectReturns: ["Kata-sh (KAT)", "Kata CLI"],
      });
      const deps = makeMockDeps();
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toEqual({ teamKey: "KAT", projectSlug: "459f9835e809" });
      expect(ctx.ui.select).toHaveBeenCalledTimes(2);
      expect(ctx.ui.select).toHaveBeenCalledWith(
        "Select your Linear team",
        ["Kata-sh (KAT)", "Dev Team (DEV)"],
      );
      expect(ctx.ui.select).toHaveBeenCalledWith(
        "Select your Linear project",
        ["Kata CLI", "Kata Desktop"],
      );
    });

    it("duplicate project names → disambiguates with slugId in label, resolves correct project", async () => {
      // Two projects with identical names — picker must display unique labels
      const duplicateProjects = [
        { id: "proj-1", name: "Kata CLI", slugId: "slug-first-111" },
        { id: "proj-2", name: "Kata CLI", slugId: "slug-second-222" },
      ];
      // Single team → auto-selected; user selects the second project (disambiguated with slugId)
      const ctx = makeMockCtx({
        selectReturns: ["Kata CLI (slug-second-222)"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => [{ id: "team-1", key: "KAT", name: "Kata-sh" }],
          listProjects: async () => duplicateProjects,
        }),
      });
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      // Must resolve to the second project, not the first
      expect(result).toEqual({ teamKey: "KAT", projectSlug: "slug-second-222" });
      // Both duplicate project labels should include slugId for disambiguation
      expect(ctx.ui.select).toHaveBeenCalledWith(
        "Select your Linear project",
        ["Kata CLI (slug-first-111)", "Kata CLI (slug-second-222)"],
      );
    });

    it("single-team auto-selects without prompting", async () => {
      const singleTeam = [{ id: "team-1", key: "KAT", name: "Kata-sh" }];
      const ctx = makeMockCtx({
        selectReturns: ["Kata CLI"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => singleTeam,
          listProjects: async () => DEFAULT_PROJECTS,
        }),
      });
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toEqual({ teamKey: "KAT", projectSlug: "459f9835e809" });
      // select called only once (for project), not for team
      expect(ctx.ui.select).toHaveBeenCalledTimes(1);
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("Auto-selected team") && n.level === "info",
      )).toBe(true);
    });

    it("single-team + single-project → both auto-selected, no select calls", async () => {
      const singleTeam = [{ id: "team-1", key: "KAT", name: "Kata-sh" }];
      const singleProject = [{ id: "proj-1", name: "Kata CLI", slugId: "459f9835e809" }];
      const ctx = makeMockCtx();
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => singleTeam,
          listProjects: async () => singleProject,
        }),
      });
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toEqual({ teamKey: "KAT", projectSlug: "459f9835e809" });
      expect(ctx.ui.select).not.toHaveBeenCalled();
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("Auto-selected team"),
      )).toBe(true);
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("Auto-selected project"),
      )).toBe(true);
    });

    it("user cancels team picker → returns null", async () => {
      const ctx = makeMockCtx({
        selectReturns: [undefined], // user cancelled
      });
      const deps = makeMockDeps();
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toBeNull();
    });

    it("user cancels project picker → returns null", async () => {
      const ctx = makeMockCtx({
        selectReturns: ["Kata-sh (KAT)", undefined], // selected team, cancelled project
      });
      const deps = makeMockDeps();
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toBeNull();
    });
  });

  // ─── pickLinearTeamAndProject — fallback ───────────────────────────────────

  describe("pickLinearTeamAndProject — fallback", () => {
    it("listTeams throws → manual team key and project slug entry", async () => {
      const ctx = makeMockCtx({
        inputReturns: ["KAT", "459f9835e809"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => { throw new Error("Network error"); },
          listProjects: async () => DEFAULT_PROJECTS,
        }),
      });
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toEqual({ teamKey: "KAT", projectSlug: "459f9835e809" });
      expect(ctx.ui.select).not.toHaveBeenCalled();
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("Could not fetch teams") && n.level === "warning",
      )).toBe(true);
    });

    it("listTeams succeeds but listProjects throws → team picked, project entered manually", async () => {
      const ctx = makeMockCtx({
        selectReturns: ["Kata-sh (KAT)"],
        inputReturns: ["459f9835e809"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => DEFAULT_TEAMS,
          listProjects: async () => { throw new Error("Rate limited"); },
        }),
      });
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toEqual({ teamKey: "KAT", projectSlug: "459f9835e809" });
      expect(ctx.ui.select).toHaveBeenCalledTimes(1); // only team picker
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("Could not fetch projects") && n.level === "warning",
      )).toBe(true);
    });

    it("manual entry with empty team key input → returns null", async () => {
      const ctx = makeMockCtx({
        inputReturns: [""], // empty team key
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => { throw new Error("Network error"); },
          listProjects: async () => DEFAULT_PROJECTS,
        }),
      });
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toBeNull();
    });

    it("no teams found → falls back to manual entry", async () => {
      const ctx = makeMockCtx({
        inputReturns: ["KAT", "abc123"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => [],
          listProjects: async () => DEFAULT_PROJECTS,
        }),
      });
      _setDeps(deps);

      const result = await pickLinearTeamAndProject(ctx, "lin_api_test");

      expect(result).toEqual({ teamKey: "KAT", projectSlug: "abc123" });
      expect(ctx._notifications.some(
        (n: any) => n.message.includes("No teams found"),
      )).toBe(true);
    });
  });

  // ─── updatePreferencesLinearConfig ─────────────────────────────────────────

  describe("updatePreferencesLinearConfig", () => {
    it("writes teamKey and projectSlug into preferences with empty linear block", () => {
      writePreferences(tmpDir, prefsWithLinear("  {}"));

      updatePreferencesLinearConfig(tmpDir, { teamKey: "KAT", projectSlug: "459f9835e809" });

      const content = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");
      expect(content).toContain("teamKey: KAT");
      expect(content).toContain("projectSlug: 459f9835e809");
      // Verify preferences are loadable and correct
      expect(isProjectConfigured(tmpDir)).toBe(true);
    });

    it("preserves other YAML fields when writing linear config", () => {
      const original = `---
version: 1
workflow:
  mode: linear
linear: {}
pr:
  enabled: true
  base_branch: main
models:
  research: claude-sonnet-4-6
---

# My Preferences
`;
      writePreferences(tmpDir, original);

      updatePreferencesLinearConfig(tmpDir, { teamKey: "DEV", projectSlug: "slug123" });

      const content = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");
      expect(content).toContain("teamKey: DEV");
      expect(content).toContain("projectSlug: slug123");
      expect(content).toContain("version: 1");
      expect(content).toContain("mode: linear");
      expect(content).toContain("enabled: true");
      expect(content).toContain("base_branch: main");
      expect(content).toContain("research: claude-sonnet-4-6");
      expect(content).toContain("# My Preferences");
    });

    it("overwrites existing linear.teamKey and linear.projectSlug", () => {
      writePreferences(tmpDir, prefsWithLinear("  teamKey: OLD\n  projectSlug: old-slug"));

      updatePreferencesLinearConfig(tmpDir, { teamKey: "NEW", projectSlug: "new-slug" });

      const content = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");
      expect(content).toContain("teamKey: NEW");
      expect(content).toContain("projectSlug: new-slug");
      expect(content).not.toContain("teamKey: OLD");
      expect(content).not.toContain("old-slug");
    });

    it("adds linear block when none exists in frontmatter", () => {
      const noLinear = `---
version: 1
workflow:
  mode: linear
pr:
  enabled: false
---

# Prefs
`;
      writePreferences(tmpDir, noLinear);

      updatePreferencesLinearConfig(tmpDir, { teamKey: "KAT", projectSlug: "abc" });

      const content = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");
      expect(content).toContain("teamKey: KAT");
      expect(content).toContain("projectSlug: abc");
      expect(isProjectConfigured(tmpDir)).toBe(true);
    });
  });

  // ─── runOnboarding with picker integration ────────────────────────────────

  describe("runOnboarding — picker integration", () => {
    it("full flow: key → picker → write → isProjectConfigured true", async () => {
      const singleTeam = [{ id: "team-1", key: "KAT", name: "Kata-sh" }];
      const singleProject = [{ id: "proj-1", name: "Kata CLI", slugId: "459f9835e809" }];
      const ctx = makeMockCtx({
        inputReturns: ["lin_api_valid"],
      });
      const deps = makeMockDeps({
        createLinearClient: () => ({
          getViewer: async () => ({ id: "user-1", name: "Test", email: "t@t.com" }),
          listTeams: async () => singleTeam,
          listProjects: async () => singleProject,
        }),
        // Actually write preferences to disk
        ensurePreferences: vi.fn((basePath: string) => {
          const kataDir = join(basePath, ".kata");
          mkdirSync(kataDir, { recursive: true });
          writeFileSync(
            join(kataDir, "preferences.md"),
            "---\nversion: 1\nworkflow:\n  mode: linear\nlinear: {}\n---\n",
            "utf-8",
          );
          return true;
        }),
      });
      _setDeps(deps);

      try {
        const result = await runOnboarding(ctx, tmpDir);

        expect(result).toBe("completed");
        // Verify preferences were written correctly
        expect(isProjectConfigured(tmpDir)).toBe(true);
        const content = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");
        expect(content).toContain("teamKey: KAT");
        expect(content).toContain("projectSlug: 459f9835e809");
        // Verify success notification mentions team and project
        expect(ctx._notifications.some(
          (n: any) => n.message.includes("team=KAT") && n.message.includes("459f9835e809"),
        )).toBe(true);
      } finally {
        delete process.env.LINEAR_API_KEY;
      }
    });

    it("picker returns null (user cancelled) → preferences created but no linear config", async () => {
      const ctx = makeMockCtx({
        inputReturns: ["lin_api_valid"],
        selectReturns: [undefined], // user cancels team picker
      });
      const deps = makeMockDeps({
        ensurePreferences: vi.fn((basePath: string) => {
          const kataDir = join(basePath, ".kata");
          mkdirSync(kataDir, { recursive: true });
          writeFileSync(
            join(kataDir, "preferences.md"),
            "---\nversion: 1\nworkflow:\n  mode: linear\nlinear: {}\n---\n",
            "utf-8",
          );
          return true;
        }),
      });
      _setDeps(deps);

      try {
        const result = await runOnboarding(ctx, tmpDir);

        expect(result).toBe("completed");
        // Preferences exist but no linear config written
        expect(isProjectConfigured(tmpDir)).toBe(false);
        const content = readFileSync(join(tmpDir, ".kata", "preferences.md"), "utf-8");
        expect(content).not.toContain("teamKey:");
      } finally {
        delete process.env.LINEAR_API_KEY;
      }
    });
  });
});
