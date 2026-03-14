/**
 * linear-crosslink.ts — Pure helpers for Linear ↔ GitHub PR cross-linking.
 *
 * All gate functions are deterministic and side-effect-free.
 * Linear API functions are best-effort — they catch errors and return
 * structured results, never throw or block PR operations.
 */

import type { KataPrPreferences } from "./preferences.js";

// ─── Gate ─────────────────────────────────────────────────────────────────────

/**
 * Returns true only when both `pr.linear_link` is true AND workflow mode
 * is `linear`. This is the single gate that all cross-linking code checks.
 */
export function shouldCrossLink(
  prPrefs: KataPrPreferences | undefined,
  workflowMode: string,
): boolean {
  if (!prPrefs) return false;
  return prPrefs.linear_link === true && workflowMode === "linear";
}

// ─── PR body references ───────────────────────────────────────────────────────

/**
 * Builds a `## Linear Issues` markdown section with `Closes <identifier>`
 * lines for each provided Linear issue identifier.
 *
 * Returns empty string when identifiers is empty or undefined — callers
 * can safely append the result without checking.
 */
export function buildLinearReferencesSection(
  identifiers: string[] | undefined,
): string {
  if (!identifiers || identifiers.length === 0) return "";

  const lines = identifiers.map((id) => `- Closes ${id}`);
  return `## Linear Issues\n${lines.join("\n")}`;
}

// ─── Linear API helpers (best-effort) ─────────────────────────────────────────

export interface CrossLinkResult {
  ok: boolean;
  error?: string;
}

/**
 * Posts a comment on a Linear issue with the PR URL.
 * Best-effort — returns `{ ok: false, error }` on failure, never throws.
 *
 * Uses the LinearClient's `graphql()` method directly since the client
 * doesn't have a dedicated `createComment` method.
 */
export async function postPrLinkComment(
  client: { graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown> },
  issueId: string,
  prUrl: string,
): Promise<CrossLinkResult> {
  try {
    await client.graphql(
      `mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
        }
      }`,
      {
        input: {
          issueId,
          body: `🔗 **Pull Request:** ${prUrl}`,
        },
      },
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Advances a Linear issue to the "done" (completed) workflow state.
 * Best-effort — returns `{ ok: false, error }` on failure, never throws.
 *
 * Resolves the target state by finding the first workflow state with
 * type "completed" for the given team.
 */
export async function advanceSliceIssueState(
  client: {
    graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown>;
  },
  issueId: string,
  teamId: string,
): Promise<CrossLinkResult> {
  try {
    // Find the completed workflow state for this team
    const statesData = await client.graphql(
      `query ListWorkflowStates($filter: WorkflowStateFilter) {
        workflowStates(first: 100, filter: $filter) {
          nodes { id name type }
        }
      }`,
      {
        filter: { team: { id: { eq: teamId } } },
      },
    ) as { workflowStates: { nodes: Array<{ id: string; name: string; type: string }> } };

    const completedState = statesData.workflowStates.nodes.find(
      (s) => s.type === "completed",
    );

    if (!completedState) {
      return { ok: false, error: "No completed workflow state found for team" };
    }

    // Update the issue state
    await client.graphql(
      `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }`,
      {
        id: issueId,
        input: { stateId: completedState.id },
      },
    );

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolves the Linear issue identifier (e.g. "KAT-42") for the active
 * Kata slice by looking up slice issues in Linear.
 *
 * Uses the kata:slice label to find slice issues in the project, then
 * matches by Kata slice ID in the title (e.g. "[S01]").
 *
 * Returns null if resolution fails for any reason.
 */
export async function resolveSliceLinearIdentifier(
  client: {
    graphql: (query: string, variables?: Record<string, unknown>) => Promise<unknown>;
  },
  projectId: string,
  sliceId: string,
  sliceLabelId?: string,
): Promise<{ identifier: string; issueId: string } | null> {
  try {
    // Search for issues in the project that have the slice label and match the slice ID
    const filter: Record<string, unknown> = {
      project: { id: { eq: projectId } },
    };
    if (sliceLabelId) {
      filter.labels = { some: { id: { eq: sliceLabelId } } };
    }

    const data = await client.graphql(
      `query FindSliceIssue($filter: IssueFilter) {
        issues(first: 50, filter: $filter) {
          nodes {
            id
            identifier
            title
          }
        }
      }`,
      { filter },
    ) as { issues: { nodes: Array<{ id: string; identifier: string; title: string }> } };

    // Match by slice ID pattern in title: "[S01]" or "S01:"
    const slicePattern = new RegExp(`\\[${sliceId}\\]|^${sliceId}:`, "i");
    const match = data.issues.nodes.find((issue) => slicePattern.test(issue.title));

    if (!match) return null;

    return { identifier: match.identifier, issueId: match.id };
  } catch {
    return null;
  }
}
