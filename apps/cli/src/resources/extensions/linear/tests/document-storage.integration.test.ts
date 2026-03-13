/**
 * Integration tests for Kata document storage round-trips.
 *
 * Proves:
 *   - project-level write + read (content round-trip)
 *   - issue-level write + read (proves issueId filter works in real API)
 *   - upsert idempotency (second write → one document, not two)
 *   - markdown fidelity (##, ```, -, ** all survive byte-identical)
 *   - list scoping (project docs ≠ issue docs)
 *   - read not-found returns null (not an error)
 *
 * Validates R103: document round-trips work with the real Linear API.
 *
 * Gated by LINEAR_API_KEY env var — skips with a clear message if not set.
 * All created entities are deleted in after() — the test leaves the workspace
 * clean even on partial failure (IDs tracked as created; delete what exists).
 *
 * Usage:
 *   LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/linear/tests/document-storage.integration.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { LinearClient } from "../linear-client.ts";
import {
  writeKataDocument,
  readKataDocument,
  listKataDocuments,
} from "../linear-documents.ts";
import type { LinearIssue } from "../linear-types.ts";

const API_KEY = process.env.LINEAR_API_KEY;

// =============================================================================
// Test content — used across multiple test cases
// =============================================================================

// Full markdown sample exercising all syntax required by Test 4:
//   # heading, ## subheading, fenced code block, bullet list, **bold**
//
// API normalization facts (discovered empirically):
//   - Linear converts `- ` bullet syntax to `* ` on storage — use `* ` here
//     so the round-trip is byte-identical.
//   - Linear strips a single trailing newline — omit trailing newlines in
//     content strings to avoid spurious byte-inequality.
const MARKDOWN_CONTENT = `# M001 Roadmap

## Overview

This is the **milestone roadmap** for Kata integration.

## Slices

* S01: Foundation and entity types
* S02: Issue hierarchy operations
* S03: State management and transitions

## Implementation Notes

\`\`\`typescript
const result = await writeKataDocument(client, "M001-ROADMAP", content, { projectId });
console.log("Written document id:", result.id);
\`\`\`

**All slices must pass integration tests before milestone is complete.**`;

const PLAN_CONTENT = `# S01 Plan

## Tasks

* T01: Define types
* T02: Implement operations

**Status:** In progress`;

// =============================================================================
// Integration test suite
// =============================================================================

describe(
  "Kata Document Storage — Integration",
  { skip: !API_KEY ? "LINEAR_API_KEY not set" : undefined },
  () => {
    let client: LinearClient;
    let teamId: string;
    let projectId: string;
    let testIssue: LinearIssue | undefined;

    // Track created document IDs for cleanup
    const createdDocumentIds: string[] = [];

    // =========================================================================
    // Setup
    // =========================================================================

    before(async () => {
      client = new LinearClient(API_KEY!);

      // Resolve team and project — prefer env vars over API lookup for speed
      const envTeamId = process.env.LINEAR_TEAM_ID;
      const envProjectId = process.env.LINEAR_PROJECT_ID;

      if (envTeamId && envProjectId) {
        teamId = envTeamId;
        projectId = envProjectId;
      } else {
        const teams = await client.listTeams();
        assert.ok(teams.length > 0, "workspace has at least one team");
        teamId = envTeamId ?? teams[0].id;

        const projects = await client.listProjects({ teamId });
        assert.ok(projects.length > 0, "team has at least one project");
        projectId = envProjectId ?? projects[0].id;
      }

      // Create a throwaway issue to serve as the issue-level attachment target
      testIssue = await client.createIssue({
        title: "[S04-TEST] Document test issue",
        teamId,
        projectId,
      });

      console.log(`  teamId:    ${teamId}`);
      console.log(`  projectId: ${projectId}`);
      console.log(`  testIssue: ${testIssue.id} (${testIssue.identifier})`);
    });

    // =========================================================================
    // Test 1 — project-level write + read
    // =========================================================================

    it("project-level document content round-trips without modification", async () => {
      const doc = await writeKataDocument(
        client,
        "M001-ROADMAP",
        MARKDOWN_CONTENT,
        { projectId },
      );

      console.log(`  created document: ${doc.id} (title: ${doc.title})`);

      assert.equal(doc.title, "M001-ROADMAP", "returned document title matches");
      assert.equal(doc.content, MARKDOWN_CONTENT, "returned document content matches written content");

      createdDocumentIds.push(doc.id);

      // Read back via readKataDocument
      const readDoc = await readKataDocument(client, "M001-ROADMAP", { projectId });

      assert.ok(readDoc !== null, "readKataDocument should return the written document");
      assert.equal(readDoc!.content, MARKDOWN_CONTENT, "read-back content matches written content");
    });

    // =========================================================================
    // Test 2 — issue-level write + read (proves issueId filter in real API)
    // =========================================================================

    it("issue-level document content round-trips (issueId filter works in real API)", async () => {
      assert.ok(testIssue, "testIssue must be created in before()");
      const issueId = testIssue!.id;

      const doc = await writeKataDocument(
        client,
        "S01-PLAN",
        PLAN_CONTENT,
        { issueId },
      );

      console.log(`  created document: ${doc.id} (title: ${doc.title})`);

      assert.equal(doc.title, "S01-PLAN", "returned document title matches");
      assert.equal(doc.content, PLAN_CONTENT, "returned document content matches written content");

      createdDocumentIds.push(doc.id);

      // Read back via readKataDocument
      const readDoc = await readKataDocument(client, "S01-PLAN", { issueId });

      assert.ok(readDoc !== null, "readKataDocument should return the written issue-level document");
      assert.equal(readDoc!.content, PLAN_CONTENT, "read-back content matches written content");
    });

    // =========================================================================
    // Test 3 — upsert idempotency
    // =========================================================================

    it("upsert creates exactly 1 document; second write content wins", async () => {
      // No trailing newline — Linear strips it on storage (API normalization)
      const v1 = "# M001 Context v1\n\nInitial context content.";
      const v2 = "# M001 Context v2\n\n**Updated** context content after second write.";

      // First write — creates a new document
      const doc1 = await writeKataDocument(client, "M001-CONTEXT", v1, { projectId });
      console.log(`  first write:  ${doc1.id} (created)`);
      createdDocumentIds.push(doc1.id);

      // Second write — should update the existing document (upsert)
      const doc2 = await writeKataDocument(client, "M001-CONTEXT", v2, { projectId });
      console.log(`  second write: ${doc2.id} (upserted)`);

      // Same document ID — not a new document
      assert.equal(doc2.id, doc1.id, "upsert returns same document ID — not a new document");

      // Only one document with this title should exist
      const allDocs = await listKataDocuments(client, { projectId });
      const contextDocs = allDocs.filter((d) => d.title === "M001-CONTEXT");
      assert.equal(
        contextDocs.length,
        1,
        `exactly 1 document with title 'M001-CONTEXT' should exist; got ${contextDocs.length}`,
      );

      // Read back — second-write content should win
      const readDoc = await readKataDocument(client, "M001-CONTEXT", { projectId });
      assert.ok(readDoc !== null, "document should exist after upsert");
      assert.equal(readDoc!.content, v2, "second write content wins");
    });

    // =========================================================================
    // Test 4 — markdown fidelity
    // =========================================================================

    it("markdown syntax (##, ```, -, **) survives round-trip byte-identical", async () => {
      // Re-read M001-ROADMAP written in Test 1 (contains all required markdown syntax)
      const readDoc = await readKataDocument(client, "M001-ROADMAP", { projectId });

      assert.ok(readDoc !== null, "M001-ROADMAP should exist from Test 1");

      // Full byte-identical equality
      assert.equal(
        readDoc!.content,
        MARKDOWN_CONTENT,
        "markdown content is byte-identical after round-trip",
      );

      // Verify individual markdown elements are present and intact
      assert.ok(readDoc!.content.includes("## Overview"), "## subheading preserved");
      assert.ok(readDoc!.content.includes("```typescript"), "fenced code block opening preserved");
      assert.ok(readDoc!.content.includes("* S01:"), "bullet list item preserved");
      assert.ok(readDoc!.content.includes("**milestone roadmap**"), "inline bold preserved");
      assert.ok(readDoc!.content.includes("**All slices"), "second bold element preserved");
    });

    // =========================================================================
    // Test 5 — list scoping
    // =========================================================================

    it("listKataDocuments scopes correctly: project-scoped excludes issue docs and vice versa", async () => {
      assert.ok(testIssue, "testIssue must be created in before()");
      const issueId = testIssue!.id;

      // Project-scoped: includes M001-ROADMAP, excludes S01-PLAN
      const projectDocs = await listKataDocuments(client, { projectId });
      const projectTitles = projectDocs.map((d) => d.title);

      assert.ok(
        projectTitles.includes("M001-ROADMAP"),
        `project list should include M001-ROADMAP; got: ${projectTitles.join(", ")}`,
      );
      assert.ok(
        !projectTitles.includes("S01-PLAN"),
        `project list should NOT include S01-PLAN (issue-level doc); got: ${projectTitles.join(", ")}`,
      );

      // Issue-scoped: includes S01-PLAN, excludes M001-ROADMAP
      const issueDocs = await listKataDocuments(client, { issueId });
      const issueTitles = issueDocs.map((d) => d.title);

      assert.ok(
        issueTitles.includes("S01-PLAN"),
        `issue list should include S01-PLAN; got: ${issueTitles.join(", ")}`,
      );
      assert.ok(
        !issueTitles.includes("M001-ROADMAP"),
        `issue list should NOT include M001-ROADMAP (project-level doc); got: ${issueTitles.join(", ")}`,
      );
    });

    // =========================================================================
    // Test 6 — read not-found returns null
    // =========================================================================

    it("readKataDocument returns null for a title that was never written", async () => {
      const result = await readKataDocument(
        client,
        `DOES-NOT-EXIST-${Date.now()}`,
        { projectId },
      );
      assert.equal(result, null, "readKataDocument should return null for non-existent document");
    });

    // =========================================================================
    // Cleanup
    // =========================================================================

    after(async () => {
      // Delete all tracked documents — use Promise.allSettled so one failure
      // doesn't abort cleanup of the rest
      const docDeleteResults = await Promise.allSettled(
        createdDocumentIds.map((id) => client.deleteDocument(id)),
      );

      docDeleteResults.forEach((result, i) => {
        if (result.status === "rejected") {
          const msg = String(result.reason);
          if (!msg.toLowerCase().includes("not found") && !msg.includes("Entity not found")) {
            console.log(`  Cleanup failed for document ${createdDocumentIds[i]}: ${msg}`);
          }
        }
      });

      // Delete the throwaway issue
      if (testIssue) {
        try {
          await client.deleteIssue(testIssue.id);
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          if (!msg.toLowerCase().includes("not found") && !msg.includes("Entity not found")) {
            console.log(`  Cleanup failed for test issue ${testIssue.id}: ${msg}`);
          }
        }
      }
    });
  },
);
