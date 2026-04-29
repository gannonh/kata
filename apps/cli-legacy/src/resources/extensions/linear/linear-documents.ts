/**
 * Document naming functions and structural client interface for Linear Documents.
 *
 * Pure layer — no API calls, no network dependencies, no imports beyond types.
 * All document operations that touch the Linear API live in T02 (writeKataDocument, etc.).
 */

import type {
  LinearDocument,
  DocumentAttachment,
  DocumentCreateInput,
  DocumentUpdateInput,
} from "./linear-types.js";

// =============================================================================
// Re-export for consumers
// =============================================================================

export type { DocumentAttachment };

// =============================================================================
// Naming Functions
// =============================================================================

/**
 * Build a Linear document title from a Kata ID and artifact type.
 *
 * Examples:
 *   buildDocumentTitle("M001", "ROADMAP")   → "M001-ROADMAP"
 *   buildDocumentTitle("S01",  "PLAN")      → "S01-PLAN"
 *   buildDocumentTitle("T01",  "SUMMARY")   → "T01-SUMMARY"
 *   buildDocumentTitle(null,   "DECISIONS") → "DECISIONS"
 *   buildDocumentTitle(null,   "PROJECT")   → "PROJECT"
 */
export function buildDocumentTitle(kataId: string | null, artifactType: string): string {
  if (kataId === null) {
    return artifactType;
  }
  return `${kataId}-${artifactType}`;
}

/**
 * Parse a Linear document title back into its components.
 *
 * Returns `{ kataId, artifactType }` where:
 *   - `kataId` is the uppercase prefix before the first dash (e.g. "M001", "S01"),
 *     or `null` for root-level titles with no uppercase prefix before a dash
 *     (or titles with no dash at all)
 *   - `artifactType` is the remainder (e.g. "ROADMAP", "PLAN", "DECISIONS")
 *
 * Returns `null` only for empty/blank strings.
 *
 * Decision rule for kataId detection:
 *   A title has a kataId if and only if the text before the first dash consists
 *   entirely of uppercase letters and digits (e.g. "M001", "S01", "T04", "KATA").
 *   If the prefix contains lowercase letters or symbols, treat the entire string
 *   as a root-level artifactType with kataId = null.
 *
 * Examples:
 *   "M001-ROADMAP"  → { kataId: "M001", artifactType: "ROADMAP" }
 *   "S01-PLAN"      → { kataId: "S01",  artifactType: "PLAN" }
 *   "T01-SUMMARY"   → { kataId: "T01",  artifactType: "SUMMARY" }
 *   "DECISIONS"     → { kataId: null,   artifactType: "DECISIONS" }
 *   "KATA-WORKFLOW" → { kataId: "KATA", artifactType: "WORKFLOW" }
 *   ""              → null
 *   "   "           → null
 */
export function parseDocumentTitle(
  title: string,
): { kataId: string | null; artifactType: string } | null {
  if (!title || title.trim() === "") {
    return null;
  }

  const dashIndex = title.indexOf("-");
  if (dashIndex === -1) {
    // No dash — entire title is the artifactType, kataId is null
    return { kataId: null, artifactType: title };
  }

  const prefix = title.slice(0, dashIndex);
  const rest = title.slice(dashIndex + 1);

  // Prefix must be all uppercase letters and digits to qualify as a kataId
  if (/^[A-Z0-9]+$/.test(prefix)) {
    return { kataId: prefix, artifactType: rest };
  }

  // Prefix has lowercase or symbols — treat the whole thing as artifactType
  return { kataId: null, artifactType: title };
}

// =============================================================================
// Core Document Operations
// =============================================================================

/**
 * Write a Kata artifact as a Linear Document (upsert by title).
 *
 * - If a document with the given title already exists in the attachment target,
 *   update its content and return the updated document.
 * - If no matching document exists, create a new one and return it.
 *
 * The returned document always carries the Linear UUID — callers can log or
 * surface `result.id` for later direct `getDocument` access, and check
 * `result.updatedAt` to confirm upsert vs create.
 *
 * @param client   - A LinearDocumentClient (or LinearClient directly)
 * @param title    - The document title, e.g. "M001-ROADMAP" or "DECISIONS"
 * @param content  - Markdown content to write
 * @param attachment - Exactly one of `{ projectId }` or `{ issueId }`
 */
export async function writeKataDocument(
  client: LinearDocumentClient,
  title: string,
  content: string,
  attachment: DocumentAttachment,
): Promise<LinearDocument> {
  const existing = await client.listDocuments({ title, ...attachment });
  if (existing.length > 0) {
    return client.updateDocument(existing[0].id, { content });
  }
  return client.createDocument({ title, content, ...attachment });
}

/**
 * Read a Kata artifact document by title from the attachment target.
 *
 * Returns the document if found, or `null` if no matching document exists.
 * Documents with empty content are treated as valid and returned (not null).
 *
 * `null` is the canonical signal for "document not written yet" — check for it
 * before assuming a planning artifact has been persisted.
 *
 * @param client   - A LinearDocumentClient (or LinearClient directly)
 * @param title    - The document title to look up
 * @param attachment - Exactly one of `{ projectId }` or `{ issueId }`
 */
export async function readKataDocument(
  client: LinearDocumentClient,
  title: string,
  attachment: DocumentAttachment,
): Promise<LinearDocument | null> {
  const results = await client.listDocuments({ title, ...attachment });
  return results[0] ?? null;
}

/**
 * List all Kata documents attached to a given project or issue.
 *
 * Does not filter by title — returns every document in the attachment target.
 * Use this as the zero-side-effect inspection surface to enumerate what has
 * been written to a project or issue.
 *
 * @param client   - A LinearDocumentClient (or LinearClient directly)
 * @param attachment - Exactly one of `{ projectId }` or `{ issueId }`
 */
export async function listKataDocuments(
  client: LinearDocumentClient,
  attachment: DocumentAttachment,
): Promise<LinearDocument[]> {
  return client.listDocuments({ ...attachment });
}

// =============================================================================
// LinearDocumentClient — structural interface for mocks
// =============================================================================

/**
 * Structural interface for document operations.
 *
 * Mirrors the `LinearEntityClient` pattern from S03: callers and tests depend on
 * this interface rather than `LinearClient` directly, enabling lightweight inline
 * mocks without importing the full client.
 *
 * `LinearClient` satisfies this interface — no adapter needed.
 */
export interface LinearDocumentClient {
  createDocument(input: DocumentCreateInput): Promise<LinearDocument>;
  getDocument(id: string): Promise<LinearDocument | null>;
  updateDocument(id: string, input: DocumentUpdateInput): Promise<LinearDocument>;
  listDocuments(opts?: {
    projectId?: string;
    issueId?: string;
    title?: string;
    first?: number;
  }): Promise<LinearDocument[]>;
}
