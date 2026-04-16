/**
 * Tests for github-config.ts
 *
 * Covers:
 * - WORKFLOW.md parsing (valid, missing, malformed, wrong kind, missing required fields)
 * - Token resolution order (KATA_GITHUB_TOKEN > GH_TOKEN > GITHUB_TOKEN > auth.json)
 * - Full validation result (ok/invalid, diagnostics, tokenPresent, trackerConfig)
 * - formatGithubConfigStatus output
 * - Redaction: token values never appear in diagnostic output
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after, beforeEach, afterEach } from "node:test";

import {
  loadGithubTrackerConfig,
  resolveGithubToken,
  validateGithubConfig,
  formatGithubConfigStatus,
  resolveGithubWorkflowPath,
} from "../github-config.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "kata-github-config-"));
}

function writeWorkflowMd(dir: string, content: string): string {
  const path = join(dir, "WORKFLOW.md");
  writeFileSync(path, content, "utf-8");
  return path;
}

function makeValidWorkflowMd(extras: Record<string, string> = {}): string {
  const extraLines = Object.entries(extras)
    .map(([k, v]) => `    ${k}: ${v}`)
    .join("\n");
  return `---\ntracker:\n  kind: github\n  repo_owner: kata-sh\n  repo_name: kata-mono${extraLines ? "\n" + extraLines : ""}\n---\n# Project\n`;
}

/** Save and restore env vars across a test. */
function withEnv<T>(
  vars: Partial<Record<string, string | undefined>>,
  fn: () => T,
): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

// Save env vars that could bleed from the host environment
let savedEnv: Record<string, string | undefined> = {};

before(() => {
  for (const k of ["KATA_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN", "KATA_GITHUB_WORKFLOW_PATH"]) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

after(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

// ─── resolveGithubWorkflowPath ────────────────────────────────────────────────

test("resolveGithubWorkflowPath uses KATA_GITHUB_WORKFLOW_PATH when set", () => {
  withEnv({ KATA_GITHUB_WORKFLOW_PATH: "/override/WORKFLOW.md" }, () => {
    assert.equal(resolveGithubWorkflowPath("/some/dir"), "/override/WORKFLOW.md");
  });
});

test("resolveGithubWorkflowPath falls back to basePath/WORKFLOW.md", () => {
  withEnv({ KATA_GITHUB_WORKFLOW_PATH: undefined }, () => {
    assert.equal(resolveGithubWorkflowPath("/project"), "/project/WORKFLOW.md");
  });
});

// ─── loadGithubTrackerConfig ──────────────────────────────────────────────────

test("loadGithubTrackerConfig returns config for valid minimal WORKFLOW.md", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(dir, makeValidWorkflowMd());

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(diagnostic, null);
  assert.deepEqual(config, {
    repoOwner: "kata-sh",
    repoName: "kata-mono",
    stateMode: "labels",
  });
});

test("loadGithubTrackerConfig includes githubProjectNumber and keeps label-based stateMode", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(
    dir,
    makeValidWorkflowMd({ github_project_number: "42" }),
  );

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(diagnostic, null);
  assert.deepEqual(config, {
    repoOwner: "kata-sh",
    repoName: "kata-mono",
    stateMode: "labels",
    githubProjectNumber: 42,
  });
});

test("loadGithubTrackerConfig includes optional labelPrefix", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(dir, makeValidWorkflowMd({ label_prefix: "kata:" }));

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(diagnostic, null);
  assert.equal(config?.labelPrefix, "kata:");
});

test("loadGithubTrackerConfig returns missing_workflow_file when WORKFLOW.md absent", () => {
  const { config, diagnostic } = loadGithubTrackerConfig("/nonexistent/path/WORKFLOW.md");
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "missing_workflow_file");
  assert.equal(diagnostic?.retryable, false);
});

test("loadGithubTrackerConfig returns invalid_workflow_file for missing frontmatter", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(dir, "# No frontmatter here\n");

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "invalid_workflow_file");
});

test("loadGithubTrackerConfig returns unsupported_tracker_kind when tracker block is absent", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(dir, "---\nversion: 1\n---\n# no tracker\n");

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "unsupported_tracker_kind");
});

test("loadGithubTrackerConfig returns unsupported_tracker_kind when kind is not github", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(
    dir,
    "---\ntracker:\n  kind: linear\n  repo_owner: kata-sh\n  repo_name: kata-mono\n---\n",
  );

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "unsupported_tracker_kind");
  assert.equal(diagnostic?.field, "tracker.kind");
});

test("loadGithubTrackerConfig returns missing_repo_owner when repo_owner absent", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(
    dir,
    "---\ntracker:\n  kind: github\n  repo_name: kata-mono\n---\n",
  );

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "missing_repo_owner");
  assert.equal(diagnostic?.field, "tracker.repo_owner");
});

test("loadGithubTrackerConfig returns missing_repo_name when repo_name absent", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(
    dir,
    "---\ntracker:\n  kind: github\n  repo_owner: kata-sh\n---\n",
  );

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "missing_repo_name");
  assert.equal(diagnostic?.field, "tracker.repo_name");
});

test("loadGithubTrackerConfig returns invalid_github_project_number for non-integer value", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(
    dir,
    makeValidWorkflowMd({ github_project_number: "not-a-number" }),
  );

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "invalid_github_project_number");
});

test("loadGithubTrackerConfig returns invalid_github_project_number for zero", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(dir, makeValidWorkflowMd({ github_project_number: "0" }));

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "invalid_github_project_number");
});

test("loadGithubTrackerConfig returns invalid_github_project_number for negative value", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(dir, makeValidWorkflowMd({ github_project_number: "-5" }));

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(config, null);
  assert.equal(diagnostic?.code, "invalid_github_project_number");
});

test("loadGithubTrackerConfig handles KATA_GITHUB_WORKFLOW_PATH env override", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(dir, makeValidWorkflowMd());

  withEnv({ KATA_GITHUB_WORKFLOW_PATH: path }, () => {
    // No explicit path passed — relies on env var
    const { config, diagnostic } = loadGithubTrackerConfig(undefined, "/wrong/basepath");
    assert.equal(diagnostic, null);
    assert.equal(config?.repoOwner, "kata-sh");
  });
});

test("loadGithubTrackerConfig strips YAML inline comments and quotes", () => {
  const dir = makeTmpDir();
  const path = writeWorkflowMd(
    dir,
    '---\ntracker:\n  kind: "github"\n  repo_owner: "kata-sh" # org\n  repo_name: kata-mono\n---\n',
  );

  const { config, diagnostic } = loadGithubTrackerConfig(path);
  assert.equal(diagnostic, null);
  assert.equal(config?.repoOwner, "kata-sh");
  assert.equal(config?.repoName, "kata-mono");
});

// ─── resolveGithubToken ───────────────────────────────────────────────────────

test("resolveGithubToken returns KATA_GITHUB_TOKEN with correct source", () => {
  withEnv(
    { KATA_GITHUB_TOKEN: "secret-kata", GH_TOKEN: "secret-gh", GITHUB_TOKEN: "secret-github" },
    () => {
      const { token, source } = resolveGithubToken("/nonexistent/auth.json");
      assert.equal(token, "secret-kata");
      assert.equal(source, "KATA_GITHUB_TOKEN");
    },
  );
});

test("resolveGithubToken falls through to GH_TOKEN when KATA_GITHUB_TOKEN absent", () => {
  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: "secret-gh", GITHUB_TOKEN: "secret-github" },
    () => {
      const { token, source } = resolveGithubToken("/nonexistent/auth.json");
      assert.equal(token, "secret-gh");
      assert.equal(source, "GH_TOKEN");
    },
  );
});

test("resolveGithubToken falls through to GITHUB_TOKEN when both KATA and GH absent", () => {
  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: "secret-github" },
    () => {
      const { token, source } = resolveGithubToken("/nonexistent/auth.json");
      assert.equal(token, "secret-github");
      assert.equal(source, "GITHUB_TOKEN");
    },
  );
});

test("resolveGithubToken reads auth.json github provider when all env vars absent", () => {
  const dir = makeTmpDir();
  const authPath = join(dir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({ github: { type: "api_key", key: "secret-from-auth" } }),
    "utf-8",
  );

  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const { token, source } = resolveGithubToken(authPath);
      assert.equal(token, "secret-from-auth");
      assert.equal(source, "auth.json (github provider)");
    },
  );
});

test("resolveGithubToken returns null when no sources available", () => {
  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const { token, source } = resolveGithubToken("/nonexistent/auth.json");
      assert.equal(token, null);
      assert.equal(source, null);
    },
  );
});

test("resolveGithubToken returns null when auth.json exists but is malformed", () => {
  const dir = makeTmpDir();
  const authPath = join(dir, "auth.json");
  writeFileSync(authPath, "{not-valid-json", "utf-8");

  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const { token, source } = resolveGithubToken(authPath);
      assert.equal(token, null);
      assert.equal(source, null);
    },
  );
});

// ─── validateGithubConfig ─────────────────────────────────────────────────────

test("validateGithubConfig returns ok:true when token and tracker config are valid", () => {
  const dir = makeTmpDir();
  const wfPath = writeWorkflowMd(dir, makeValidWorkflowMd());

  withEnv({ KATA_GITHUB_TOKEN: "secret", GH_TOKEN: undefined, GITHUB_TOKEN: undefined }, () => {
    const result = validateGithubConfig({
      workflowPath: wfPath,
      authFilePath: "/nonexistent/auth.json",
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "valid");
    assert.equal(result.tokenPresent, true);
    assert.equal(result.tokenSource, "KATA_GITHUB_TOKEN");
    assert.ok(result.trackerConfig);
    assert.equal(result.diagnostics.length, 0);
  });
});

test("validateGithubConfig collects both tracker and token diagnostics", () => {
  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const result = validateGithubConfig({
        workflowPath: "/nonexistent/WORKFLOW.md",
        authFilePath: "/nonexistent/auth.json",
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, "invalid");
      assert.equal(result.tokenPresent, false);

      const codes = result.diagnostics.map((d) => d.code);
      assert.ok(codes.includes("missing_workflow_file"), "missing_workflow_file expected");
      assert.ok(codes.includes("missing_github_token"), "missing_github_token expected");
    },
  );
});

test("validateGithubConfig reports only token diagnostic when tracker config is valid", () => {
  const dir = makeTmpDir();
  const wfPath = writeWorkflowMd(dir, makeValidWorkflowMd());

  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const result = validateGithubConfig({
        workflowPath: wfPath,
        authFilePath: "/nonexistent/auth.json",
      });
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics.length, 1);
      assert.equal(result.diagnostics[0]?.code, "missing_github_token");
      assert.ok(result.trackerConfig); // tracker parsed successfully
    },
  );
});

// ─── Redaction check ──────────────────────────────────────────────────────────

test("token values never appear in diagnostic messages (redaction)", () => {
  const secretToken = "ghp_super_secret_value_12345";
  const dir = makeTmpDir();
  const wfPath = writeWorkflowMd(dir, makeValidWorkflowMd());

  withEnv(
    { KATA_GITHUB_TOKEN: secretToken, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const result = validateGithubConfig({ workflowPath: wfPath });
      const allText = JSON.stringify(result);
      assert.equal(
        allText.includes(secretToken),
        false,
        "Token value must not appear in validation result",
      );
    },
  );
});

test("formatGithubConfigStatus output never contains token values", () => {
  const secretToken = "ghp_super_secret_value_12345";
  const dir = makeTmpDir();
  const wfPath = writeWorkflowMd(dir, makeValidWorkflowMd());

  withEnv(
    { KATA_GITHUB_TOKEN: secretToken, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const result = validateGithubConfig({ workflowPath: wfPath });
      const report = formatGithubConfigStatus(result);
      const allOutput = report.lines.join("\n");
      assert.equal(
        allOutput.includes(secretToken),
        false,
        "Token value must not appear in status lines",
      );
    },
  );
});

// ─── formatGithubConfigStatus ─────────────────────────────────────────────────

test("formatGithubConfigStatus shows valid status for complete config", () => {
  const dir = makeTmpDir();
  const wfPath = writeWorkflowMd(dir, makeValidWorkflowMd({ github_project_number: "7" }));

  withEnv({ KATA_GITHUB_TOKEN: "token", GH_TOKEN: undefined, GITHUB_TOKEN: undefined }, () => {
    const result = validateGithubConfig({ workflowPath: wfPath });
    const { lines, level } = formatGithubConfigStatus(result);

    assert.equal(level, "info");
    assert.ok(lines.some((l) => l.includes("present")), "token presence expected");
    assert.ok(lines.some((l) => l.includes("kata-sh/kata-mono")), "repo expected");
    assert.ok(lines.some((l) => l.includes("labels")), "state mode expected");
    assert.ok(lines.some((l) => l.includes("7")), "project number expected");
    assert.ok(lines.some((l) => l.includes("valid")), "validation status expected");
  });
});

test("formatGithubConfigStatus shows warning level and diagnostics on failure", () => {
  withEnv(
    { KATA_GITHUB_TOKEN: undefined, GH_TOKEN: undefined, GITHUB_TOKEN: undefined },
    () => {
      const result = validateGithubConfig({
        workflowPath: "/nonexistent/WORKFLOW.md",
        authFilePath: "/nonexistent/auth.json",
      });
      const { lines, level } = formatGithubConfigStatus(result);

      assert.equal(level, "warning");
      assert.ok(lines.some((l) => l.includes("missing")), "missing token expected");
      assert.ok(lines.some((l) => l.includes("diagnostic:")), "diagnostic line expected");
      assert.ok(lines.some((l) => l.includes("action:")), "action line expected");
    },
  );
});
