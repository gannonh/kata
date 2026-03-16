/**
 * pr-address-utils.ts — Utility module for addressing PR review comments.
 *
 * Exports:
 *   - `summarizeComments`: pure function that transforms fetch_comments.py output
 *     into a numbered, actionable comment list (unit-tested in pr-address.test.ts)
 *   - `resolveThread`: thin GraphQL wrapper for the resolveReviewThread mutation
 *   - `replyToThread`: thin GraphQL wrapper for addPullRequestReviewThreadReply mutation
 *
 * All public functions are pure or return structured error objects — they never throw.
 */

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ConversationComment {
  id: string;
  body: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
}

export interface PrReview {
  id: string;
  state: string;
  body: string;
  submittedAt: string;
  author: { login: string };
}

export interface ReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string | null;
  line: number | null;
  comments: {
    nodes: Array<{
      id: string;
      body: string;
      author: { login: string };
      createdAt: string;
    }>;
  };
}

export interface PrMeta {
  number: number;
  url: string;
  title: string;
  state: string;
  owner: string;
  repo: string;
}

export interface FetchCommentsResult {
  pull_request: PrMeta;
  conversation_comments: ConversationComment[];
  reviews: PrReview[];
  review_threads: ReviewThread[];
}

export interface NumberedComment {
  n: number;
  type: "conversation" | "review" | "thread";
  author: string;
  body: string;
  isResolved?: boolean;
  isOutdated?: boolean;
  threadId?: string;
  path?: string | null;
  line?: number | null;
}

export interface SummarizeResult {
  numbered: NumberedComment[];
  totalCount: number;
  actionableCount: number;
}

// ---------------------------------------------------------------------------
// summarizeComments
// ---------------------------------------------------------------------------

/**
 * Transforms raw fetch_comments.py output into a numbered, actionable comment list.
 *
 * - Conversation comments, reviews, and review threads are numbered sequentially.
 * - `actionableCount` counts only thread-type entries that are neither resolved
 *   nor outdated. Conversation comments and reviews are informational, not
 *   action items in the thread-resolution sense.
 * - Returns `{ numbered, totalCount, actionableCount }`.
 */
export function summarizeComments(data: FetchCommentsResult): SummarizeResult {
  let n = 0;
  const numbered: NumberedComment[] = [];

  for (const c of data.conversation_comments) {
    numbered.push({
      n: ++n,
      type: "conversation",
      author: c.author.login,
      body: c.body,
    });
  }

  for (const r of data.reviews) {
    numbered.push({
      n: ++n,
      type: "review",
      author: r.author.login,
      body: r.body || "[no comment]",
    });
  }

  for (const t of data.review_threads) {
    const firstComment = t.comments.nodes[0];
    numbered.push({
      n: ++n,
      type: "thread",
      author: firstComment?.author.login ?? "unknown",
      body: firstComment?.body ?? "",
      isResolved: t.isResolved,
      isOutdated: t.isOutdated,
      threadId: t.id,
      path: t.path,
      line: t.line,
    });
  }

  // Only inline review threads can be "actioned" (resolved/replied to).
  // Conversation comments and reviews are informational.
  const actionableCount = numbered.filter(
    (e) => e.type === "thread" && !e.isResolved && !e.isOutdated,
  ).length;

  return { numbered, totalCount: numbered.length, actionableCount };
}

// ---------------------------------------------------------------------------
// fetchPrComments — replaces fetch_comments.py with native TypeScript
// ---------------------------------------------------------------------------

const FETCH_COMMENTS_QUERY = `query(
  $owner: String!,
  $repo: String!,
  $number: Int!,
  $commentsCursor: String,
  $reviewsCursor: String,
  $threadsCursor: String
) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      url
      title
      state
      comments(first: 100, after: $commentsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          body
          createdAt
          updatedAt
          author { login }
        }
      }
      reviews(first: 100, after: $reviewsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          state
          body
          submittedAt
          author { login }
        }
      }
      reviewThreads(first: 100, after: $threadsCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          diffSide
          startLine
          startDiffSide
          originalLine
          originalStartLine
          resolvedBy { login }
          comments(first: 100) {
            nodes {
              id
              body
              createdAt
              updatedAt
              author { login }
            }
          }
        }
      }
    }
  }
}`;

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface FetchCommentsGraphqlResponse {
  errors?: Array<{ message: string }>;
  data?: {
    repository?: {
      pullRequest?: {
        number: number;
        url: string;
        title: string;
        state: string;
        comments: { pageInfo: PageInfo; nodes: ConversationComment[] };
        reviews: { pageInfo: PageInfo; nodes: PrReview[] };
        reviewThreads: { pageInfo: PageInfo; nodes: ReviewThread[] };
      };
    };
  };
}

function ghGraphql(
  owner: string,
  repo: string,
  number: number,
  cursors: { comments?: string; reviews?: string; threads?: string },
  cwd: string,
): FetchCommentsGraphqlResponse {
  const args = [
    "gh", "api", "graphql",
    "-F", "query=@-",
    "-F", `owner=${owner}`,
    "-F", `repo=${repo}`,
    "-F", `number=${number}`,
  ];
  if (cursors.comments) args.push("-F", `commentsCursor=${cursors.comments}`);
  if (cursors.reviews) args.push("-F", `reviewsCursor=${cursors.reviews}`);
  if (cursors.threads) args.push("-F", `threadsCursor=${cursors.threads}`);

  const raw = execSync(args.map(shellEscape).join(" "), {
    input: FETCH_COMMENTS_QUERY,
    cwd,
    encoding: "utf8",
    ...PIPE,
  });
  return JSON.parse(raw);
}

function getPrRef(cwd: string): { owner: string; repo: string; number: number } {
  const raw = execSync("gh pr view --json number,baseRepositoryOwner,baseRepository", {
    cwd,
    encoding: "utf8",
    ...PIPE,
  });
  const pr = JSON.parse(raw);
  return {
    owner: pr.baseRepositoryOwner.login,
    repo: pr.baseRepository.name,
    number: pr.number,
  };
}

/**
 * Fetches all PR comments, reviews, and review threads via GitHub GraphQL API.
 * Handles pagination automatically. Returns null on failure.
 */
export function fetchPrComments(cwd: string):
  | FetchCommentsResult
  | { ok: false; error: string } {
  try {
    const { owner, repo, number } = getPrRef(cwd);

    const allComments: ConversationComment[] = [];
    const allReviews: PrReview[] = [];
    const allThreads: ReviewThread[] = [];
    let prMeta: PrMeta | null = null;

    let commentsCursor: string | undefined;
    let reviewsCursor: string | undefined;
    let threadsCursor: string | undefined;
    let commentsDone = false;
    let reviewsDone = false;
    let threadsDone = false;

    while (true) {
      const response = ghGraphql(owner, repo, number, {
        comments: commentsDone ? undefined : commentsCursor,
        reviews: reviewsDone ? undefined : reviewsCursor,
        threads: threadsDone ? undefined : threadsCursor,
      }, cwd);

      if (response.errors?.length) {
        return { ok: false, error: response.errors.map(e => e.message).join("; ") };
      }

      const pr = response.data?.repository?.pullRequest;
      if (!pr) {
        return { ok: false, error: "No pull request found in GraphQL response" };
      }

      if (!prMeta) {
        prMeta = { number: pr.number, url: pr.url, title: pr.title, state: pr.state, owner, repo };
      }

      allComments.push(...(pr.comments.nodes || []));
      allReviews.push(...(pr.reviews.nodes || []));
      allThreads.push(...(pr.reviewThreads.nodes || []));

      if (pr.comments.pageInfo.hasNextPage) {
        commentsCursor = pr.comments.pageInfo.endCursor ?? undefined;
      } else {
        commentsDone = true;
      }

      if (pr.reviews.pageInfo.hasNextPage) {
        reviewsCursor = pr.reviews.pageInfo.endCursor ?? undefined;
      } else {
        reviewsDone = true;
      }

      if (pr.reviewThreads.pageInfo.hasNextPage) {
        threadsCursor = pr.reviewThreads.pageInfo.endCursor ?? undefined;
      } else {
        threadsDone = true;
      }

      if (commentsDone && reviewsDone && threadsDone) break;
    }

    return {
      pull_request: prMeta!,
      conversation_comments: allComments,
      reviews: allReviews,
      review_threads: allThreads,
    };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return { ok: false, error: e.stderr ?? e.message ?? String(err) };
  }
}

// ---------------------------------------------------------------------------
// shellEscape (local copy — not re-exported from index.ts)
// ---------------------------------------------------------------------------

/** Shell-escape a single argument (single-quote wrapping with embedded-quote escaping). */
function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

type GraphqlError = {
  message: string;
};

type ResolveThreadResponse = {
  errors?: GraphqlError[];
  data?: {
    resolveReviewThread?: {
      thread?: {
        id: string;
        isResolved: boolean;
      };
    };
  };
};

type ReplyThreadResponse = {
  errors?: GraphqlError[];
  data?: {
    addPullRequestReviewThreadReply?: {
      comment?: {
        id: string;
        body: string;
      };
    };
  };
};

function buildGraphqlErrorMessage(
  errors: readonly GraphqlError[] | undefined,
  fallback: string,
): string {
  if (errors?.length) {
    return errors.map((error) => error.message).join("; ");
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// GraphQL mutations
// ---------------------------------------------------------------------------

const RESOLVE_MUTATION = `mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}`;

const REPLY_MUTATION = `mutation ReplyToThread($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(
    input: { pullRequestReviewThreadId: $threadId, body: $body }
  ) {
    comment { id body author { login } }
  }
}`;

const PIPE = { stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"] };

// ---------------------------------------------------------------------------
// resolveThread
// ---------------------------------------------------------------------------

/**
 * Resolves a PR review thread via the `resolveReviewThread` GraphQL mutation.
 *
 * IMPORTANT: Callers should check `isResolved` before calling — GitHub returns
 * an error if the thread is already resolved.
 *
 * @returns `{ ok: true, thread: { id, isResolved } }` on success,
 *          `{ ok: false, phase: "resolve-failed", error }` on failure.
 *          `error` contains raw `gh api graphql` stderr — no information loss.
 */
export function resolveThread(
  threadId: string,
  cwd?: string,
):
  | { ok: true; thread: { id: string; isResolved: boolean } }
  | { ok: false; phase: "resolve-failed"; error: string } {
  try {
    const cmd =
      "gh api graphql -F query=@- -F " + shellEscape("threadId=" + threadId);
    const raw = execSync(cmd, {
      input: RESOLVE_MUTATION,
      cwd: cwd ?? process.cwd(),
      encoding: "utf8",
      ...PIPE,
    });
    const parsed = JSON.parse(raw) as ResolveThreadResponse;
    if (parsed.errors?.length) {
      return {
        ok: false,
        phase: "resolve-failed",
        error: buildGraphqlErrorMessage(
          parsed.errors,
          "GitHub GraphQL reported a failure while resolving thread",
        ),
      };
    }
    if (!parsed.data || parsed.data.resolveReviewThread == null) {
      return {
        ok: false,
        phase: "resolve-failed",
        error: buildGraphqlErrorMessage(
          parsed.errors,
          "GitHub GraphQL response missing resolveReviewThread payload",
        ),
      };
    }
    const thread = parsed.data.resolveReviewThread.thread;
    if (!thread) {
      return {
        ok: false,
        phase: "resolve-failed",
        error: buildGraphqlErrorMessage(
          parsed.errors,
          "GitHub GraphQL response missing resolveReviewThread thread",
        ),
      };
    }
    return { ok: true, thread: { id: thread.id, isResolved: thread.isResolved } };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return {
      ok: false,
      phase: "resolve-failed",
      error: e.stderr ?? e.message ?? String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// replyToThread
// ---------------------------------------------------------------------------

/**
 * Posts a reply to a PR review thread via `addPullRequestReviewThreadReply`.
 *
 * The reply body is written to a temp file and passed as `-F body=@<tmpPath>`
 * to prevent shell interpolation of newlines and quotes in the body text.
 * The temp file is always cleaned up in a `finally` block.
 *
 * @returns `{ ok: true, comment: { id, body } }` on success,
 *          `{ ok: false, phase: "reply-failed", error }` on failure.
 *          `error` contains raw `gh api graphql` stderr — no information loss.
 */
export function replyToThread(
  threadId: string,
  body: string,
  cwd?: string,
):
  | { ok: true; comment: { id: string; body: string } }
  | { ok: false; phase: "reply-failed"; error: string } {
  const tmpPath = join(tmpdir(), randomUUID() + ".md");
  try {
    writeFileSync(tmpPath, body, "utf8");
    const cmd =
      "gh api graphql -F query=@- -F " +
      shellEscape("threadId=" + threadId) +
      " -F body=@" +
      shellEscape(tmpPath);
    const raw = execSync(cmd, {
      input: REPLY_MUTATION,
      cwd: cwd ?? process.cwd(),
      encoding: "utf8",
      ...PIPE,
    });
    const parsed = JSON.parse(raw) as ReplyThreadResponse;
    if (parsed.errors?.length) {
      return {
        ok: false,
        phase: "reply-failed",
        error: buildGraphqlErrorMessage(
          parsed.errors,
          "GitHub GraphQL reported a failure while posting thread reply",
        ),
      };
    }
    if (!parsed.data || parsed.data.addPullRequestReviewThreadReply == null) {
      return {
        ok: false,
        phase: "reply-failed",
        error: buildGraphqlErrorMessage(
          parsed.errors,
          "GitHub GraphQL response missing addPullRequestReviewThreadReply payload",
        ),
      };
    }
    const comment = parsed.data.addPullRequestReviewThreadReply.comment;
    if (!comment) {
      return {
        ok: false,
        phase: "reply-failed",
        error: buildGraphqlErrorMessage(
          parsed.errors,
          "GitHub GraphQL response missing reply comment payload",
        ),
      };
    }
    return { ok: true, comment: { id: comment.id, body: comment.body } };
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    return {
      ok: false,
      phase: "reply-failed",
      error: e.stderr ?? e.message ?? String(err),
    };
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore temp-file cleanup errors — best effort
    }
  }
}
