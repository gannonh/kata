import { KataDomainError } from "../../domain/errors.js";
import type { KataArtifactType, KataScopeType } from "../../domain/types.js";
import type { createLinearClient, LinearConnection } from "./client.js";

const MARKER_PREFIX = "<!-- kata:artifact ";
const MARKER_SUFFIX = " -->";
const PAGE_SIZE = 100;

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

export const LinearKataIssueComments = `
  query LinearKataIssueComments($issueId: String!, $first: Int!, $after: String) {
    issue(id: $issueId) {
      comments(first: $first, after: $after) {
        nodes {
          id
          body
          updatedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const LinearKataProjectDocuments = `
  query LinearKataProjectDocuments($projectId: ID!, $first: Int!, $after: String) {
    documents(first: $first, after: $after, filter: { project: { id: { eq: $projectId } } }) {
      nodes {
        id
        title
        content
        updatedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const LINEAR_KATA_COMMENT_CREATE_MUTATION = `
  mutation LinearKataCommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment {
        id
        body
        updatedAt
      }
    }
  }
`;

const LINEAR_KATA_COMMENT_UPDATE_MUTATION = `
  mutation LinearKataCommentUpdate($id: String!, $input: CommentUpdateInput!) {
    commentUpdate(id: $id, input: $input) {
      success
      comment {
        id
        body
        updatedAt
      }
    }
  }
`;

const LINEAR_KATA_DOCUMENT_CREATE_MUTATION = `
  mutation LinearKataDocumentCreate($input: DocumentCreateInput!) {
    documentCreate(input: $input) {
      success
      document {
        id
        title
        content
        updatedAt
      }
    }
  }
`;

const LINEAR_KATA_DOCUMENT_UPDATE_MUTATION = `
  mutation LinearKataDocumentUpdate($id: String!, $input: DocumentUpdateInput!) {
    documentUpdate(id: $id, input: $input) {
      success
      document {
        id
        title
        content
        updatedAt
      }
    }
  }
`;

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

export type FormatLinearArtifactMarkerInput = ParsedLinearArtifactMarker;

interface UpsertLinearIssueArtifactCommentInput extends ParsedLinearArtifactMarker {
  client: ReturnType<typeof createLinearClient>;
  issueId: string;
}

interface UpsertLinearMilestoneDocumentInput {
  client: ReturnType<typeof createLinearClient>;
  projectId: string;
  scopeType?: Extract<KataScopeType, "project" | "milestone">;
  scopeId: string;
  artifactType: KataArtifactType;
  title: string;
  content: string;
}

interface LinearIssueComment {
  id: string;
  body?: string | null;
  updatedAt?: string | null;
}

interface LinearProjectDocument {
  id: string;
  title?: string | null;
  content?: string | null;
  updatedAt?: string | null;
}

interface LinearMutationPayload<Node> {
  success?: boolean;
  comment?: Node | null;
  document?: Node | null;
}

export function formatLinearArtifactMarker(input: FormatLinearArtifactMarkerInput): string {
  const marker = JSON.stringify({
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    artifactType: input.artifactType,
  });

  return `${MARKER_PREFIX}${marker}${MARKER_SUFFIX}\n${input.content}`;
}

export function parseLinearArtifactMarker(body: string): ParsedLinearArtifactMarker | null {
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

  if (!isValidArtifactMetadata(metadata)) {
    return null;
  }

  return {
    ...metadata,
    content: newlineIndex === -1 ? "" : body.slice(newlineIndex + 1),
  };
}

export async function upsertLinearIssueArtifactComment(
  input: UpsertLinearIssueArtifactCommentInput,
): Promise<LinearArtifactWriteResult> {
  const body = formatLinearArtifactMarker(input);
  const existingComment = await findExistingIssueArtifactComment(input);

  if (existingComment) {
    const data = await input.client.graphql<{
      commentUpdate: LinearMutationPayload<LinearIssueComment>;
    }>({
      query: LINEAR_KATA_COMMENT_UPDATE_MUTATION,
      variables: {
        id: existingComment.id,
        input: { body },
      },
    });
    const comment = requireLinearMutationNode(
      "comment update",
      data.commentUpdate,
      (payload) => payload.comment,
      "comment",
    );

    return {
      backendId: `comment:${comment.id}`,
      body: comment.body ?? body,
      updatedAt: comment.updatedAt ?? undefined,
    };
  }

  const data = await input.client.graphql<{
    commentCreate: LinearMutationPayload<LinearIssueComment>;
  }>({
    query: LINEAR_KATA_COMMENT_CREATE_MUTATION,
    variables: {
      input: {
        issueId: input.issueId,
        body,
      },
    },
  });
  const comment = requireLinearMutationNode(
    "comment create",
    data.commentCreate,
    (payload) => payload.comment,
    "comment",
  );

  return {
    backendId: `comment:${comment.id}`,
    body: comment.body ?? body,
    updatedAt: comment.updatedAt ?? undefined,
  };
}

export async function upsertLinearMilestoneDocument(
  input: UpsertLinearMilestoneDocumentInput,
): Promise<LinearArtifactWriteResult> {
  const scopeType = input.scopeType ?? "milestone";
  const title = scopeType === "project" ? input.title : `${input.scopeId} ${input.title}`;
  const body = formatLinearArtifactMarker({
    scopeType,
    scopeId: input.scopeId,
    artifactType: input.artifactType,
    content: input.content,
  });
  const existingDocument = await findExistingMilestoneDocument({ ...input, scopeType });

  if (existingDocument) {
    const data = await input.client.graphql<{
      documentUpdate: LinearMutationPayload<LinearProjectDocument>;
    }>({
      query: LINEAR_KATA_DOCUMENT_UPDATE_MUTATION,
      variables: {
        id: existingDocument.id,
        input: {
          title,
          content: body,
        },
      },
    });
    const document = requireLinearMutationNode(
      "document update",
      data.documentUpdate,
      (payload) => payload.document,
      "document",
    );

    return {
      backendId: `document:${document.id}`,
      body: document.content ?? body,
      title: document.title ?? title,
      updatedAt: document.updatedAt ?? undefined,
    };
  }

  const data = await input.client.graphql<{
    documentCreate: LinearMutationPayload<LinearProjectDocument>;
  }>({
    query: LINEAR_KATA_DOCUMENT_CREATE_MUTATION,
    variables: {
      input: {
        projectId: input.projectId,
        title,
        content: body,
      },
    },
  });
  const document = requireLinearMutationNode(
    "document create",
    data.documentCreate,
    (payload) => payload.document,
    "document",
  );

  return {
    backendId: `document:${document.id}`,
    body: document.content ?? body,
    title: document.title ?? title,
    updatedAt: document.updatedAt ?? undefined,
  };
}

function requireLinearMutationNode<Node extends { id: string }>(
  operation: string,
  payload: LinearMutationPayload<Node> | null | undefined,
  selectNode: (payload: LinearMutationPayload<Node>) => Node | null | undefined,
  nodeName: string,
): Node {
  if (payload?.success !== true) {
    throw new KataDomainError("UNKNOWN", `Linear artifact ${operation} failed: mutation reported success=false.`);
  }

  const node = selectNode(payload);
  if (typeof node?.id !== "string" || node.id.trim().length === 0) {
    throw new KataDomainError(
      "UNKNOWN",
      `Linear artifact ${operation} failed: mutation response did not include a ${nodeName} id.`,
    );
  }

  return node;
}

async function findExistingIssueArtifactComment(
  input: UpsertLinearIssueArtifactCommentInput,
): Promise<LinearIssueComment | null> {
  const comments = await input.client.paginate<
    LinearIssueComment,
    { issue: { comments: LinearConnection<LinearIssueComment> } }
  >({
    query: LinearKataIssueComments,
    variables: {
      issueId: input.issueId,
      first: PAGE_SIZE,
    },
    selectConnection: (data) => data.issue.comments,
  });

  return (
    comments.find((comment) => {
      const parsed = typeof comment.body === "string" ? parseLinearArtifactMarker(comment.body) : null;

      return (
        parsed?.scopeType === input.scopeType &&
        parsed.scopeId === input.scopeId &&
        parsed.artifactType === input.artifactType
      );
    }) ?? null
  );
}

async function findExistingMilestoneDocument(
  input: UpsertLinearMilestoneDocumentInput & { scopeType: Extract<KataScopeType, "project" | "milestone"> },
): Promise<LinearProjectDocument | null> {
  const documents = await input.client.paginate<
    LinearProjectDocument,
    { documents: LinearConnection<LinearProjectDocument> }
  >({
    query: LinearKataProjectDocuments,
    variables: {
      projectId: input.projectId,
      first: PAGE_SIZE,
    },
    selectConnection: (data) => data.documents,
  });

  return (
    documents.find((document) => {
      const parsed = typeof document.content === "string" ? parseLinearArtifactMarker(document.content) : null;

      return (
        parsed?.scopeType === input.scopeType &&
        parsed.scopeId === input.scopeId &&
        parsed.artifactType === input.artifactType
      );
    }) ?? null
  );
}

function isValidArtifactMetadata(metadata: unknown): metadata is Omit<ParsedLinearArtifactMarker, "content"> {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const candidate = metadata as Partial<Record<keyof ParsedLinearArtifactMarker, unknown>>;

  return (
    isKnownScopeType(candidate.scopeType) &&
    typeof candidate.scopeId === "string" &&
    candidate.scopeId.trim().length > 0 &&
    isKnownArtifactType(candidate.artifactType)
  );
}

function isKnownScopeType(value: unknown): value is KataScopeType {
  return typeof value === "string" && SCOPE_TYPES.includes(value as KataScopeType);
}

function isKnownArtifactType(value: unknown): value is KataArtifactType {
  return typeof value === "string" && ARTIFACT_TYPES.includes(value as KataArtifactType);
}
