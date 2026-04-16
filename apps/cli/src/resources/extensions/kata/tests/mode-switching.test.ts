import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LoadedKataPreferences, KataPreferences } from "../preferences.ts";
import {
  getWorkflowEntrypointGuard,
  normalizeWorkflowMode,
  resolveWorkflowProtocol,
} from "../linear-config.ts";

function makeLoadedPreferences(
  preferences: KataPreferences,
): LoadedKataPreferences {
  return {
    path: "/tmp/project/.kata/preferences.md",
    scope: "project",
    preferences,
  };
}

function withWorkflowEnv<T>(
  env: Partial<Record<"KATA_WORKFLOW_PATH", string | undefined>>,
  run: () => T,
): T {
  const previous = {
    KATA_WORKFLOW_PATH: process.env.KATA_WORKFLOW_PATH,
  };

  if (env.KATA_WORKFLOW_PATH === undefined) {
    delete process.env.KATA_WORKFLOW_PATH;
  } else {
    process.env.KATA_WORKFLOW_PATH = env.KATA_WORKFLOW_PATH;
  }

  try {
    return run();
  } finally {
    if (previous.KATA_WORKFLOW_PATH === undefined) {
      delete process.env.KATA_WORKFLOW_PATH;
    } else {
      process.env.KATA_WORKFLOW_PATH = previous.KATA_WORKFLOW_PATH;
    }
  }
}

test("workflow mode resolves as linear", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mode-switching-"));
  const workflowPath = join(tmp, "KATA-WORKFLOW.md");
  writeFileSync(workflowPath, "# linear workflow\n", "utf-8");

  const loaded = makeLoadedPreferences({ workflow: { mode: "linear" } });

  withWorkflowEnv({ KATA_WORKFLOW_PATH: workflowPath }, () => {
    const protocol = resolveWorkflowProtocol(loaded);
    assert.deepEqual(protocol, {
      mode: "linear",
      documentName: "KATA-WORKFLOW.md",
      path: workflowPath,
      ready: true,
    });
  });
});

test("file mode throws a clear removal error", () => {
  assert.throws(
    () => normalizeWorkflowMode("file"),
    /File mode has been removed/i,
  );
});

test("default mode (unset) resolves to linear", () => {
  assert.equal(normalizeWorkflowMode(undefined), "linear");
  assert.equal(normalizeWorkflowMode(null), "linear");
});

test("github mode resolves correctly", () => {
  assert.equal(normalizeWorkflowMode("github"), "github");
  assert.equal(normalizeWorkflowMode("GitHub"), "github");
  assert.equal(normalizeWorkflowMode("  GITHUB  "), "github");
});

test("unknown mode throws with allowed values", () => {
  assert.throws(
    () => normalizeWorkflowMode("jira"),
    /Unsupported workflow\.mode "jira"/,
  );
});

test("linear mode entrypoint guards allow supported entrypoints", () => {
  const loaded = makeLoadedPreferences({ workflow: { mode: "linear" } });
  const supported = [
    "smart-entry",
    "discuss",
    "plan",
    "status",
    "dashboard",
    "auto",
    "system-prompt",
  ] as const;

  for (const entrypoint of supported) {
    const guard = getWorkflowEntrypointGuard(entrypoint, loaded);
    assert.equal(guard.mode, "linear", `${entrypoint}: mode`);
    assert.equal(guard.isLinearMode, true, `${entrypoint}: isLinearMode`);
    assert.equal(guard.allow, true, `${entrypoint}: allow`);
  }

  const queue = getWorkflowEntrypointGuard("queue", loaded);
  assert.equal(queue.allow, false, "queue remains blocked until Linear support lands");
});

test("github mode entrypoint guards allow supported entrypoints", () => {
  const loaded = makeLoadedPreferences({ workflow: { mode: "github" } });
  const supported = [
    "smart-entry",
    "discuss",
    "plan",
    "status",
    "dashboard",
    "system-prompt",
  ] as const;

  for (const entrypoint of supported) {
    const guard = getWorkflowEntrypointGuard(entrypoint, loaded);
    assert.equal(guard.mode, "github", `${entrypoint}: mode`);
    assert.equal(guard.isLinearMode, false, `${entrypoint}: isLinearMode`);
    assert.equal(guard.allow, true, `${entrypoint}: allow`);
  }

  const queue = getWorkflowEntrypointGuard("queue", loaded);
  assert.equal(queue.mode, "github", "queue: mode");
  assert.equal(queue.allow, false, "queue blocked in github mode");

  const plan = getWorkflowEntrypointGuard("plan", loaded);
  assert.equal(plan.mode, "github", "plan: mode");
  assert.equal(plan.allow, true, "plan enabled in github mode S02");

  const auto = getWorkflowEntrypointGuard("auto", loaded);
  assert.equal(auto.mode, "github", "auto: mode");
  assert.equal(auto.allow, false, "auto remains blocked in github mode S02");
});

test("github mode workflow protocol resolves correctly", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mode-github-"));
  const workflowPath = join(tmp, "KATA-WORKFLOW.md");
  writeFileSync(workflowPath, "# github workflow\n", "utf-8");

  const loaded = makeLoadedPreferences({ workflow: { mode: "github" } });

  withWorkflowEnv({ KATA_WORKFLOW_PATH: workflowPath }, () => {
    const protocol = resolveWorkflowProtocol(loaded);
    assert.deepEqual(protocol, {
      mode: "github",
      documentName: "KATA-WORKFLOW.md",
      path: workflowPath,
      ready: true,
    });
  });
});
