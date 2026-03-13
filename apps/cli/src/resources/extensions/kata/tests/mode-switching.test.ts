import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LoadedKataPreferences, KataPreferences } from "../preferences.ts";
import {
  getWorkflowEntrypointGuard,
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
  env: Partial<Record<"KATA_WORKFLOW_PATH" | "LINEAR_WORKFLOW_PATH", string | undefined>>,
  run: () => T,
): T {
  const previous = {
    KATA_WORKFLOW_PATH: process.env.KATA_WORKFLOW_PATH,
    LINEAR_WORKFLOW_PATH: process.env.LINEAR_WORKFLOW_PATH,
  };

  if (env.KATA_WORKFLOW_PATH === undefined) {
    delete process.env.KATA_WORKFLOW_PATH;
  } else {
    process.env.KATA_WORKFLOW_PATH = env.KATA_WORKFLOW_PATH;
  }

  if (env.LINEAR_WORKFLOW_PATH === undefined) {
    delete process.env.LINEAR_WORKFLOW_PATH;
  } else {
    process.env.LINEAR_WORKFLOW_PATH = env.LINEAR_WORKFLOW_PATH;
  }

  try {
    return run();
  } finally {
    if (previous.KATA_WORKFLOW_PATH === undefined) {
      delete process.env.KATA_WORKFLOW_PATH;
    } else {
      process.env.KATA_WORKFLOW_PATH = previous.KATA_WORKFLOW_PATH;
    }

    if (previous.LINEAR_WORKFLOW_PATH === undefined) {
      delete process.env.LINEAR_WORKFLOW_PATH;
    } else {
      process.env.LINEAR_WORKFLOW_PATH = previous.LINEAR_WORKFLOW_PATH;
    }
  }
}

test("file mode remains the default and resolves KATA-WORKFLOW.md", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kata-mode-switching-"));
  const workflowPath = join(tmp, "KATA-WORKFLOW.md");
  writeFileSync(workflowPath, "# file workflow\n", "utf-8");

  withWorkflowEnv(
    {
      KATA_WORKFLOW_PATH: workflowPath,
      LINEAR_WORKFLOW_PATH: undefined,
    },
    () => {
      const protocol = resolveWorkflowProtocol(null);
      assert.deepEqual(protocol, {
        mode: "file",
        documentName: "KATA-WORKFLOW.md",
        path: workflowPath,
        ready: true,
      });

      const guard = getWorkflowEntrypointGuard("smart-entry", null);
      assert.equal(guard.mode, "file");
      assert.equal(guard.allow, true);
      assert.equal(guard.notice, null);
      assert.equal(guard.protocol.documentName, "KATA-WORKFLOW.md");
      assert.equal(guard.protocol.path, workflowPath);
    },
  );
});

test("linear mode selects LINEAR-WORKFLOW.md and blocks unsupported entrypoints (status and auto now allowed)", () => {
  const loaded = makeLoadedPreferences({
    workflow: { mode: "linear" },
    linear: { teamKey: "KAT" },
  });
  const tmp = mkdtempSync(join(tmpdir(), "kata-mode-switching-"));
  const missingLinearWorkflow = join(tmp, "LINEAR-WORKFLOW.md");

  withWorkflowEnv(
    {
      LINEAR_WORKFLOW_PATH: missingLinearWorkflow,
      KATA_WORKFLOW_PATH: join(tmp, "KATA-WORKFLOW.md"),
    },
    () => {
      const protocol = resolveWorkflowProtocol(loaded);
      assert.deepEqual(protocol, {
        mode: "linear",
        documentName: "LINEAR-WORKFLOW.md",
        path: null,
        ready: false,
      });

      const smartEntry = getWorkflowEntrypointGuard("smart-entry", loaded);
      assert.equal(smartEntry.allow, false);
      assert.equal(smartEntry.mode, "linear");
      assert.match(smartEntry.notice ?? "", /silently falling back to \.kata files/i);

      const status = getWorkflowEntrypointGuard("status", loaded);
      assert.equal(status.allow, true);
      assert.match(status.notice ?? "", /live progress/i);

      const auto = getWorkflowEntrypointGuard("auto", loaded);
      assert.equal(auto.allow, true);
      assert.match(auto.notice ?? "", /linear mode/i);
    },
  );
});

test("system prompt wiring stays mode-aware and becomes ready when LINEAR-WORKFLOW.md exists", () => {
  const loaded = makeLoadedPreferences({
    workflow: { mode: "linear" },
    linear: { teamId: "team-123" },
  });
  const tmp = mkdtempSync(join(tmpdir(), "kata-mode-switching-"));
  const linearWorkflowPath = join(tmp, "LINEAR-WORKFLOW.md");
  writeFileSync(linearWorkflowPath, "# linear workflow\n", "utf-8");

  withWorkflowEnv(
    {
      LINEAR_WORKFLOW_PATH: linearWorkflowPath,
      KATA_WORKFLOW_PATH: undefined,
    },
    () => {
      const guard = getWorkflowEntrypointGuard("system-prompt", loaded);
      assert.equal(guard.allow, true);
      assert.equal(guard.mode, "linear");
      assert.equal(guard.protocol.ready, true);
      assert.equal(guard.protocol.path, linearWorkflowPath);
      assert.match(guard.notice ?? "", /Prefer LINEAR-WORKFLOW\.md/i);
      assert.match(guard.notice ?? "", /Do not silently fall back to KATA-WORKFLOW\.md/i);
    },
  );
});
