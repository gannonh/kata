import { KataDomainError } from "../../domain/errors.js";

export type FetchLike = typeof fetch;

export interface LinearClientInput {
  token: string;
  fetch?: FetchLike;
}

export interface LinearGraphqlInput {
  query: string;
  variables?: Record<string, unknown>;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

export interface LinearPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface LinearConnection<T> {
  nodes?: Array<T | null> | null;
  pageInfo: LinearPageInfo;
}

export interface LinearClient {
  graphql<T>(input: LinearGraphqlInput): Promise<T>;
  paginate<Node, Data>(input: {
    query: string;
    variables?: Record<string, unknown>;
    selectConnection(data: Data): LinearConnection<Node> | undefined | null;
    maxPages?: number;
  }): Promise<Node[]>;
}

function statusCodeToErrorCode(status: number): KataDomainError["code"] {
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 429) return "RATE_LIMITED";
  return "NETWORK";
}

export function createLinearClient(input: LinearClientInput): LinearClient {
  const request = input.fetch ?? fetch;

  const client: LinearClient = {
    async graphql<T>(graphqlInput: LinearGraphqlInput): Promise<T> {
      const response = await request("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          Authorization: normalizeLinearAuthorizationHeader(input.token),
          "Content-Type": "application/json",
          "User-Agent": "@kata-sh/cli",
        },
        body: JSON.stringify(graphqlInput),
      });

      return parseLinearResponse<T>(response);
    },

    async paginate<Node, Data>(paginateInput: {
      query: string;
      variables?: Record<string, unknown>;
      selectConnection(data: Data): LinearConnection<Node> | undefined | null;
      maxPages?: number;
    }): Promise<Node[]> {
      const nodes: Node[] = [];
      let after: string | null = null;
      const maxPages = paginateInput.maxPages ?? 100;

      for (let page = 1; page <= maxPages; page += 1) {
        const data = await client.graphql<Data>({
          query: paginateInput.query,
          variables: {
            ...(paginateInput.variables ?? {}),
            after,
          },
        });
        const connection = paginateInput.selectConnection(data);
        if (!connection) return nodes;
        nodes.push(...(connection.nodes ?? []).filter((node): node is Node => node !== null));
        if (!connection.pageInfo.hasNextPage) return nodes;
        after = connection.pageInfo.endCursor ?? null;
      }

      throw new KataDomainError("UNKNOWN", `Unable to paginate Linear connection after ${maxPages} full pages.`);
    },
  };

  return client;
}

export function normalizeLinearAuthorizationHeader(token: string): string {
  const trimmed = token.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) return trimmed;
  if (trimmed.startsWith("lin_api_")) return trimmed;
  if (trimmed.startsWith("lin_oauth_")) return `Bearer ${trimmed}`;
  return trimmed;
}

async function parseLinearResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new KataDomainError(
      statusCodeToErrorCode(response.status),
      `Linear request failed (${response.status}): ${text}`,
    );
  }

  let payload: GraphqlResponse<T>;
  try {
    payload = text ? JSON.parse(text) as GraphqlResponse<T> : {};
  } catch {
    throw new KataDomainError("NETWORK", "Linear response was not valid JSON.");
  }

  if (payload.errors?.length) {
    throw new KataDomainError(
      "UNKNOWN",
      payload.errors.map((error) => error.message ?? "Unknown GraphQL error").join("; "),
    );
  }
  if (payload.data != null) return payload.data;

  throw new KataDomainError("UNKNOWN", "Linear GraphQL response did not include data.");
}
