import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { formatProviderReport, runProviderChecks } from "../doctor-providers.ts";

function restoreEnvVar(key: string, original: string | undefined): void {
  if (original === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = original;
}

describe("runProviderChecks", () => {
  it("reports configured provider models as pass", async () => {
    const result = await runProviderChecks({
      env: {
        ANTHROPIC_API_KEY: "test-key",
        BRAVE_API_KEY: "test-brave",
      },
      overrides: {
        checkedAt: "2026-03-23T00:00:00.000Z",
        authProviders: ["anthropic", "brave"],
        models: [{ provider: "anthropic", id: "claude-sonnet-4-6" }],
        defaultProvider: "anthropic",
        defaultModel: "claude-sonnet-4-6",
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.availableModels, 1);
    assert.equal(result.defaultModel, "anthropic/claude-sonnet-4-6");
    assert.equal(
      result.checks.some(
        (check) => check.id === "anthropic_provider" && check.status === "pass",
      ),
      true,
    );
    assert.equal(
      result.checks.some(
        (check) => check.id === "default_model" && check.status === "pass",
      ),
      true,
    );
  });

  it("recognizes KATA-prefixed provider environment aliases", async () => {
    const result = await runProviderChecks({
      env: {
        KATA_ANTHROPIC_API_KEY: "test-key",
      },
      overrides: {
        checkedAt: "2026-03-23T00:00:00.000Z",
        authProviders: [],
        models: [{ provider: "anthropic", id: "claude-sonnet-4-6" }],
        defaultProvider: "anthropic",
        defaultModel: "claude-sonnet-4-6",
      },
    });

    assert.equal(
      result.checks.some(
        (check) => check.id === "anthropic_provider" && check.status === "pass",
      ),
      true,
    );
  });

  it("warns when credentials exist but no models are available", async () => {
    const result = await runProviderChecks({
      env: {
        OPENAI_API_KEY: "test-key",
      },
      overrides: {
        checkedAt: "2026-03-23T00:00:00.000Z",
        authProviders: ["openai"],
        models: [],
        defaultProvider: null,
        defaultModel: null,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.checks.some(
        (check) => check.id === "openai_provider" && check.status === "warn",
      ),
      true,
    );
    assert.equal(
      result.checks.some(
        (check) => check.id === "model_inventory_empty" && check.status === "warn",
      ),
      true,
    );

    const formatted = formatProviderReport(result);
    assert.equal(formatted.includes("Provider diagnostics:"), true);
    assert.equal(formatted.includes("OpenAI: WARN"), true);
  });

  it("ignores non-secret metadata in auth snapshots", async () => {
    const tempDir = mkdtempSync(join(process.cwd(), ".tmp-doctor-provider-auth-"));
    const authPath = join(tempDir, "auth.json");
    writeFileSync(
      authPath,
      JSON.stringify({
        anthropic: {
          expiresAt: "2027-01-01T00:00:00.000Z",
          metadata: "present",
        },
      }),
      "utf-8",
    );

    try {
      const result = await runProviderChecks({
        authPath,
        env: {},
        overrides: {
          checkedAt: "2026-03-23T00:00:00.000Z",
          models: [],
          defaultProvider: null,
          defaultModel: null,
        },
      });

      const anthropic = result.providers.find((provider) => provider.provider === "anthropic");
      assert.ok(anthropic);
      assert.equal(anthropic.hasStoredCredential, false);
      assert.equal(
        result.checks.some(
          (check) => check.id === "anthropic_provider" && check.status === "info",
        ),
        true,
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolves default auth path from current HOME at check time", async () => {
    const originalHome = process.env.HOME;
    const originalAgentDir = process.env.KATA_CODING_AGENT_DIR;
    const targetProvider = "anthropic";

    const tempHome = mkdtempSync(join(process.cwd(), ".tmp-doctor-provider-home-"));
    const tempAgentDir = join(tempHome, ".kata-cli", "agent");
    mkdirSync(tempAgentDir, { recursive: true });
    writeFileSync(
      join(tempAgentDir, "auth.json"),
      JSON.stringify({
        [targetProvider]: {
          key: "test-key",
        },
      }),
      "utf-8",
    );

    try {
      process.env.HOME = tempHome;
      delete process.env.KATA_CODING_AGENT_DIR;
      const result = await runProviderChecks({
        env: {},
        overrides: {
          checkedAt: "2026-03-23T00:00:00.000Z",
          models: [],
          defaultProvider: null,
          defaultModel: null,
        },
      });
      const provider = result.providers.find((item) => item.provider === targetProvider);
      assert.ok(provider);
      assert.equal(provider.hasStoredCredential, true);
    } finally {
      restoreEnvVar("HOME", originalHome);
      restoreEnvVar("KATA_CODING_AGENT_DIR", originalAgentDir);
      rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("resolves default auth path from KATA_CODING_AGENT_DIR when set", async () => {
    const originalAgentDir = process.env.KATA_CODING_AGENT_DIR;
    const targetProvider = "openai";

    const tempRoot = mkdtempSync(join(process.cwd(), ".tmp-doctor-provider-agent-dir-"));
    const tempAgentDir = join(tempRoot, "agent");
    mkdirSync(tempAgentDir, { recursive: true });
    writeFileSync(
      join(tempAgentDir, "auth.json"),
      JSON.stringify({
        [targetProvider]: {
          key: "test-key",
        },
      }),
      "utf-8",
    );

    try {
      process.env.KATA_CODING_AGENT_DIR = tempAgentDir;
      const result = await runProviderChecks({
        env: {},
        overrides: {
          checkedAt: "2026-03-23T00:00:00.000Z",
          models: [],
          defaultProvider: null,
          defaultModel: null,
        },
      });

      const provider = result.providers.find((item) => item.provider === targetProvider);
      assert.ok(provider);
      assert.equal(provider.hasStoredCredential, true);
    } finally {
      restoreEnvVar("KATA_CODING_AGENT_DIR", originalAgentDir);
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("restoreEnvVar", () => {
  it("deletes env var when original value is undefined", () => {
    const key = "KATA_TEST_RESTORE_ENV_VAR";
    const saved = process.env[key];

    process.env[key] = "temp";
    restoreEnvVar(key, undefined);

    assert.equal(process.env[key], undefined);
    restoreEnvVar(key, saved);
  });

  it("restores env var when original value exists", () => {
    const key = "KATA_TEST_RESTORE_ENV_VAR";
    const saved = process.env[key];

    process.env[key] = "temp";
    restoreEnvVar(key, "original");

    assert.equal(process.env[key], "original");
    restoreEnvVar(key, saved);
  });
});
