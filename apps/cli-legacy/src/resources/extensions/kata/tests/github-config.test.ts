import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatGithubConfigStatus,
  loadGithubTrackerConfig,
  resetGithubTokenResolutionCacheForTests,
  resolveGithubToken,
  resolveGithubWorkflowPath,
  validateGithubConfig,
} from "../github-config.js";

function makeProjectDir(): string {
  return mkdtempSync(join(tmpdir(), "kata-gh-config-"));
}

function writePrefs(dir: string, yaml: string): string {
  const prefsDir = join(dir, ".kata");
  mkdirSync(prefsDir, { recursive: true });
  const path = join(prefsDir, "preferences.md");
  writeFileSync(path, yaml, "utf-8");
  return path;
}

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  const effectiveValues = {
    KATA_GITHUB_ENABLE_GH_CLI_FALLBACK:
      values.KATA_GITHUB_ENABLE_GH_CLI_FALLBACK ?? "0",
    ...values,
  };

  for (const [key, value] of Object.entries(effectiveValues)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetGithubTokenResolutionCacheForTests();
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetGithubTokenResolutionCacheForTests();
  }
}


test("resolveGithubWorkflowPath now points to .kata/preferences.md", () => {
  assert.equal(resolveGithubWorkflowPath("/project"), "/project/.kata/preferences.md");
});

test("loadGithubTrackerConfig returns missing_github_config when github block absent", () => {
  const dir = makeProjectDir();
  writePrefs(
    dir,
    ["---", "workflow:", "  mode: github", "---", ""].join("\n"),
  );

  const { config, diagnostic } = loadGithubTrackerConfig(undefined, dir);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "missing_github_config");
  assert.equal(diagnostic?.field, "github");
});

test("loadGithubTrackerConfig returns config from github preferences", () => {
  const dir = makeProjectDir();
  writePrefs(
    dir,
    [
      "---",
      "workflow:",
      "  mode: github",
      "github:",
      "  repoOwner: kata-sh",
      "  repoName: kata-mono",
      "  stateMode: projects_v2",
      "  githubProjectNumber: 7",
      "  labelPrefix: kata:",
      "---",
      "",
    ].join("\n"),
  );

  const { config, diagnostic } = loadGithubTrackerConfig(undefined, dir);
  assert.equal(diagnostic, null);
  assert.deepEqual(config, {
    repoOwner: "kata-sh",
    repoName: "kata-mono",
    stateMode: "projects_v2",
    githubProjectNumber: 7,
    labelPrefix: "kata:",
  });
});

test("loadGithubTrackerConfig validates repoOwner and repoName", () => {
  const dir = makeProjectDir();
  writePrefs(
    dir,
    [
      "---",
      "workflow:",
      "  mode: github",
      "github:",
      "  repoName: kata-mono",
      "---",
      "",
    ].join("\n"),
  );

  const missingOwner = loadGithubTrackerConfig(undefined, dir);
  assert.equal(missingOwner.diagnostic?.code, "missing_repo_owner");

  writePrefs(
    dir,
    [
      "---",
      "workflow:",
      "  mode: github",
      "github:",
      "  repoOwner: kata-sh",
      "---",
      "",
    ].join("\n"),
  );
  const missingName = loadGithubTrackerConfig(undefined, dir);
  assert.equal(missingName.diagnostic?.code, "missing_repo_name");
});

test("loadGithubTrackerConfig validates stateMode and githubProjectNumber", () => {
  const dir = makeProjectDir();

  const invalidState = loadGithubTrackerConfig(
    undefined,
    dir,
    {
      path: join(dir, ".kata", "preferences.md"),
      scope: "project",
      preferences: {
        workflow: { mode: "github" },
        github: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          stateMode: "invalid" as never,
        },
      },
    },
  );
  assert.equal(invalidState.diagnostic?.code, "invalid_state_mode");

  const invalidProjectNumber = loadGithubTrackerConfig(
    undefined,
    dir,
    {
      path: join(dir, ".kata", "preferences.md"),
      scope: "project",
      preferences: {
        workflow: { mode: "github" },
        github: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          githubProjectNumber: -1,
        },
      },
    },
  );
  assert.equal(invalidProjectNumber.diagnostic?.code, "invalid_github_project_number");

  const missingStateMode = loadGithubTrackerConfig(
    undefined,
    dir,
    {
      path: join(dir, ".kata", "preferences.md"),
      scope: "project",
      preferences: {
        workflow: { mode: "github" },
        github: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          githubProjectNumber: 5,
        },
      },
    },
  );
  assert.equal(missingStateMode.diagnostic?.code, "invalid_state_mode");

  const missingProjectNumber = loadGithubTrackerConfig(
    undefined,
    dir,
    {
      path: join(dir, ".kata", "preferences.md"),
      scope: "project",
      preferences: {
        workflow: { mode: "github" },
        github: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          stateMode: "projects_v2",
        },
      },
    },
  );
  assert.equal(missingProjectNumber.diagnostic?.code, "invalid_github_project_number");

});

test("loadGithubTrackerConfig rejects label mode explicitly", () => {
  const dir = makeProjectDir();

  const { config, diagnostic } = loadGithubTrackerConfig(
    undefined,
    dir,
    {
      path: join(dir, ".kata", "preferences.md"),
      scope: "project",
      preferences: {
        workflow: { mode: "github" },
        github: {
          repoOwner: "kata-sh",
          repoName: "kata-mono",
          stateMode: "labels" as never,
          githubProjectNumber: 5,
        },
      },
    },
  );

  assert.equal(config, null);
  assert.equal(diagnostic?.code, "invalid_state_mode");
  assert.match(diagnostic?.message ?? "", /no longer supported/i);
});

test("resolveGithubToken priority order", () => {
  withEnv(
    {
      KATA_GITHUB_TOKEN: "kata",
      GH_TOKEN: "gh",
      GITHUB_TOKEN: "github",
    },
    () => {
      const token = resolveGithubToken();
      assert.equal(token.token, "kata");
      assert.equal(token.source, "KATA_GITHUB_TOKEN");
    },
  );

  withEnv(
    {
      KATA_GITHUB_TOKEN: undefined,
      GH_TOKEN: "gh",
      GITHUB_TOKEN: "github",
    },
    () => {
      const token = resolveGithubToken();
      assert.equal(token.token, "gh");
      assert.equal(token.source, "GH_TOKEN");
    },
  );
});

test("resolveGithubToken prefers gh-cli fallback over auth.json and uses configured hostname", () => {
  const dir = makeProjectDir();
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({ github: { type: "api_key", key: "from-auth-json" } }, null, 2),
    "utf-8",
  );

  withEnv(
    {
      KATA_GITHUB_TOKEN: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
      KATA_GITHUB_ENABLE_GH_CLI_FALLBACK: "1",
      KATA_GITHUB_API_BASE_URL: "https://ghe.example.com/api/v3",
      KATA_TEST_GH_AUTH_TOKEN_OUTPUT: "from-gh",
    },
    () => {
      const resolved = resolveGithubToken(authPath);
      assert.equal(resolved.token, "from-gh");
      assert.equal(resolved.source, "gh auth token (ghe.example.com)");
    },
  );
});

test("resolveGithubToken falls back to auth.json when gh-cli fallback fails", () => {
  const dir = makeProjectDir();
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({ github: { type: "api_key", key: "from-auth-json" } }, null, 2),
    "utf-8",
  );

  withEnv(
    {
      KATA_GITHUB_TOKEN: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
      KATA_GITHUB_ENABLE_GH_CLI_FALLBACK: "1",
      KATA_TEST_GH_AUTH_TOKEN_OUTPUT: "__THROW__",
    },
    () => {
      const resolved = resolveGithubToken(authPath);
      assert.equal(resolved.token, "from-auth-json");
      assert.equal(resolved.source, "auth.json (github provider)");
    },
  );
});

test("resolveGithubToken caches unresolved gh-cli fallback results per host", () => {
  const dir = makeProjectDir();
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({ github: { type: "api_key", key: "from-auth-json" } }, null, 2),
    "utf-8",
  );

  withEnv(
    {
      KATA_GITHUB_TOKEN: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
      KATA_GITHUB_ENABLE_GH_CLI_FALLBACK: "1",
      KATA_TEST_GH_AUTH_TOKEN_OUTPUT: "__THROW__",
      KATA_GITHUB_API_BASE_URL: "https://ghe.example.com/api/v3",
    },
    () => {
      const first = resolveGithubToken(authPath);
      assert.equal(first.token, "from-auth-json");
      assert.equal(first.source, "auth.json (github provider)");

      process.env.KATA_TEST_GH_AUTH_TOKEN_OUTPUT = "from-gh";

      const second = resolveGithubToken(authPath);
      assert.equal(second.token, "from-auth-json");
      assert.equal(second.source, "auth.json (github provider)");
    },
  );
});

test("resolveGithubToken disables gh-cli fallback for false/no values", () => {
  const dir = makeProjectDir();
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({ github: { type: "api_key", key: "from-auth-json" } }, null, 2),
    "utf-8",
  );

  for (const disabled of ["false", "no"]) {
    withEnv(
      {
        KATA_GITHUB_TOKEN: undefined,
        GH_TOKEN: undefined,
        GITHUB_TOKEN: undefined,
        KATA_GITHUB_ENABLE_GH_CLI_FALLBACK: disabled,
        KATA_TEST_GH_AUTH_TOKEN_OUTPUT: "from-gh",
      },
      () => {
        const resolved = resolveGithubToken(authPath);
        assert.equal(resolved.token, "from-auth-json");
        assert.equal(resolved.source, "auth.json (github provider)");
      },
    );
  }
});

test("validateGithubConfig includes token and github diagnostics", () => {
  const dir = makeProjectDir();
  writePrefs(
    dir,
    [
      "---",
      "workflow:",
      "  mode: github",
      "github:",
      "  repoOwner: kata-sh",
      "---",
      "",
    ].join("\n"),
  );

  const result = withEnv(
    {
      KATA_GITHUB_TOKEN: undefined,
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
    },
    () =>
      validateGithubConfig({
        basePath: dir,
        authFilePath: join(dir, "missing-auth.json"),
      }),
  );

  assert.equal(result.ok, false);
  const codes = result.diagnostics.map((d) => d.code);
  assert.ok(codes.includes("missing_repo_name"));
  assert.ok(codes.includes("missing_github_token"));
});

test("validateGithubConfig succeeds with github prefs + token", () => {
  const dir = makeProjectDir();
  writePrefs(
    dir,
    [
      "---",
      "workflow:",
      "  mode: github",
      "github:",
      "  repoOwner: kata-sh",
      "  repoName: kata-mono",
      "  stateMode: projects_v2",
      "  githubProjectNumber: 7",
      "---",
      "",
    ].join("\n"),
  );

  const result = withEnv(
    {
      KATA_GITHUB_TOKEN: "token",
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
    },
    () =>
      validateGithubConfig({
        basePath: dir,
        authFilePath: join(dir, "missing-auth.json"),
      }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.trackerConfig?.repoOwner, "kata-sh");
  assert.equal(result.trackerConfig?.repoName, "kata-mono");
});

test("formatGithubConfigStatus renders github.* lines", () => {
  const report = formatGithubConfigStatus({
    ok: false,
    status: "invalid",
    mode: "github",
    tokenPresent: false,
    tokenSource: null,
    trackerConfig: {
      repoOwner: "kata-sh",
      repoName: "kata-mono",
      stateMode: "projects_v2",
      githubProjectNumber: 7,
      labelPrefix: "kata:",
    },
    diagnostics: [
      {
        code: "missing_github_token",
        message: "missing token",
        field: "KATA_GITHUB_TOKEN",
        retryable: false,
      },
    ],
  });

  assert.equal(report.level, "warning");
  assert.ok(report.lines.some((line) => line.startsWith("github.repo:")));
  assert.ok(report.lines.some((line) => line.startsWith("github.state_mode:")));
  assert.ok(report.lines.some((line) => line.startsWith("action:")));
});
