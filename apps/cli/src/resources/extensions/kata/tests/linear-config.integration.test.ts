import assert from "node:assert/strict";

import { LinearClient } from "../../linear/linear-client.ts";
import { validateLinearProjectConfig } from "../linear-config.ts";
import type { LoadedKataPreferences } from "../preferences.ts";

const API_KEY = process.env.LINEAR_API_KEY;

test(
  "validateLinearProjectConfig resolves a real Linear team by id and key",
  { skip: !API_KEY ? "LINEAR_API_KEY not set" : undefined },
  async () => {
    const client = new LinearClient(API_KEY!);
    const teams = await client.listTeams();
    assert.ok(teams.length > 0, "expected at least one Linear team");

    const loadedById: LoadedKataPreferences = {
      path: "/tmp/project/.kata/preferences.md",
      scope: "project",
      preferences: {
        workflow: { mode: "linear" },
        linear: { teamId: teams[0].id },
      },
    };

    const byId = await validateLinearProjectConfig({
      loadedPreferences: loadedById,
      apiKey: API_KEY!,
    });

    assert.equal(byId.status, "valid");
    assert.equal(byId.ok, true);
    assert.deepEqual(byId.diagnostics, []);
    assert.deepEqual(byId.resolved.team, {
      id: teams[0].id,
      key: teams[0].key,
      name: teams[0].name,
    });

    const loadedByKey: LoadedKataPreferences = {
      path: "/tmp/project/.kata/preferences.md",
      scope: "project",
      preferences: {
        workflow: { mode: "linear" },
        linear: { teamKey: teams[0].key },
      },
    };

    const byKey = await validateLinearProjectConfig({
      loadedPreferences: loadedByKey,
      apiKey: API_KEY!,
    });

    assert.equal(byKey.status, "valid");
    assert.equal(byKey.ok, true);
    assert.deepEqual(byKey.diagnostics, []);
    assert.deepEqual(byKey.resolved.team, {
      id: teams[0].id,
      key: teams[0].key,
      name: teams[0].name,
    });
  },
);

test(
  "validateLinearProjectConfig resolves a real Linear project when configured",
  { skip: !API_KEY ? "LINEAR_API_KEY not set" : undefined },
  async (t) => {
    const client = new LinearClient(API_KEY!);
    const teams = await client.listTeams();
    assert.ok(teams.length > 0, "expected at least one Linear team");

    // Fetch projects scoped to the first team so team and project are guaranteed
    // to be associated (avoids a test that passes with incompatible config).
    const projects = await client.listProjects({ teamId: teams[0].id, first: 25 });

    if (projects.length === 0) {
      t.skip("No Linear projects available for the first team in integration validation");
      return;
    }

    const loaded: LoadedKataPreferences = {
      path: "/tmp/project/.kata/preferences.md",
      scope: "project",
      preferences: {
        workflow: { mode: "linear" },
        linear: {
          teamId: teams[0].id,
          projectId: projects[0].id,
        },
      },
    };

    const result = await validateLinearProjectConfig({
      loadedPreferences: loaded,
      apiKey: API_KEY!,
    });

    assert.equal(result.status, "valid");
    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.resolved.project, {
      id: projects[0].id,
      name: projects[0].name,
      slugId: projects[0].slugId,
      state: projects[0].state,
      url: projects[0].url,
    });
  },
);
