import assert from "node:assert/strict";
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
});
