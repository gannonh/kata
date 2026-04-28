import { describe, expect, it } from "vitest";

import {
  listEmbeddedDocuments,
  parseGithubArtifactMetadata,
  readEmbeddedDocument,
  serializeGithubArtifactMetadata,
  stripEmbeddedDocuments,
  upsertEmbeddedDocument,
  upsertGithubArtifactMetadata,
} from "../github-artifacts.js";

describe("github artifact metadata contract", () => {
  it("round-trips canonical metadata with deterministic normalization", () => {
    const marker = serializeGithubArtifactMetadata({
      schema: "kata/github-artifact/v1",
      kind: "slice",
      kataId: "s02",
      milestoneId: "m009",
      dependsOn: ["s03", "S01", "S01"],
    });

    const parsed = parseGithubArtifactMetadata(marker);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.metadata).toEqual({
      schema: "kata/github-artifact/v1",
      kind: "slice",
      kataId: "S02",
      milestoneId: "M009",
      dependsOn: ["S01", "S03"],
    });

    const second = serializeGithubArtifactMetadata(parsed.metadata);
    expect(second).toBe(marker);
  });

  it("replaces existing metadata marker idempotently", () => {
    const initial = "<!-- KATA:GITHUB_ARTIFACT {\"schema\":\"kata/github-artifact/v1\",\"kind\":\"slice\",\"kataId\":\"S01\"} -->\n\n# body";
    const updated = upsertGithubArtifactMetadata(initial, {
      schema: "kata/github-artifact/v1",
      kind: "slice",
      kataId: "S01",
      milestoneId: "M009",
    });

    const parsed = parseGithubArtifactMetadata(updated);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.metadata.milestoneId).toBe("M009");
    expect(updated.match(/KATA:GITHUB_ARTIFACT/g)?.length).toBe(1);
  });

  it("returns explicit diagnostics for malformed metadata", () => {
    const malformed = "<!-- KATA:GITHUB_ARTIFACT {not-json} -->";
    const parsed = parseGithubArtifactMetadata(malformed);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("malformed_metadata");
  });

  it("returns explicit diagnostics for invalid dependency IDs", () => {
    const payload =
      "<!-- KATA:GITHUB_ARTIFACT {\"schema\":\"kata/github-artifact/v1\",\"kind\":\"slice\",\"kataId\":\"S01\",\"dependsOn\":[\"BAD\"]} -->";
    const parsed = parseGithubArtifactMetadata(payload);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("invalid_dependency_id");
  });
});

describe("embedded document helpers", () => {
  it("upserts and reads embedded documents without duplication", () => {
    const once = upsertEmbeddedDocument("", "M009-ROADMAP", "# Roadmap");
    const twice = upsertEmbeddedDocument(once, "M009-ROADMAP", "# Updated");

    expect(listEmbeddedDocuments(twice)).toEqual(["M009-ROADMAP"]);
    expect(readEmbeddedDocument(twice, "M009-ROADMAP")).toBe("# Updated");
  });

  it("can remove all embedded docs while preserving non-doc text", () => {
    const withDoc = upsertEmbeddedDocument("Header", "S01-PLAN", "# S01");
    const stripped = stripEmbeddedDocuments(withDoc);
    expect(stripped).toContain("Header");
    expect(stripped).not.toContain("KATA:DOC");
  });
});
