import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createBackend } from "../backend-factory.ts";

function makeWorkspace(githubBlock?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "kata-github-config-int-"));
  mkdirSync(join(dir, ".kata"), { recursive: true });
  const lines = ["---", "workflow:", "  mode: github"];
  if (githubBlock) lines.push(...githubBlock.trim().split(/\r?\n/));
  lines.push("---", "");
  writeFileSync(join(dir, ".kata", "preferences.md"), lines.join("\n"), "utf-8");
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

describe("github backend config integration", () => {
  it("surfaces missing token diagnostics without secret leakage", async () => {
    const workspace = makeWorkspace(`github:
  repoOwner: kata-sh
  repoName: kata-mono`);

    try {
      await withEnv(
        {
          KATA_GITHUB_TOKEN: undefined,
          GH_TOKEN: undefined,
          GITHUB_TOKEN: undefined,
          HOME: workspace,
        },
        async () => {
          let errorMessage = "";
          try {
            await createBackend(workspace);
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
          }

          expect(errorMessage).toMatch(/missing_github_token/);
          expect(errorMessage).toMatch(/KATA_GITHUB_TOKEN|GH_TOKEN|GITHUB_TOKEN/);
          expect(errorMessage).not.toMatch(/ghp_[a-z0-9]+/i);
        },
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces missing tracker config diagnostics", async () => {
    const workspace = makeWorkspace(`github:
  repoOwner: kata-sh`);

    try {
      await withEnv(
        {
          KATA_GITHUB_TOKEN: "token-present",
          GH_TOKEN: undefined,
          GITHUB_TOKEN: undefined,
        },
        async () => {
          let errorMessage = "";
          try {
            await createBackend(workspace);
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : String(error);
          }

          expect(errorMessage).toMatch(/missing_repo_name/);
          expect(errorMessage).toMatch(/github\.repoName/);
        },
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
