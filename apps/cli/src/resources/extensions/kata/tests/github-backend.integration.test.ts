import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBackend } from "../backend-factory.ts";

function makeWorkspace(contents: { workflow: string; prefs?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "kata-github-backend-"));
  mkdirSync(join(dir, ".kata"), { recursive: true });
  writeFileSync(
    join(dir, ".kata", "preferences.md"),
    contents.prefs ?? "---\nworkflow:\n  mode: github\n---\n",
    "utf-8",
  );
  writeFileSync(join(dir, "WORKFLOW.md"), contents.workflow, "utf-8");
  return dir;
}

function withEnv<T>(
  vars: Partial<Record<string, string | undefined>>,
  run: () => Promise<T> | T,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

function startMockGithubServer(): Promise<{ server: Server; baseUrl: string }> {
  const pages: Record<string, unknown> = {
    "1": [
      {
        number: 101,
        title: "[M009] GitHub Backend Parity",
        state: "open",
        labels: [{ name: "kata:milestone" }],
      },
      {
        number: 102,
        title: "[S01] CLI GitHub Workflow Mode Bootstrap",
        state: "open",
        labels: [{ name: "kata:slice" }, { name: "kata:executing" }],
      },
      {
        number: 103,
        title: "[T04] Wire /kata surfaces",
        state: "open",
        labels: [{ name: "kata:task" }],
        body: "Tracking implementation for slice S01",
      },
    ],
    "2": [],
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.endsWith("/issues")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "not found" }));
      return;
    }

    const page = url.searchParams.get("page") ?? "1";
    const payload = pages[page] ?? [];

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock GitHub server failed to bind"));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

const WORKFLOW = `---
tracker:
  kind: github
  repo_owner: acme
  repo_name: demo
  label_prefix: kata:
---
# Workflow
`;

test("createBackend boots GitHub mode and derives active refs", async () => {
  const workspace = makeWorkspace({ workflow: WORKFLOW });
  const { server, baseUrl } = await startMockGithubServer();

  try {
    await withEnv(
      {
        KATA_GITHUB_TOKEN: "ghp_test_token",
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
        KATA_GITHUB_API_BASE_URL: baseUrl,
        KATA_GITHUB_WORKFLOW_PATH: undefined,
      },
      async () => {
        const backend = await createBackend(workspace);
        await backend.bootstrap();

        const state = await backend.deriveState();
        assert.equal(backend.isLinearMode, false);
        assert.equal(state.phase, "executing");
        assert.equal(state.activeMilestone?.id, "M009");
        assert.equal(state.activeSlice?.id, "S01");
        assert.equal(state.activeTask?.id, "T04");

        const dashboard = await backend.loadDashboardData();
        assert.equal(dashboard.state.phase, "executing");
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("createBackend returns actionable diagnostics when GitHub token is missing", async () => {
  const workspace = makeWorkspace({ workflow: WORKFLOW });

  try {
    await withEnv(
      {
        KATA_GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
        KATA_GITHUB_API_BASE_URL: undefined,
        KATA_GITHUB_WORKFLOW_PATH: undefined,
      },
      async () => {
        await assert.rejects(
          async () => createBackend(workspace),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /GitHub backend is not ready/);
            assert.match(err.message, /diagnostic: missing_github_token/);
            assert.match(err.message, /action: set KATA_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN/);
            assert.match(err.message, /\/kata prefs status/);
            return true;
          },
        );
      },
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("runtime smoke: GitHub backend derives state against real GitHub API when token is available", async () => {
  const tokenPresent =
    Boolean(process.env.KATA_GITHUB_TOKEN) ||
    Boolean(process.env.GH_TOKEN) ||
    Boolean(process.env.GITHUB_TOKEN);

  if (!tokenPresent) {
    return;
  }

  const workspace = makeWorkspace({
    workflow: `---
tracker:
  kind: github
  repo_owner: gannonh
  repo_name: kata
  label_prefix: kata:
---
# Runtime smoke
`,
  });

  try {
    await withEnv(
      {
        KATA_GITHUB_API_BASE_URL: undefined,
        KATA_GITHUB_WORKFLOW_PATH: undefined,
      },
      async () => {
        const backend = await createBackend(workspace);
        const state = await backend.deriveState();

        assert.ok(state.phase.length > 0, "phase should be present");
        assert.ok(Array.isArray(state.registry), "registry should be present");
      },
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
