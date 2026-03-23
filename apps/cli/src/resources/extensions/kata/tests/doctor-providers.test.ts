import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { formatProviderReport, runProviderChecks } from "../doctor-providers.ts";

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
    const baseline = await runProviderChecks({
      env: {},
      overrides: {
        checkedAt: "2026-03-23T00:00:00.000Z",
        models: [],
        defaultProvider: null,
        defaultModel: null,
      },
    });

    const target = baseline.providers.find((provider) => !provider.hasStoredCredential);
    assert.ok(
      target,
      "expected at least one provider without stored credentials to validate HOME path resolution",
    );

    const tempHome = mkdtempSync(join(process.cwd(), ".tmp-doctor-provider-home-"));
    const tempAgentDir = join(tempHome, ".kata-cli", "agent");
    mkdirSync(tempAgentDir, { recursive: true });
    writeFileSync(
      join(tempAgentDir, "auth.json"),
      JSON.stringify({
        [target.provider]: {
          key: "test-key",
        },
      }),
      "utf-8",
    );

    try {
      process.env.HOME = tempHome;
      const result = await runProviderChecks({
        env: {},
        overrides: {
          checkedAt: "2026-03-23T00:00:00.000Z",
          models: [],
          defaultProvider: null,
          defaultModel: null,
        },
      });
      const provider = result.providers.find((item) => item.provider === target.provider);
      assert.ok(provider);
      assert.equal(provider.hasStoredCredential, true);
    } finally {
      process.env.HOME = originalHome;
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
