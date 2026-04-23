import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBackend } from "../backend-factory.ts";

function makeWorkspace(contents: { github: string; prefs?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "kata-github-backend-"));
  mkdirSync(join(dir, ".kata"), { recursive: true });
  writeFileSync(
    join(dir, ".kata", "preferences.md"),
    contents.prefs ?? `---\nworkflow:\n  mode: github\n${contents.github}\n---\n`,
    "utf-8",
  );
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

function startDeepPaginationMockGithubServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.endsWith("/issues")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "not found" }));
      return;
    }

    const page = Number(url.searchParams.get("page") ?? "1");
    let payload: Array<Record<string, unknown>> = [];

    if (page >= 1 && page <= 11) {
      payload = Array.from({ length: 100 }, (_, idx) => ({
        number: page * 1000 + idx,
        title: `Noise issue ${page}-${idx}`,
        state: "open",
        labels: [{ name: "kata:task" }],
      }));
    } else if (page === 12) {
      payload = [
        {
          number: 999999,
          title: "[M123] Deep pagination milestone",
          state: "open",
          labels: [{ name: "kata:milestone" }],
        },
      ];
    }

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

function startSlowGithubServer(delayMs: number): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.endsWith("/issues")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "not found" }));
      return;
    }

    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([]));
    }, delayMs);
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

const GITHUB = `github:
  repoOwner: acme
  repoName: demo
  labelPrefix: kata:
`;

test("createBackend boots GitHub mode and derives active refs", async () => {
  const workspace = makeWorkspace({ github: GITHUB });
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
  const workspace = makeWorkspace({ github: GITHUB });

  try {
    await withEnv(
      {
        KATA_GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
        KATA_GITHUB_ENABLE_GH_CLI_FALLBACK: "0",
        KATA_GITHUB_API_BASE_URL: undefined,
        KATA_GITHUB_WORKFLOW_PATH: undefined,
        HOME: workspace,
      },
      async () => {
        await assert.rejects(
          async () => createBackend(workspace),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /GitHub backend is not ready/);
            assert.match(err.message, /diagnostic: missing_github_token/);
            assert.match(
              err.message,
              /action: set KATA_GITHUB_TOKEN\/GH_TOKEN\/GITHUB_TOKEN/,
            );
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

test("createBackend fetches beyond 10 pages when GitHub issues exceed 1000", async () => {
  const workspace = makeWorkspace({ github: GITHUB });
  const { server, baseUrl } = await startDeepPaginationMockGithubServer();

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
        const state = await backend.deriveState();

        assert.equal(state.activeMilestone?.id, "M123");
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("createBackend surfaces timeout diagnostics when GitHub API calls hang", async () => {
  const workspace = makeWorkspace({ github: GITHUB });
  const { server, baseUrl } = await startSlowGithubServer(150);

  try {
    await withEnv(
      {
        KATA_GITHUB_TOKEN: "ghp_test_token",
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
        KATA_GITHUB_API_BASE_URL: baseUrl,
        KATA_GITHUB_API_TIMEOUT_MS: "10",
        KATA_GITHUB_WORKFLOW_PATH: undefined,
      },
      async () => {
        const backend = await createBackend(workspace);
        await assert.rejects(
          async () => backend.deriveState(),
          (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.match(err.message, /timed out after 10ms/);
            return true;
          },
        );
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("runtime smoke: GitHub backend derives state against real GitHub API when token is available", async () => {
  const optedIn = process.env.KATA_GITHUB_SMOKE === "1";
  const tokenPresent =
    Boolean(process.env.KATA_GITHUB_TOKEN) ||
    Boolean(process.env.GH_TOKEN) ||
    Boolean(process.env.GITHUB_TOKEN);

  if (!optedIn || !tokenPresent) {
    return;
  }

  const workspace = makeWorkspace({
    github: `github:\n  repoOwner: gannonh\n  repoName: kata\n  labelPrefix: kata:\n`,
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
