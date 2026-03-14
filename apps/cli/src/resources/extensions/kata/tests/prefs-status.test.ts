import test from "node:test";
import assert from "node:assert/strict";

import type { LoadedKataPreferences } from "../preferences.ts";
import type { LinearConfigValidationResult } from "../linear-config.ts";
import {
  buildPrefsStatusReport,
  type PrefsStatusDependencies,
} from "../commands.ts";

function makeLoadedPreferences(
  overrides: Partial<LoadedKataPreferences> & {
    preferences: LoadedKataPreferences["preferences"];
  },
): LoadedKataPreferences {
  return {
    path: "/tmp/project/.kata/preferences.md",
    scope: "project",
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<PrefsStatusDependencies> = {},
): PrefsStatusDependencies {
  return {
    getGlobalKataPreferencesPath: () => "/tmp/home/.kata-cli/preferences.md",
    getLegacyGlobalKataPreferencesPath: () => "/tmp/home/.pi/agent/kata-preferences.md",
    getProjectKataPreferencesPath: () => "/tmp/project/.kata/preferences.md",
    loadGlobalKataPreferences: () => null,
    loadProjectKataPreferences: () => null,
    loadEffectiveKataPreferences: () => null,
    resolveAllSkillReferences: () => ({
      resolutions: new Map(),
      warnings: [],
    }),
    validateLinearProjectConfig: async () => ({
      ok: true,
      status: "skipped",
      mode: "file",
      isLinearMode: false,
      path: null,
      apiKeyPresent: false,
      config: {
        path: null,
        scope: null,
        workflowMode: "file",
        isLinearMode: false,
        linear: {
          teamId: null,
          teamKey: null,
          projectId: null,
        },
      },
      diagnostics: [],
      resolved: {
        team: null,
        project: null,
      },
    }),
    ...overrides,
  };
}

test("buildPrefsStatusReport reports file mode with resolved preference path", async () => {
  const projectPrefs = makeLoadedPreferences({
    preferences: { workflow: { mode: "file" } },
  });

  const report = await buildPrefsStatusReport(
    makeDeps({
      loadProjectKataPreferences: () => projectPrefs,
      loadEffectiveKataPreferences: () => projectPrefs,
    }),
  );

  assert.equal(report.level, "info");
  assert.match(report.message, /^Kata prefs status/m);
  assert.match(report.message, /^mode: file$/m);
  assert.match(
    report.message,
    /^effective preferences: \/tmp\/project\/.kata\/preferences.md \(project\)$/m,
  );
  assert.match(report.message, /^linear: inactive \(file mode\)$/m);
  assert.doesNotMatch(report.message, /validation: invalid/);
});

test("buildPrefsStatusReport reports Linear mode identifiers and validation summary", async () => {
  const projectPrefs = makeLoadedPreferences({
    preferences: {
      workflow: { mode: "linear" },
      linear: {
        teamKey: "KAT",
        projectId: "project-456",
      },
    },
  });

  const validation: LinearConfigValidationResult = {
    ok: true,
    status: "valid",
    mode: "linear",
    isLinearMode: true,
    path: projectPrefs.path,
    apiKeyPresent: true,
    config: {
      path: projectPrefs.path,
      scope: "project",
      workflowMode: "linear",
      isLinearMode: true,
      linear: {
        teamId: null,
        teamKey: "KAT",
        projectId: "project-456",
      },
    },
    diagnostics: [],
    resolved: {
      team: {
        id: "team-123",
        key: "KAT",
        name: "Kata",
      },
      project: {
        id: "project-456",
        name: "CLI",
        slugId: "cli",
        state: "started",
        url: "https://linear.app/kata/project/cli",
      },
    },
  };

  const report = await buildPrefsStatusReport(
    makeDeps({
      loadProjectKataPreferences: () => projectPrefs,
      loadEffectiveKataPreferences: () => projectPrefs,
      validateLinearProjectConfig: async () => validation,
    }),
  );

  assert.equal(report.level, "info");
  assert.match(report.message, /^mode: linear$/m);
  assert.match(report.message, /^LINEAR_API_KEY: present$/m);
  assert.match(report.message, /^linear\.teamKey: KAT$/m);
  assert.match(report.message, /^linear\.projectId: project-456$/m);
  assert.match(report.message, /^validation: valid$/m);
  assert.match(report.message, /^resolved team: Kata \(KAT · team-123\)$/m);
  assert.match(report.message, /^resolved project: CLI \(project-456 · started\)$/m);
});

test("buildPrefsStatusReport redacts failures while keeping them actionable", async () => {
  const projectPrefs = makeLoadedPreferences({
    preferences: {
      workflow: { mode: "linear" },
      linear: {
        teamKey: "KAT",
      },
    },
  });

  const report = await buildPrefsStatusReport(
    makeDeps({
      loadProjectKataPreferences: () => projectPrefs,
      loadEffectiveKataPreferences: () => projectPrefs,
      validateLinearProjectConfig: async () => ({
        ok: false,
        status: "invalid",
        mode: "linear",
        isLinearMode: true,
        path: projectPrefs.path,
        apiKeyPresent: false,
        config: {
          path: projectPrefs.path,
          scope: "project",
          workflowMode: "linear",
          isLinearMode: true,
          linear: {
            teamId: null,
            teamKey: "KAT",
            projectId: null,
          },
        },
        diagnostics: [
          {
            code: "missing_linear_api_key",
            field: "LINEAR_API_KEY",
            message:
              "LINEAR_API_KEY is required to validate Linear mode configuration.",
            retryable: false,
          },
        ],
        resolved: {
          team: null,
          project: null,
        },
      }),
    }),
  );

  assert.equal(report.level, "warning");
  assert.match(report.message, /^mode: linear$/m);
  assert.match(report.message, /^LINEAR_API_KEY: missing$/m);
  assert.match(report.message, /^validation: invalid$/m);
  assert.match(
    report.message,
    /^diagnostic: missing_linear_api_key — LINEAR_API_KEY is required to validate Linear mode configuration\.$/m,
  );
  assert.match(
    report.message,
    /^action: set LINEAR_API_KEY to validate this Linear binding\.$/m,
  );
  assert.doesNotMatch(report.message, /super-secret-linear-key/);
});

// ─── PR lifecycle config visibility (failing until T02 adds PR lines) ─────────

test("buildPrefsStatusReport includes pr.enabled line when PR lifecycle is configured", async () => {
  const projectPrefs = makeLoadedPreferences({
    preferences: {
      workflow: { mode: "file" },
      pr: { enabled: true, auto_create: true, base_branch: "main" },
    },
  });

  const report = await buildPrefsStatusReport(
    makeDeps({
      loadProjectKataPreferences: () => projectPrefs,
      loadEffectiveKataPreferences: () => projectPrefs,
    }),
  );

  // These assertions FAIL until buildPrefsStatusReport appends PR lifecycle lines.
  assert.match(
    report.message,
    /^pr\.enabled: true$/m,
    "report must include pr.enabled line",
  );
  assert.match(
    report.message,
    /^pr\.auto_create: true$/m,
    "report must include pr.auto_create line",
  );
  assert.match(
    report.message,
    /^pr\.base_branch: main$/m,
    "report must include pr.base_branch line",
  );
});

test("buildPrefsStatusReport includes pr: disabled when PR lifecycle is not configured", async () => {
  const projectPrefs = makeLoadedPreferences({
    preferences: { workflow: { mode: "file" } },
  });

  const report = await buildPrefsStatusReport(
    makeDeps({
      loadProjectKataPreferences: () => projectPrefs,
      loadEffectiveKataPreferences: () => projectPrefs,
    }),
  );

  // FAILS until buildPrefsStatusReport adds a PR section for unconfigured state.
  assert.match(
    report.message,
    /^pr: disabled$/m,
    "report must show 'pr: disabled' when PR lifecycle is not configured",
  );
});

test("buildPrefsStatusReport includes pr: disabled when pr.enabled is explicitly false", async () => {
  const projectPrefs = makeLoadedPreferences({
    preferences: {
      workflow: { mode: "file" },
      pr: { enabled: false },
    },
  });

  const report = await buildPrefsStatusReport(
    makeDeps({
      loadProjectKataPreferences: () => projectPrefs,
      loadEffectiveKataPreferences: () => projectPrefs,
    }),
  );

  // FAILS until buildPrefsStatusReport adds a PR section.
  assert.match(
    report.message,
    /^pr: disabled$/m,
    "report must show 'pr: disabled' when pr.enabled is false",
  );
});
