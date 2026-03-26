import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LinearClient } from "../linear-client.ts";

describe("LinearClient relation helpers", () => {
  it("listRelations queries relations directly instead of delegating to getIssue", async () => {
    const client = new LinearClient("test-key", "https://example.invalid/graphql");

    (client as unknown as { getIssue: (id: string) => Promise<unknown> }).getIssue = async () => {
      throw new Error("listRelations should not call getIssue");
    };

    (client as unknown as { graphql: (query: string, vars?: Record<string, unknown>) => Promise<unknown> }).graphql =
      async (_query: string, vars?: Record<string, unknown>) => {
        assert.deepEqual(vars, { id: "issue-1" });
        return {
          issue: {
            relations: { nodes: [] },
            inverseRelations: { nodes: [] },
          },
        };
      };

    const relations = await client.listRelations("issue-1");
    assert.deepEqual(relations, []);
  });

  it("normalizes unknown relation types to relates_to instead of blocks", () => {
    const client = new LinearClient("test-key", "https://example.invalid/graphql");
    const normalize = (client as unknown as { normalizeRelationType: (type: string) => string }).normalizeRelationType;

    assert.equal(normalize("mystery_relation"), "relates_to");
    assert.equal(normalize(""), "relates_to");
    assert.equal(normalize("blocks"), "blocks");
  });
});
