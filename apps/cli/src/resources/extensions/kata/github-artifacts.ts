import { parseKataEntityTitle } from "../linear/linear-entities.js";

export type GithubArtifactKind = "milestone" | "slice" | "task" | "document";

export interface GithubArtifactMetadataV1 {
  schema: "kata/github-artifact/v1";
  kind: GithubArtifactKind;
  kataId: string;
  milestoneId?: string;
  sliceId?: string;
  dependsOn?: string[];
  documentTitles?: string[];
}

export type GithubArtifactParseErrorCode =
  | "missing_metadata"
  | "malformed_metadata"
  | "invalid_schema"
  | "invalid_kind"
  | "missing_kata_id"
  | "invalid_kata_id"
  | "invalid_milestone_id"
  | "invalid_slice_id"
  | "invalid_dependency_id";

export interface GithubArtifactParseError {
  code: GithubArtifactParseErrorCode;
  message: string;
}

export type GithubArtifactParseResult =
  | { ok: true; metadata: GithubArtifactMetadataV1 }
  | { ok: false; error: GithubArtifactParseError };

const ARTIFACT_MARKER_RE = /<!--\s*KATA:GITHUB_ARTIFACT\s*([\s\S]*?)\s*-->/i;
const DOCUMENT_BLOCK_RE = /<!--\s*KATA:DOC:([A-Z0-9-]+)\s*-->\n?([\s\S]*?)\n?<!--\s*\/KATA:DOC\s*-->/gi;

const MILESTONE_RE = /^M\d{3}$/;
const SLICE_RE = /^S\d{2}$/;
const TASK_RE = /^T\d{2}$/;

function normalizeKataId(id: string): string {
  return id.trim().toUpperCase();
}

function normalizeDependencyIds(ids: string[] | undefined): string[] {
  if (!ids || ids.length === 0) return [];
  const normalized = ids
    .map((id) => normalizeKataId(String(id)))
    .filter(Boolean);
  return [...new Set(normalized)].sort();
}

function normalizeDocumentTitles(titles: string[] | undefined): string[] {
  if (!titles || titles.length === 0) return [];
  const normalized = titles
    .map((title) => String(title).trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(normalized)].sort();
}

function isValidKataId(kind: GithubArtifactKind, kataId: string): boolean {
  switch (kind) {
    case "milestone":
      return MILESTONE_RE.test(kataId);
    case "slice":
      return SLICE_RE.test(kataId);
    case "task":
      return TASK_RE.test(kataId);
    case "document":
      return kataId.length > 0;
    default:
      return false;
  }
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    throw new Error("metadata payload is not a JSON object");
  }
  return JSON.parse(trimmed);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((v) => (typeof v === "string" ? v : null))
    .filter((v): v is string => v !== null);
  return items;
}

export function formatGithubArtifactMetadata(
  metadata: GithubArtifactMetadataV1,
): GithubArtifactMetadataV1 {
  const kind = metadata.kind;
  const kataId = normalizeKataId(metadata.kataId);

  const normalized: GithubArtifactMetadataV1 = {
    schema: "kata/github-artifact/v1",
    kind,
    kataId,
  };

  const milestoneId = metadata.milestoneId ? normalizeKataId(metadata.milestoneId) : undefined;
  const sliceId = metadata.sliceId ? normalizeKataId(metadata.sliceId) : undefined;

  if (milestoneId) normalized.milestoneId = milestoneId;
  if (sliceId) normalized.sliceId = sliceId;

  const dependsOn = normalizeDependencyIds(metadata.dependsOn);
  if (dependsOn.length > 0) normalized.dependsOn = dependsOn;

  const documentTitles = normalizeDocumentTitles(metadata.documentTitles);
  if (documentTitles.length > 0) normalized.documentTitles = documentTitles;

  return normalized;
}

export function parseGithubArtifactMetadata(body: string): GithubArtifactParseResult {
  const match = body.match(ARTIFACT_MARKER_RE);
  if (!match?.[1]) {
    return {
      ok: false,
      error: {
        code: "missing_metadata",
        message: "Missing GitHub artifact metadata marker (KATA:GITHUB_ARTIFACT).",
      },
    };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = parseJsonObject(match[1]);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "malformed_metadata",
        message: `Malformed GitHub artifact metadata: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  if (!parsedUnknown || typeof parsedUnknown !== "object") {
    return {
      ok: false,
      error: {
        code: "malformed_metadata",
        message: "GitHub artifact metadata must be a JSON object.",
      },
    };
  }

  const parsed = parsedUnknown as Record<string, unknown>;

  if (parsed.schema !== "kata/github-artifact/v1") {
    return {
      ok: false,
      error: {
        code: "invalid_schema",
        message: `Unsupported GitHub artifact metadata schema: ${String(parsed.schema ?? "(missing)")}`,
      },
    };
  }

  const kind = asString(parsed.kind);
  if (!kind || !["milestone", "slice", "task", "document"].includes(kind)) {
    return {
      ok: false,
      error: {
        code: "invalid_kind",
        message: `Unsupported GitHub artifact kind: ${String(parsed.kind ?? "(missing)")}`,
      },
    };
  }

  const kataIdRaw = asString(parsed.kataId);
  if (!kataIdRaw) {
    return {
      ok: false,
      error: {
        code: "missing_kata_id",
        message: "GitHub artifact metadata requires a non-empty kataId.",
      },
    };
  }

  const kataId = normalizeKataId(kataIdRaw);
  if (!isValidKataId(kind as GithubArtifactKind, kataId)) {
    return {
      ok: false,
      error: {
        code: "invalid_kata_id",
        message: `Invalid kataId ${kataId} for artifact kind ${kind}.`,
      },
    };
  }

  const milestoneIdRaw = asString(parsed.milestoneId);
  const milestoneId = milestoneIdRaw ? normalizeKataId(milestoneIdRaw) : undefined;
  if (milestoneId && !MILESTONE_RE.test(milestoneId)) {
    return {
      ok: false,
      error: {
        code: "invalid_milestone_id",
        message: `Invalid milestoneId ${milestoneId}. Expected format M###.`,
      },
    };
  }

  const sliceIdRaw = asString(parsed.sliceId);
  const sliceId = sliceIdRaw ? normalizeKataId(sliceIdRaw) : undefined;
  if (sliceId && !SLICE_RE.test(sliceId)) {
    return {
      ok: false,
      error: {
        code: "invalid_slice_id",
        message: `Invalid sliceId ${sliceId}. Expected format S##.`,
      },
    };
  }

  const dependenciesRaw = asStringArray(parsed.dependsOn) ?? [];
  const dependsOn = normalizeDependencyIds(dependenciesRaw);
  for (const dep of dependsOn) {
    if (!SLICE_RE.test(dep)) {
      return {
        ok: false,
        error: {
          code: "invalid_dependency_id",
          message: `Invalid dependency id ${dep}. Expected slice IDs like S01.`,
        },
      };
    }
  }

  const metadata: GithubArtifactMetadataV1 = {
    schema: "kata/github-artifact/v1",
    kind: kind as GithubArtifactKind,
    kataId,
  };

  if (milestoneId) metadata.milestoneId = milestoneId;
  if (sliceId) metadata.sliceId = sliceId;
  if (dependsOn.length > 0) metadata.dependsOn = dependsOn;

  const documentTitles = normalizeDocumentTitles(asStringArray(parsed.documentTitles));
  if (documentTitles.length > 0) metadata.documentTitles = documentTitles;

  return { ok: true, metadata };
}

export function maybeParseGithubArtifactMetadata(body: string): GithubArtifactMetadataV1 | null {
  const parsed = parseGithubArtifactMetadata(body);
  return parsed.ok ? parsed.metadata : null;
}

export function serializeGithubArtifactMetadata(metadata: GithubArtifactMetadataV1): string {
  const normalized = formatGithubArtifactMetadata(metadata);
  const payload: Record<string, unknown> = {
    schema: normalized.schema,
    kind: normalized.kind,
    kataId: normalized.kataId,
  };

  if (normalized.milestoneId) payload.milestoneId = normalized.milestoneId;
  if (normalized.sliceId) payload.sliceId = normalized.sliceId;
  if (normalized.dependsOn && normalized.dependsOn.length > 0) payload.dependsOn = normalized.dependsOn;
  if (normalized.documentTitles && normalized.documentTitles.length > 0) payload.documentTitles = normalized.documentTitles;

  return `<!-- KATA:GITHUB_ARTIFACT ${JSON.stringify(payload)} -->`;
}

export function upsertGithubArtifactMetadata(body: string | null | undefined, metadata: GithubArtifactMetadataV1): string {
  const marker = serializeGithubArtifactMetadata(metadata);
  const source = (body ?? "").trim();

  if (!source) return `${marker}\n`;

  if (ARTIFACT_MARKER_RE.test(source)) {
    return source.replace(ARTIFACT_MARKER_RE, marker);
  }

  return `${marker}\n\n${source}`;
}

export function stripGithubArtifactMetadata(body: string): string {
  return body.replace(ARTIFACT_MARKER_RE, "").trim();
}

export function readEmbeddedDocument(body: string, documentTitle: string): string | null {
  const normalizedTitle = documentTitle.trim().toUpperCase();
  let match: RegExpExecArray | null;
  DOCUMENT_BLOCK_RE.lastIndex = 0;

  while ((match = DOCUMENT_BLOCK_RE.exec(body)) !== null) {
    const title = (match[1] ?? "").trim().toUpperCase();
    if (title === normalizedTitle) {
      return (match[2] ?? "").trim();
    }
  }

  return null;
}

export function listEmbeddedDocuments(body: string): string[] {
  const docs: string[] = [];
  let match: RegExpExecArray | null;
  DOCUMENT_BLOCK_RE.lastIndex = 0;

  while ((match = DOCUMENT_BLOCK_RE.exec(body)) !== null) {
    const title = (match[1] ?? "").trim().toUpperCase();
    if (title) docs.push(title);
  }

  return [...new Set(docs)].sort();
}

export function upsertEmbeddedDocument(
  body: string,
  documentTitle: string,
  content: string,
): string {
  const normalizedTitle = documentTitle.trim().toUpperCase();
  const block = `<!-- KATA:DOC:${normalizedTitle} -->\n${content.trim()}\n<!-- /KATA:DOC -->`;

  const source = body.trim();
  if (!source) return block;

  const pattern = new RegExp(
    `<!--\\s*KATA:DOC:${normalizedTitle.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*-->\\n?[\\s\\S]*?\\n?<!--\\s*\\/KATA:DOC\\s*-->`,
    "i",
  );

  if (pattern.test(source)) {
    return source.replace(pattern, block).trim();
  }

  return `${source}\n\n${block}`.trim();
}

export function stripEmbeddedDocuments(body: string): string {
  DOCUMENT_BLOCK_RE.lastIndex = 0;
  return body.replace(DOCUMENT_BLOCK_RE, "").trim();
}

export interface ParsedKataTitle {
  kataId: string;
  title: string;
}

export function parseGithubKataTitle(title: string): ParsedKataTitle | null {
  const parsed = parseKataEntityTitle(title);
  if (!parsed) return null;
  return {
    kataId: normalizeKataId(parsed.kataId),
    title: parsed.title,
  };
}
