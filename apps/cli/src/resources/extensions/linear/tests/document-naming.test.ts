/**
 * Unit tests for linear-documents.ts — pure naming functions.
 *
 * No API key required. No network calls.
 *
 * Usage:
 *   node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/linear/tests/document-naming.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDocumentTitle, parseDocumentTitle } from "../linear-documents.ts";

// =============================================================================
// buildDocumentTitle
// =============================================================================

describe("buildDocumentTitle", () => {
  it("builds a milestone artifact title", () => {
    assert.equal(buildDocumentTitle("M001", "ROADMAP"), "M001-ROADMAP");
  });

  it("builds a milestone context title", () => {
    assert.equal(buildDocumentTitle("M001", "CONTEXT"), "M001-CONTEXT");
  });

  it("builds a milestone summary title", () => {
    assert.equal(buildDocumentTitle("M002", "SUMMARY"), "M002-SUMMARY");
  });

  it("builds a slice artifact title", () => {
    assert.equal(buildDocumentTitle("S01", "PLAN"), "S01-PLAN");
  });

  it("builds a slice research title", () => {
    assert.equal(buildDocumentTitle("S04", "RESEARCH"), "S04-RESEARCH");
  });

  it("builds a task artifact title", () => {
    assert.equal(buildDocumentTitle("T01", "SUMMARY"), "T01-SUMMARY");
  });

  it("builds a task plan title", () => {
    assert.equal(buildDocumentTitle("T03", "PLAN"), "T03-PLAN");
  });

  it("returns artifactType alone when kataId is null — DECISIONS", () => {
    assert.equal(buildDocumentTitle(null, "DECISIONS"), "DECISIONS");
  });

  it("returns artifactType alone when kataId is null — PROJECT", () => {
    assert.equal(buildDocumentTitle(null, "PROJECT"), "PROJECT");
  });

  it("handles uppercase multi-digit kataId", () => {
    assert.equal(buildDocumentTitle("M010", "ROADMAP"), "M010-ROADMAP");
  });

  it("handles alphabetic-only kataId prefix", () => {
    assert.equal(buildDocumentTitle("KATA", "WORKFLOW"), "KATA-WORKFLOW");
  });
});

// =============================================================================
// parseDocumentTitle
// =============================================================================

describe("parseDocumentTitle", () => {
  it("parses a milestone artifact title", () => {
    assert.deepEqual(parseDocumentTitle("M001-ROADMAP"), {
      kataId: "M001",
      artifactType: "ROADMAP",
    });
  });

  it("parses a slice artifact title", () => {
    assert.deepEqual(parseDocumentTitle("S01-PLAN"), {
      kataId: "S01",
      artifactType: "PLAN",
    });
  });

  it("parses a task artifact title", () => {
    assert.deepEqual(parseDocumentTitle("T01-SUMMARY"), {
      kataId: "T01",
      artifactType: "SUMMARY",
    });
  });

  it("returns kataId=null for a root-level title with no dash", () => {
    assert.deepEqual(parseDocumentTitle("DECISIONS"), {
      kataId: null,
      artifactType: "DECISIONS",
    });
  });

  it("returns kataId=null for PROJECT (no dash)", () => {
    assert.deepEqual(parseDocumentTitle("PROJECT"), {
      kataId: null,
      artifactType: "PROJECT",
    });
  });

  it("parses a title with alphabetic-only prefix — KATA-WORKFLOW", () => {
    assert.deepEqual(parseDocumentTitle("KATA-WORKFLOW"), {
      kataId: "KATA",
      artifactType: "WORKFLOW",
    });
  });

  it("returns null for empty string", () => {
    assert.equal(parseDocumentTitle(""), null);
  });

  it("returns null for whitespace-only string", () => {
    assert.equal(parseDocumentTitle("   "), null);
  });

  it("returns null for a tab-only string", () => {
    assert.equal(parseDocumentTitle("\t"), null);
  });

  it("treats lowercase prefix as root-level artifactType (no kataId)", () => {
    // "some-thing" — 'some' has lowercase letters, so kataId = null
    assert.deepEqual(parseDocumentTitle("some-thing"), {
      kataId: null,
      artifactType: "some-thing",
    });
  });

  it("treats mixed-case prefix as root-level artifactType", () => {
    assert.deepEqual(parseDocumentTitle("M001x-ROADMAP"), {
      kataId: null,
      artifactType: "M001x-ROADMAP",
    });
  });
});

// =============================================================================
// buildDocumentTitle + parseDocumentTitle round-trips
// =============================================================================

describe("buildDocumentTitle + parseDocumentTitle round-trip", () => {
  const conventionRows: Array<{ kataId: string | null; artifactType: string }> = [
    // Root-level
    { kataId: null, artifactType: "DECISIONS" },
    { kataId: null, artifactType: "PROJECT" },
    // Milestone
    { kataId: "M001", artifactType: "ROADMAP" },
    { kataId: "M001", artifactType: "CONTEXT" },
    { kataId: "M001", artifactType: "RESEARCH" },
    { kataId: "M001", artifactType: "SUMMARY" },
    // Slice
    { kataId: "S01", artifactType: "PLAN" },
    { kataId: "S01", artifactType: "RESEARCH" },
    { kataId: "S01", artifactType: "CONTEXT" },
    { kataId: "S01", artifactType: "SUMMARY" },
    { kataId: "S01", artifactType: "UAT" },
    // Task
    { kataId: "T01", artifactType: "PLAN" },
    { kataId: "T01", artifactType: "SUMMARY" },
  ];

  for (const { kataId, artifactType } of conventionRows) {
    it(`round-trips: kataId=${JSON.stringify(kataId)}, artifactType="${artifactType}"`, () => {
      const title = buildDocumentTitle(kataId, artifactType);
      const parsed = parseDocumentTitle(title);
      assert.deepEqual(parsed, { kataId, artifactType });
    });
  }
});
