/**
 * Unit tests for document operation functions in linear-documents.ts.
 *
 * No API key required. No network calls.
 * Uses closure-based spy mocks following the makeMockClient pattern from S03.
 *
 * Usage:
 *   node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/linear/tests/document-operations.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  writeKataDocument,
  readKataDocument,
  listKataDocuments,
} from "../linear-documents.ts";
import type { LinearDocumentClient } from "../linear-documents.ts";
import type { LinearDocument, DocumentCreateInput, DocumentUpdateInput } from "../linear-types.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

function makeDoc(overrides: Partial<LinearDocument> = {}): LinearDocument {
  return {
    id: "doc-id-001",
    title: "M001-ROADMAP",
    content: "# Roadmap\n\n- Slice 1\n- Slice 2",
    project: { id: "proj-id-001", name: "Kata CLI" },
    issue: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// =============================================================================
// Mock client factory — closure-based spies
// =============================================================================

interface MockDocumentClientOpts {
  listDocumentsResult?: LinearDocument[];
  createDocumentResult?: LinearDocument;
  updateDocumentResult?: LinearDocument;
}

function makeMockDocumentClient(opts: MockDocumentClientOpts = {}): {
  client: LinearDocumentClient;
  listDocumentsCalls: Array<Parameters<LinearDocumentClient["listDocuments"]>[0]>;
  createDocumentCalls: Array<DocumentCreateInput>;
  updateDocumentCalls: Array<{ id: string; input: DocumentUpdateInput }>;
} {
  const listDocumentsCalls: Array<Parameters<LinearDocumentClient["listDocuments"]>[0]> = [];
  const createDocumentCalls: Array<DocumentCreateInput> = [];
  const updateDocumentCalls: Array<{ id: string; input: DocumentUpdateInput }> = [];

  const defaultDoc = makeDoc();

  const client: LinearDocumentClient = {
    async listDocuments(callOpts) {
      listDocumentsCalls.push(callOpts);
      return opts.listDocumentsResult ?? [];
    },
    async createDocument(input: DocumentCreateInput): Promise<LinearDocument> {
      createDocumentCalls.push(input);
      return opts.createDocumentResult ?? makeDoc({ title: input.title, content: input.content ?? "" });
    },
    async updateDocument(id: string, input: DocumentUpdateInput): Promise<LinearDocument> {
      updateDocumentCalls.push({ id, input });
      return opts.updateDocumentResult ?? makeDoc({ id, content: input.content ?? "" });
    },
    async getDocument(id: string): Promise<LinearDocument | null> {
      return defaultDoc.id === id ? defaultDoc : null;
    },
  };

  return { client, listDocumentsCalls, createDocumentCalls, updateDocumentCalls };
}

// =============================================================================
// writeKataDocument — create branch
// =============================================================================

describe("writeKataDocument — create branch", () => {
  it("calls createDocument when listDocuments returns empty array", async () => {
    const { client, createDocumentCalls, updateDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [],
    });
    await writeKataDocument(client, "M001-ROADMAP", "# content", { projectId: "proj-1" });
    assert.equal(createDocumentCalls.length, 1);
    assert.equal(updateDocumentCalls.length, 0);
  });

  it("passes correct title and content to createDocument", async () => {
    const { client, createDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [],
    });
    await writeKataDocument(client, "M001-ROADMAP", "# Milestone Roadmap", { projectId: "proj-1" });
    assert.equal(createDocumentCalls[0].title, "M001-ROADMAP");
    assert.equal(createDocumentCalls[0].content, "# Milestone Roadmap");
  });

  it("passes projectId (not issueId) when attachment is projectId", async () => {
    const { client, createDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [],
    });
    await writeKataDocument(client, "M001-ROADMAP", "content", { projectId: "proj-abc" });
    assert.equal(createDocumentCalls[0].projectId, "proj-abc");
    assert.equal(createDocumentCalls[0].issueId, undefined);
  });

  it("passes issueId (not projectId) when attachment is issueId", async () => {
    const { client, createDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [],
    });
    await writeKataDocument(client, "S01-PLAN", "# Plan", { issueId: "issue-xyz" });
    assert.equal(createDocumentCalls[0].issueId, "issue-xyz");
    assert.equal(createDocumentCalls[0].projectId, undefined);
  });

  it("returns the created document", async () => {
    const createdDoc = makeDoc({ id: "new-doc-id", title: "M001-ROADMAP", content: "fresh" });
    const { client } = makeMockDocumentClient({
      listDocumentsResult: [],
      createDocumentResult: createdDoc,
    });
    const result = await writeKataDocument(client, "M001-ROADMAP", "fresh", { projectId: "proj-1" });
    assert.equal(result.id, "new-doc-id");
    assert.equal(result.content, "fresh");
  });
});

// =============================================================================
// writeKataDocument — update branch
// =============================================================================

describe("writeKataDocument — update branch", () => {
  it("calls updateDocument when listDocuments returns an existing document", async () => {
    const existing = makeDoc({ id: "existing-id", title: "M001-ROADMAP" });
    const { client, updateDocumentCalls, createDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [existing],
    });
    await writeKataDocument(client, "M001-ROADMAP", "# Updated content", { projectId: "proj-1" });
    assert.equal(updateDocumentCalls.length, 1);
    assert.equal(createDocumentCalls.length, 0);
  });

  it("calls updateDocument with the existing document's id", async () => {
    const existing = makeDoc({ id: "doc-to-update", title: "M001-ROADMAP" });
    const { client, updateDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [existing],
    });
    await writeKataDocument(client, "M001-ROADMAP", "new content", { projectId: "proj-1" });
    assert.equal(updateDocumentCalls[0].id, "doc-to-update");
  });

  it("passes new content to updateDocument", async () => {
    const existing = makeDoc({ id: "doc-to-update" });
    const { client, updateDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [existing],
    });
    await writeKataDocument(client, "M001-ROADMAP", "# New content", { projectId: "proj-1" });
    assert.equal(updateDocumentCalls[0].input.content, "# New content");
  });

  it("returns the updated document", async () => {
    const existing = makeDoc({ id: "doc-id" });
    const updatedDoc = makeDoc({ id: "doc-id", content: "updated" });
    const { client } = makeMockDocumentClient({
      listDocumentsResult: [existing],
      updateDocumentResult: updatedDoc,
    });
    const result = await writeKataDocument(client, "M001-ROADMAP", "updated", { projectId: "proj-1" });
    assert.equal(result.id, "doc-id");
    assert.equal(result.content, "updated");
  });

  it("uses only first document when multiple results returned (first-match wins)", async () => {
    const first = makeDoc({ id: "first-id" });
    const second = makeDoc({ id: "second-id" });
    const { client, updateDocumentCalls } = makeMockDocumentClient({
      listDocumentsResult: [first, second],
    });
    await writeKataDocument(client, "M001-ROADMAP", "content", { projectId: "proj-1" });
    assert.equal(updateDocumentCalls[0].id, "first-id");
  });
});

// =============================================================================
// writeKataDocument — attachment isolation
// =============================================================================

describe("writeKataDocument — attachment isolation in listDocuments call", () => {
  it("passes projectId to listDocuments when attachment has projectId", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient();
    await writeKataDocument(client, "M001-ROADMAP", "c", { projectId: "proj-222" });
    assert.equal(listDocumentsCalls[0]?.projectId, "proj-222");
    assert.equal(listDocumentsCalls[0]?.issueId, undefined);
  });

  it("passes issueId to listDocuments when attachment has issueId", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient();
    await writeKataDocument(client, "S01-PLAN", "c", { issueId: "issue-333" });
    assert.equal(listDocumentsCalls[0]?.issueId, "issue-333");
    assert.equal(listDocumentsCalls[0]?.projectId, undefined);
  });

  it("passes title to listDocuments call", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient();
    await writeKataDocument(client, "T01-SUMMARY", "c", { projectId: "proj-1" });
    assert.equal(listDocumentsCalls[0]?.title, "T01-SUMMARY");
  });
});

// =============================================================================
// readKataDocument
// =============================================================================

describe("readKataDocument", () => {
  it("returns the document when listDocuments returns a match", async () => {
    const doc = makeDoc({ id: "found-id", title: "M001-ROADMAP" });
    const { client } = makeMockDocumentClient({ listDocumentsResult: [doc] });
    const result = await readKataDocument(client, "M001-ROADMAP", { projectId: "proj-1" });
    assert.ok(result);
    assert.equal(result.id, "found-id");
  });

  it("returns null when listDocuments returns empty array", async () => {
    const { client } = makeMockDocumentClient({ listDocumentsResult: [] });
    const result = await readKataDocument(client, "M001-ROADMAP", { projectId: "proj-1" });
    assert.equal(result, null);
  });

  it("returns document with empty content (not null)", async () => {
    const docWithEmptyContent = makeDoc({ id: "empty-doc", content: "" });
    const { client } = makeMockDocumentClient({ listDocumentsResult: [docWithEmptyContent] });
    const result = await readKataDocument(client, "M001-ROADMAP", { projectId: "proj-1" });
    assert.ok(result !== null, "should return document, not null");
    assert.equal(result.id, "empty-doc");
    assert.equal(result.content, "");
  });

  it("passes title and projectId to listDocuments", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient({ listDocumentsResult: [] });
    await readKataDocument(client, "DECISIONS", { projectId: "proj-99" });
    assert.equal(listDocumentsCalls[0]?.title, "DECISIONS");
    assert.equal(listDocumentsCalls[0]?.projectId, "proj-99");
  });

  it("passes title and issueId to listDocuments", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient({ listDocumentsResult: [] });
    await readKataDocument(client, "S01-PLAN", { issueId: "issue-88" });
    assert.equal(listDocumentsCalls[0]?.title, "S01-PLAN");
    assert.equal(listDocumentsCalls[0]?.issueId, "issue-88");
  });
});

// =============================================================================
// listKataDocuments
// =============================================================================

describe("listKataDocuments", () => {
  it("returns all documents for a projectId attachment", async () => {
    const docs = [makeDoc({ id: "d1" }), makeDoc({ id: "d2" })];
    const { client } = makeMockDocumentClient({ listDocumentsResult: docs });
    const result = await listKataDocuments(client, { projectId: "proj-1" });
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "d1");
    assert.equal(result[1].id, "d2");
  });

  it("returns all documents for an issueId attachment", async () => {
    const docs = [makeDoc({ id: "d3" }), makeDoc({ id: "d4" }), makeDoc({ id: "d5" })];
    const { client } = makeMockDocumentClient({ listDocumentsResult: docs });
    const result = await listKataDocuments(client, { issueId: "issue-1" });
    assert.equal(result.length, 3);
  });

  it("returns empty array when no documents exist", async () => {
    const { client } = makeMockDocumentClient({ listDocumentsResult: [] });
    const result = await listKataDocuments(client, { projectId: "proj-empty" });
    assert.deepEqual(result, []);
  });

  it("does NOT pass a title filter to listDocuments", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient({ listDocumentsResult: [] });
    await listKataDocuments(client, { projectId: "proj-1" });
    assert.equal(listDocumentsCalls[0]?.title, undefined);
  });

  it("passes projectId to listDocuments (no issueId)", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient({ listDocumentsResult: [] });
    await listKataDocuments(client, { projectId: "proj-777" });
    assert.equal(listDocumentsCalls[0]?.projectId, "proj-777");
    assert.equal(listDocumentsCalls[0]?.issueId, undefined);
  });

  it("passes issueId to listDocuments (no projectId)", async () => {
    const { client, listDocumentsCalls } = makeMockDocumentClient({ listDocumentsResult: [] });
    await listKataDocuments(client, { issueId: "issue-444" });
    assert.equal(listDocumentsCalls[0]?.issueId, "issue-444");
    assert.equal(listDocumentsCalls[0]?.projectId, undefined);
  });
});
