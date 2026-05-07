import type { KataArtifactType, KataScopeType } from "../../domain/types.js";
import type { createGithubClient } from "./client.js";

const MARKER_PREFIX = "<!-- kata:artifact ";
const MARKER_SUFFIX = " -->";
const COMMENTS_PER_PAGE = 100;
const MAX_COMMENT_PAGES = 100;

const SCOPE_TYPES = ["project", "milestone", "slice", "task", "issue"] satisfies KataScopeType[];
const ARTIFACT_TYPES = [
  "project-brief",
  "requirements",
  "roadmap",
  "phase-context",
  "context",
  "decisions",
  "research",
  "plan",
  "slice",
  "summary",
  "verification",
  "uat",
  "retrospective",
] satisfies KataArtifactType[];

export interface ParsedArtifactComment {
  scopeType: KataScopeType;
  scopeId: string;
  artifactType: KataArtifactType;
  content: string;
}

export type FormatArtifactCommentInput = ParsedArtifactComment;
export type ArtifactCommentScope = Pick<ParsedArtifactComment, "scopeType" | "scopeId">;

export interface UpsertArtifactCommentInput extends ParsedArtifactComment {
  client: ReturnType<typeof createGithubClient>;
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface UpsertArtifactCommentResult {
  backendId: string;
  body: string;
}

interface GithubIssueComment {
  id: number | string;
  body?: string | null;
}

export function formatArtifactComment(input: FormatArtifactCommentInput): string {
  const marker = JSON.stringify({
    artifactType: input.artifactType,
  });

  return `${MARKER_PREFIX}${marker}${MARKER_SUFFIX}\n${input.content}`;
}

export function parseArtifactComment(body: string, scope?: ArtifactCommentScope): ParsedArtifactComment | null {
  const newlineIndex = body.indexOf("\n");
  const markerLine = newlineIndex === -1 ? body : body.slice(0, newlineIndex);

  if (!markerLine.startsWith(MARKER_PREFIX) || !markerLine.endsWith(MARKER_SUFFIX)) {
    return null;
  }

  const marker = markerLine.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length);
  let metadata: unknown;

  try {
    metadata = JSON.parse(marker);
  } catch {
    return null;
  }

  if (isValidArtifactMetadata(metadata)) {
    return {
      ...metadata,
      content: newlineIndex === -1 ? "" : body.slice(newlineIndex + 1),
    };
  }

  if (scope && isValidArtifactTypeMetadata(metadata)) {
    return {
      ...scope,
      artifactType: metadata.artifactType,
      content: newlineIndex === -1 ? "" : body.slice(newlineIndex + 1),
    };
  }

  return null;
}

export async function upsertArtifactComment(input: UpsertArtifactCommentInput): Promise<UpsertArtifactCommentResult> {
  const commentsPath = `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`;
  const body = formatArtifactComment(input);
  const existingComment = await findExistingArtifactComment(input, commentsPath);

  if (existingComment) {
    const updated = await input.client.rest<GithubIssueComment>({
      method: "PATCH",
      path: `/repos/${input.owner}/${input.repo}/issues/comments/${existingComment.id}`,
      body: { body },
    });

    return {
      backendId: `comment:${updated.id}`,
      body: updated.body ?? body,
    };
  }

  const created = await input.client.rest<GithubIssueComment>({
    method: "POST",
    path: commentsPath,
    body: { body },
  });

  return {
    backendId: `comment:${created.id}`,
    body: created.body ?? body,
  };
}

async function findExistingArtifactComment(
  input: UpsertArtifactCommentInput,
  commentsPath: string,
): Promise<GithubIssueComment | null> {
  for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
    const comments = await input.client.rest<GithubIssueComment[]>({
      method: "GET",
      path: `${commentsPath}?per_page=${COMMENTS_PER_PAGE}&page=${page}`,
    });

    const existingComment = comments.find((comment) => {
      const parsed = typeof comment.body === "string" ? parseArtifactComment(comment.body, input) : null;

      return (
        parsed?.scopeType === input.scopeType &&
        parsed.scopeId === input.scopeId &&
        parsed.artifactType === input.artifactType
      );
    });

    if (existingComment) {
      return existingComment;
    }

    if (comments.length < COMMENTS_PER_PAGE) {
      return null;
    }
  }

  throw new Error(`Unable to search artifact comments after ${MAX_COMMENT_PAGES} full pages`);
}

function isValidArtifactMetadata(metadata: unknown): metadata is Omit<ParsedArtifactComment, "content"> {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const candidate = metadata as Partial<Record<keyof ParsedArtifactComment, unknown>>;

  return (
    isKnownScopeType(candidate.scopeType) &&
    typeof candidate.scopeId === "string" &&
    candidate.scopeId.length > 0 &&
    isKnownArtifactType(candidate.artifactType)
  );
}

function isValidArtifactTypeMetadata(metadata: unknown): metadata is Pick<ParsedArtifactComment, "artifactType"> {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const candidate = metadata as Partial<Record<keyof ParsedArtifactComment, unknown>>;
  return isKnownArtifactType(candidate.artifactType);
}

function isKnownScopeType(value: unknown): value is KataScopeType {
  return typeof value === "string" && SCOPE_TYPES.includes(value as KataScopeType);
}

function isKnownArtifactType(value: unknown): value is KataArtifactType {
  return typeof value === "string" && ARTIFACT_TYPES.includes(value as KataArtifactType);
}
