import assert from "node:assert/strict";

import type { LoadedKataPreferences, KataPreferences } from "../preferences.ts";
import {
  getLinearProjectId,
  getLinearTeamId,
  getLinearTeamKey,
  getWorkflowMode,
  isLinearMode,
  loadEffectiveLinearProjectConfig,
  validateLinearProjectConfig,
} from "../linear-config.ts";
import { LinearHttpError } from "../../linear/http.ts";

function makeLoadedPreferences(
  preferences: KataPreferences,
): LoadedKataPreferences {
  return {
    path: "/tmp/project/.kata/preferences.md",
    scope: "project",
    preferences,
  };
}

test("workflow helpers default to linear mode", () => {
  assert.equal(getWorkflowMode(null), "linear");
  assert.equal(isLinearMode(null), true);
  assert.equal(getLinearTeamId(null), null);
  assert.equal(getLinearTeamKey(null), null);
  assert.equal(getLinearProjectId(null), null);

  const config = loadEffectiveLinearProjectConfig(null);
  assert.equal(config.workflowMode, "linear");
  assert.equal(config.isLinearMode, true);
  assert.equal(config.path, null);
  assert.deepEqual(config.linear, {
    teamId: null,
    teamKey: null,
    projectId: null,
  });
});

test("workflow helpers read normalized Linear config from effective preferences", () => {
  const loaded = makeLoadedPreferences({
    workflow: { mode: "linear" },
    linear: {
      teamId: "team-123",
      teamKey: "KAT",
      projectId: "project-456",
    },
  });

  assert.equal(getWorkflowMode(loaded), "linear");
  assert.equal(isLinearMode(loaded), true);
  assert.equal(getLinearTeamId(loaded), "team-123");
  assert.equal(getLinearTeamKey(loaded), "KAT");
  assert.equal(getLinearProjectId(loaded), "project-456");

  assert.deepEqual(loadEffectiveLinearProjectConfig(loaded), {
    path: "/tmp/project/.kata/preferences.md",
    scope: "project",
    workflowMode: "linear",
    isLinearMode: true,
    linear: {
      teamId: "team-123",
      teamKey: "KAT",
      projectId: "project-456",
    },
  });
});

test("file mode preference is rejected with clear error", () => {
  const loaded = makeLoadedPreferences({ workflow: { mode: "file" as any } });
  assert.throws(
    () => loadEffectiveLinearProjectConfig(loaded),
    /File mode has been removed/i,
  );
});

test("validateLinearProjectConfig reports missing LINEAR_API_KEY", async () => {
  const result = await validateLinearProjectConfig({
    loadedPreferences: makeLoadedPreferences({
      workflow: { mode: "linear" },
      linear: { teamKey: "KAT" },
    }),
    apiKey: "",
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.ok, false);
  assert.equal(result.apiKeyPresent, false);
  assert.deepEqual(result.diagnostics, [
    {
      code: "missing_linear_api_key",
      field: "LINEAR_API_KEY",
      message: "LINEAR_API_KEY is required to validate Linear mode configuration.",
      retryable: false,
    },
  ]);
});

test("validateLinearProjectConfig reports missing team binding", async () => {
  const result = await validateLinearProjectConfig({
    loadedPreferences: makeLoadedPreferences({
      workflow: { mode: "linear" },
      linear: { projectId: "project-123" },
    }),
    apiKey: "linear-key",
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, [
    {
      code: "missing_linear_team",
      fields: ["linear.teamId", "linear.teamKey"],
      message: "Linear mode requires either linear.teamId or linear.teamKey.",
      retryable: false,
    },
  ]);
});

test("validateLinearProjectConfig reports invalid team resolution", async () => {
  const result = await validateLinearProjectConfig({
    loadedPreferences: makeLoadedPreferences({
      workflow: { mode: "linear" },
      linear: { teamKey: "KAT" },
    }),
    apiKey: "linear-key",
    createClient: () => ({
      getTeam: async () => null,
      getProject: async () => {
        throw new Error("getProject should not run when team resolution fails");
      },
    }),
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, [
    {
      code: "invalid_linear_team",
      field: "linear.teamKey",
      message: 'Configured Linear team could not be resolved: "KAT".',
      retryable: false,
    },
  ]);
});

test("validateLinearProjectConfig reports invalid project resolution", async () => {
  const result = await validateLinearProjectConfig({
    loadedPreferences: makeLoadedPreferences({
      workflow: { mode: "linear" },
      linear: { teamId: "team-123", projectId: "project-456" },
    }),
    apiKey: "linear-key",
    createClient: () => ({
      getTeam: async () => ({ id: "team-123", key: "KAT", name: "Kata" }),
      getProject: async () => null,
    }),
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.ok, false);
  assert.deepEqual(result.resolved.team, {
    id: "team-123",
    key: "KAT",
    name: "Kata",
  });
  assert.deepEqual(result.diagnostics, [
    {
      code: "invalid_linear_project",
      field: "linear.projectId",
      message: 'Configured Linear project could not be resolved: "project-456".',
      retryable: false,
    },
  ]);
});

test("validateLinearProjectConfig classifies auth failures", async () => {
  const result = await validateLinearProjectConfig({
    loadedPreferences: makeLoadedPreferences({
      workflow: { mode: "linear" },
      linear: { teamId: "team-123" },
    }),
    apiKey: "linear-key",
    createClient: () => ({
      getTeam: async () => {
        throw new LinearHttpError("Unauthorized", 401);
      },
      getProject: async () => null,
    }),
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, [
    {
      code: "linear_auth_error",
      field: "LINEAR_API_KEY",
      message:
        "HTTP 401: Invalid or missing Linear API key. Use secure_env_collect to set LINEAR_API_KEY.",
      retryable: false,
    },
  ]);
});

test("validateLinearProjectConfig classifies network failures", async () => {
  const result = await validateLinearProjectConfig({
    loadedPreferences: makeLoadedPreferences({
      workflow: { mode: "linear" },
      linear: { teamId: "team-123" },
    }),
    apiKey: "linear-key",
    createClient: () => ({
      getTeam: async () => {
        throw new TypeError("fetch failed");
      },
      getProject: async () => null,
    }),
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, [
    {
      code: "linear_network_error",
      message: "Network error: fetch failed",
      retryable: true,
    },
  ]);
});

test("validateLinearProjectConfig resolves live-ready team/project summaries without exposing api keys", async () => {
  const result = await validateLinearProjectConfig({
    loadedPreferences: makeLoadedPreferences({
      workflow: { mode: "linear" },
      linear: { teamKey: "KAT", projectId: "project-456" },
    }),
    apiKey: "super-secret-linear-key",
    createClient: () => ({
      getTeam: async () => ({ id: "team-123", key: "KAT", name: "Kata" }),
      getProject: async () => ({
        id: "project-456",
        name: "CLI",
        slugId: "cli",
        state: "started",
        url: "https://linear.app/kata/project/cli",
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-02T00:00:00.000Z",
      }),
    }),
  });

  assert.equal(result.status, "valid");
  assert.equal(result.ok, true);
  assert.equal(result.apiKeyPresent, true);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(JSON.stringify(result).includes("super-secret-linear-key"), false);
  assert.deepEqual(result.resolved, {
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
  });
});
