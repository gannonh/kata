import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBackend } from "../backend-factory.ts";

function makeWorkspace(workflowContent?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "kata-github-config-int-"));
  mkdirSync(join(dir, ".kata"), { recursive: true });
  writeFileSync(join(dir, ".kata", "preferences.md"), "---\nworkflow:\n  mode: github\n---\n", "utf-8");
  if (workflowContent !== undefined) {
    writeFileSync(join(dir, "WORKFLOW.md"), workflowContent, "utf-8");
  }
  return dir;
}

function withEnv<T>(vars: Partial<Record<string, string | undefined>>, run: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("github backend init surfaces missing token diagnostics without secret leakage", async () => {
  const workspace = makeWorkspace(`---
tracker:
  kind: github
  repo_owner: kata-sh
  repo_name: kata-mono
---
# Workflow
`);

  try {
    await withEnv(
      {
        KATA_GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
      },
      async () => {
        await assert.rejects(
          async () => createBackend(workspace),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /missing_github_token/);
            assert.match(error.message, /KATA_GITHUB_TOKEN|GH_TOKEN|GITHUB_TOKEN/);
            assert.doesNotMatch(error.message, /ghp_[a-z0-9]+/i);
            return true;
          },
        );
      },
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("github backend init surfaces missing tracker config diagnostics", async () => {
  const workspace = makeWorkspace(`---
tracker:
  kind: github
  repo_owner: kata-sh
---
# Workflow
`);

  try {
    await withEnv(
      {
        KATA_GITHUB_TOKEN: "token-present",
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
      },
      async () => {
        await assert.rejects(
          async () => createBackend(workspace),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /missing_repo_name/);
            assert.match(error.message, /tracker\.repo_name/);
            return true;
          },
        );
      },
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
