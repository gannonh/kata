import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatEnvironmentReport,
  runEnvironmentChecks,
} from "../doctor-environment.ts";

describe("runEnvironmentChecks", () => {
  it("returns pass statuses for a healthy environment snapshot", async () => {
    const result = await runEnvironmentChecks({
      minNodeVersion: "20.6.0",
      minGitVersion: "2.25.0",
      diskWarnBytes: 1_000,
      diskFailBytes: 500,
      overrides: {
        checkedAt: "2026-03-23T00:00:00.000Z",
        nodeVersion: "v22.1.0",
        gitVersion: "2.48.0",
        diskFreeBytes: 5_000,
        platform: "linux",
        osRelease: "6.8.0",
        shell: "/bin/zsh",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.checks.some(
        (check) => check.id === "node_version" && check.status === "pass",
      ),
      true,
    );
    assert.equal(
      result.checks.some(
        (check) => check.id === "git_version" && check.status === "pass",
      ),
      true,
    );
    assert.equal(
      result.checks.some(
        (check) => check.id === "disk_space" && check.status === "pass",
      ),
      true,
    );
  });

  it("flags failing and warning checks in degraded conditions", async () => {
    const result = await runEnvironmentChecks({
      minNodeVersion: "20.6.0",
      minGitVersion: "2.25.0",
      diskWarnBytes: 2_000,
      diskFailBytes: 1_000,
      overrides: {
        checkedAt: "2026-03-23T00:00:00.000Z",
        nodeVersion: "v18.19.0",
        gitVersion: null,
        diskFreeBytes: 100,
        platform: "linux",
        osRelease: "6.8.0",
        shell: null,
      },
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.checks.some(
        (check) => check.id === "node_version" && check.status === "fail",
      ),
      true,
    );
    assert.equal(
      result.checks.some(
        (check) => check.id === "git_version" && check.status === "fail",
      ),
      true,
    );
    assert.equal(
      result.checks.some(
        (check) => check.id === "disk_space" && check.status === "fail",
      ),
      true,
    );

    const formatted = formatEnvironmentReport(result);
    assert.equal(formatted.includes("Environment diagnostics:"), true);
    assert.equal(formatted.includes("Node.js: FAIL"), true);
    assert.equal(formatted.includes("Git: FAIL"), true);
  });
});
