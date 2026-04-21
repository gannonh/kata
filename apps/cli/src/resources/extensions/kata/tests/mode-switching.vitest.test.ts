import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { LoadedKataPreferences, KataPreferences } from "../preferences.ts";
import {
  getWorkflowEntrypointGuard,
  normalizeWorkflowMode,
  resolveWorkflowProtocol,
} from "../linear-config.ts";

function makeLoadedPreferences(preferences: KataPreferences): LoadedKataPreferences {
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

describe("workflow mode switching", () => {
  it("workflow mode resolves as linear", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-mode-switching-"));
    const workflowPath = join(tmp, "KATA-WORKFLOW.md");
    writeFileSync(workflowPath, "# linear workflow\n", "utf-8");

    const loaded = makeLoadedPreferences({ workflow: { mode: "linear" } });

    withWorkflowEnv({ KATA_WORKFLOW_PATH: workflowPath }, () => {
      const protocol = resolveWorkflowProtocol(loaded);
      expect(protocol).toEqual({
        mode: "linear",
        documentName: "KATA-WORKFLOW.md",
        path: workflowPath,
        ready: true,
      });
    });
  });

  it("file mode throws a clear removal error", () => {
    expect(() => normalizeWorkflowMode("file")).toThrow(/File mode has been removed/i);
  });

  it("default mode (unset) resolves to linear", () => {
    expect(normalizeWorkflowMode(undefined)).toBe("linear");
    expect(normalizeWorkflowMode(null)).toBe("linear");
  });

  it("github mode resolves correctly", () => {
    expect(normalizeWorkflowMode("github")).toBe("github");
    expect(normalizeWorkflowMode("GitHub")).toBe("github");
    expect(normalizeWorkflowMode("  GITHUB  ")).toBe("github");
  });

  it("unknown mode throws with allowed values", () => {
    expect(() => normalizeWorkflowMode("jira")).toThrow(/Unsupported workflow\.mode "jira"/);
  });

  it("linear mode entrypoint guards allow supported entrypoints", () => {
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
      expect(guard.mode, `${entrypoint}: mode`).toBe("linear");
      expect(guard.isLinearMode, `${entrypoint}: isLinearMode`).toBe(true);
      expect(guard.allow, `${entrypoint}: allow`).toBe(true);
    }

  });

  it("github mode entrypoint guards allow supported entrypoints", () => {
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
      expect(guard.mode, `${entrypoint}: mode`).toBe("github");
      expect(guard.isLinearMode, `${entrypoint}: isLinearMode`).toBe(false);
      expect(guard.allow, `${entrypoint}: allow`).toBe(true);
    }

    const plan = getWorkflowEntrypointGuard("plan", loaded);
    expect(plan.mode, "plan: mode").toBe("github");
    expect(plan.allow, "plan enabled in github mode S02").toBe(true);

    const auto = getWorkflowEntrypointGuard("auto", loaded);
    expect(auto.mode, "auto: mode").toBe("github");
    expect(auto.allow, "auto remains blocked in github mode S02").toBe(false);
  });

  it("github mode workflow protocol resolves correctly", () => {
    const tmp = mkdtempSync(join(tmpdir(), "kata-mode-github-"));
    const workflowPath = join(tmp, "KATA-WORKFLOW.md");
    writeFileSync(workflowPath, "# github workflow\n", "utf-8");

    const loaded = makeLoadedPreferences({ workflow: { mode: "github" } });

    withWorkflowEnv({ KATA_WORKFLOW_PATH: workflowPath }, () => {
      const protocol = resolveWorkflowProtocol(loaded);
      expect(protocol).toEqual({
        mode: "github",
        documentName: "KATA-WORKFLOW.md",
        path: workflowPath,
        ready: true,
      });
    });
  });
});
