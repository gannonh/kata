import { KataDomainError, type KataDomainErrorCode } from "../../domain/errors.js";

const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";
const DEFAULT_MAX_PAGES = 100;

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

interface LinearPaginateInput<Node, Data> extends LinearGraphqlInput {
  selectConnection: (data: Data) => LinearConnection<Node>;
  maxPages?: number;
}

interface LinearClient {
  graphql<T>(graphqlInput: LinearGraphqlInput): Promise<T>;
  paginate<Node, Data>(paginateInput: LinearPaginateInput<Node, Data>): Promise<Node[]>;
}

export function createLinearClient(input: LinearClientInput): LinearClient {
  const request = input.fetch ?? fetch;

  const client: LinearClient = {
    async graphql<T>(graphqlInput: LinearGraphqlInput): Promise<T> {
      const response = await request(LINEAR_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: input.token,
          "Content-Type": "application/json",
          "User-Agent": "@kata-sh/cli",
        },
        body: JSON.stringify(graphqlInput),
      });

      return parseLinearResponse<T>(response);
    },

    async paginate<Node, Data>({
      query,
      variables,
      selectConnection,
      maxPages = DEFAULT_MAX_PAGES,
    }: LinearPaginateInput<Node, Data>): Promise<Node[]> {
      const nodes: Node[] = [];
      let after: string | null | undefined;

      for (let page = 0; page < maxPages; page += 1) {
        const pageVariables = after == null ? variables : { ...variables, after };
        const data = await client.graphql<Data>({ query, variables: pageVariables });
        const connection = selectConnection(data);

        for (const node of connection.nodes ?? []) {
          if (node != null) {
            nodes.push(node);
          }
        }

        if (!connection.pageInfo.hasNextPage) {
          return nodes;
        }

        if (!connection.pageInfo.endCursor) {
          throw new KataDomainError("UNKNOWN", "Linear connection reported another page without an end cursor.");
        }

        after = connection.pageInfo.endCursor;
      }

      throw new KataDomainError(
        "UNKNOWN",
        `Unable to paginate Linear connection after ${maxPages} full pages.`,
      );
    },
  };

  return client;
}

function statusCodeToErrorCode(status: number): KataDomainErrorCode {
  if (status === 401 || status === 403) {
    return "UNAUTHORIZED";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  return "NETWORK";
}

async function parseLinearResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new KataDomainError(
      statusCodeToErrorCode(response.status),
      `Linear request failed (${response.status}): ${text}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new KataDomainError("NETWORK", "Linear response was not valid JSON.");
  }

  if (!isRecord(payload)) {
    throw new KataDomainError("UNKNOWN", "Linear GraphQL response did not include data.");
  }

  const errors = payload.errors;
  if (Array.isArray(errors) && errors.length) {
    const message = errors.map(formatGraphqlError).join("; ");
    throw new KataDomainError("UNKNOWN", message);
  }

  if (payload.data != null) {
    return payload.data as T;
  }

  throw new KataDomainError("UNKNOWN", "Linear GraphQL response did not include data.");
}

function isRecord(payload: unknown): payload is Record<string, unknown> & GraphqlResponse<unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload);
}

function formatGraphqlError(error: unknown): string {
  if (isRecord(error) && typeof error.message === "string" && error.message) {
    return error.message;
  }

  return "Unknown GraphQL error";
}
