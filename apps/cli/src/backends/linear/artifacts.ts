import type { KataArtifactType, KataScopeType } from "../../domain/types.js";
import { ARTIFACT_TYPES, MARKER_PREFIX, MARKER_SUFFIX, SCOPE_TYPES } from "../shared/artifact-marker.js";
import type { LinearClient } from "./client.js";

export interface ParsedLinearArtifactMarker {
  scopeType: KataScopeType;
  scopeId: string;
  artifactType: KataArtifactType;
  content: string;
}

export interface LinearArtifactWriteResult {
  backendId: string;
  body: string;
  title?: string;
  updatedAt?: string;
}

interface LinearCommentNode {
  id: string;
  body?: string | null;
}

interface LinearDocumentNode {
  id: string;
  title: string;
  content?: string | null;
  updatedAt?: string | null;
}

const ISSUE_COMMENTS_QUERY = `
  query LinearKataIssueComments($issueId: String!, $after: String) {
    issue(id: $issueId) {
      comments(first: 100, after: $after) {
        nodes { id body }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const PROJECT_DOCUMENTS_QUERY = `
  query LinearKataProjectDocuments($projectId: String!, $after: String) {
    project(id: $projectId) {
      documents(first: 100, after: $after) {
        nodes { id title content updatedAt }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const COMMENT_CREATE_MUTATION = `
  mutation LinearKataCommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) { success comment { id body } }
  }
`;

const COMMENT_UPDATE_MUTATION = `
  mutation LinearKataCommentUpdate($id: String!, $input: CommentUpdateInput!) {
    commentUpdate(id: $id, input: $input) { success comment { id body } }
  }
`;

const DOCUMENT_CREATE_MUTATION = `
  mutation LinearKataDocumentCreate($input: DocumentCreateInput!) {
    documentCreate(input: $input) { success document { id title content updatedAt } }
  }
`;

const DOCUMENT_UPDATE_MUTATION = `
  mutation LinearKataDocumentUpdate($id: String!, $input: DocumentUpdateInput!) {
    documentUpdate(id: $id, input: $input) { success document { id title content updatedAt } }
  }
`;

export function formatLinearArtifactMarker(input: ParsedLinearArtifactMarker): string {
  const marker = JSON.stringify({
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    artifactType: input.artifactType,
  });

  return `${MARKER_PREFIX}${marker}${MARKER_SUFFIX}\n${input.content}`;
}

export function parseLinearArtifactMarker(body: string): ParsedLinearArtifactMarker | null {
  const newlineIndex = body.indexOf("\n");
  const rawMarkerLine = newlineIndex === -1 ? body : body.slice(0, newlineIndex);
  const markerLine = rawMarkerLine.endsWith("\r") ? rawMarkerLine.slice(0, -1) : rawMarkerLine;

  if (!markerLine.startsWith(MARKER_PREFIX) || !markerLine.endsWith(MARKER_SUFFIX)) {
    return null;
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(markerLine.slice(MARKER_PREFIX.length, -MARKER_SUFFIX.length));
  } catch {
    return null;
  }

  if (!isValidArtifactMetadata(metadata)) return null;
  return {
    ...metadata,
    content: newlineIndex === -1 ? "" : body.slice(newlineIndex + 1),
  };
}

export async function upsertLinearIssueArtifactComment(input: {
  client: LinearClient;
  issueId: string;
  scopeType: KataScopeType;
  scopeId: string;
  artifactType: KataArtifactType;
  content: string;
}): Promise<LinearArtifactWriteResult> {
  const body = formatLinearArtifactMarker({
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    artifactType: input.artifactType,
    content: input.content,
  });
  const existing = await findExistingLinearIssueArtifactComment(input);

  if (existing) {
    const data = await input.client.graphql<{ commentUpdate: { comment: LinearCommentNode } }>({
      query: COMMENT_UPDATE_MUTATION,
      variables: { id: existing.id, input: { body } },
    });
    return {
      backendId: `comment:${data.commentUpdate.comment.id}`,
      body: data.commentUpdate.comment.body ?? body,
    };
  }

  const data = await input.client.graphql<{ commentCreate: { comment: LinearCommentNode } }>({
    query: COMMENT_CREATE_MUTATION,
    variables: { input: { issueId: input.issueId, body } },
  });
  return {
    backendId: `comment:${data.commentCreate.comment.id}`,
    body: data.commentCreate.comment.body ?? body,
  };
}

export async function upsertLinearMilestoneDocument(input: {
  client: LinearClient;
  projectId: string;
  scopeId: string;
  artifactType: KataArtifactType;
  title: string;
  content: string;
}): Promise<LinearArtifactWriteResult> {
  const body = formatLinearArtifactMarker({
    scopeType: "milestone",
    scopeId: input.scopeId,
    artifactType: input.artifactType,
    content: input.content,
  });
  const title = `${input.scopeId} ${input.title}`;
  const existing = await findExistingLinearMilestoneDocument(input);

  if (existing) {
    const data = await input.client.graphql<{ documentUpdate: { document: LinearDocumentNode } }>({
      query: DOCUMENT_UPDATE_MUTATION,
      variables: { id: existing.id, input: { title, content: body } },
    });
    return {
      backendId: `document:${data.documentUpdate.document.id}`,
      body: data.documentUpdate.document.content ?? body,
      title: data.documentUpdate.document.title,
      updatedAt: data.documentUpdate.document.updatedAt ?? undefined,
    };
  }

  const data = await input.client.graphql<{ documentCreate: { document: LinearDocumentNode } }>({
    query: DOCUMENT_CREATE_MUTATION,
    variables: { input: { projectId: input.projectId, title, content: body } },
  });
  return {
    backendId: `document:${data.documentCreate.document.id}`,
    body: data.documentCreate.document.content ?? body,
    title: data.documentCreate.document.title,
    updatedAt: data.documentCreate.document.updatedAt ?? undefined,
  };
}

async function findExistingLinearIssueArtifactComment(input: {
  client: LinearClient;
  issueId: string;
  scopeType: KataScopeType;
  scopeId: string;
  artifactType: KataArtifactType;
}): Promise<LinearCommentNode | null> {
  let after: string | null = null;

  for (let page = 1; page <= 100; page += 1) {
    const data: {
      issue?: {
        comments?: {
          nodes?: Array<LinearCommentNode | null> | null;
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        } | null;
      } | null;
    } = await input.client.graphql({
      query: ISSUE_COMMENTS_QUERY,
      variables: { issueId: input.issueId, after },
    });
    const connection: {
      nodes?: Array<LinearCommentNode | null> | null;
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    } | null | undefined = data.issue?.comments;
    if (!connection) return null;
    for (const comment of connection.nodes ?? []) {
      if (!comment) continue;
      const parsed = typeof comment.body === "string" ? parseLinearArtifactMarker(comment.body) : null;
      if (parsed?.scopeType === input.scopeType && parsed.scopeId === input.scopeId && parsed.artifactType === input.artifactType) {
        return comment;
      }
    }
    if (!connection.pageInfo.hasNextPage) return null;
    after = connection.pageInfo.endCursor ?? null;
  }

  return null;
}

async function findExistingLinearMilestoneDocument(input: {
  client: LinearClient;
  projectId: string;
  scopeId: string;
  artifactType: KataArtifactType;
}): Promise<LinearDocumentNode | null> {
  let after: string | null = null;

  for (let page = 1; page <= 100; page += 1) {
    const data: {
      project?: {
        documents?: {
          nodes?: Array<LinearDocumentNode | null> | null;
          pageInfo: { hasNextPage: boolean; endCursor?: string | null };
        } | null;
      } | null;
    } = await input.client.graphql({
      query: PROJECT_DOCUMENTS_QUERY,
      variables: { projectId: input.projectId, after },
    });
    const connection: {
      nodes?: Array<LinearDocumentNode | null> | null;
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    } | null | undefined = data.project?.documents;
    if (!connection) return null;
    for (const document of connection.nodes ?? []) {
      if (!document) continue;
      const parsed = typeof document.content === "string" ? parseLinearArtifactMarker(document.content) : null;
      if (parsed?.scopeType === "milestone" && parsed.scopeId === input.scopeId && parsed.artifactType === input.artifactType) {
        return document;
      }
    }
    if (!connection.pageInfo.hasNextPage) return null;
    after = connection.pageInfo.endCursor ?? null;
  }

  return null;
}

function isValidArtifactMetadata(metadata: unknown): metadata is Omit<ParsedLinearArtifactMarker, "content"> {
  if (!metadata || typeof metadata !== "object") return false;
  const candidate = metadata as Partial<Record<keyof ParsedLinearArtifactMarker, unknown>>;
  return isKnownScopeType(candidate.scopeType) &&
    typeof candidate.scopeId === "string" &&
    candidate.scopeId.trim().length > 0 &&
    isKnownArtifactType(candidate.artifactType);
}

function isKnownScopeType(value: unknown): value is KataScopeType {
  return typeof value === "string" && SCOPE_TYPES.includes(value as KataScopeType);
}

function isKnownArtifactType(value: unknown): value is KataArtifactType {
  return typeof value === "string" && ARTIFACT_TYPES.includes(value as KataArtifactType);
}
