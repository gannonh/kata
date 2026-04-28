import { KataDomainError } from "../../domain/errors.js";

export type FetchLike = typeof fetch;

export interface GithubClientInput {
  token: string;
  fetch?: FetchLike;
}

export interface GraphqlInput {
  query: string;
  variables?: Record<string, unknown>;
}

export interface RestInput {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

export function createGithubClient(input: GithubClientInput) {
  const request = input.fetch ?? fetch;

  return {
    async graphql<T>(graphqlInput: GraphqlInput): Promise<T> {
      const response = await request("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
          "User-Agent": "@kata-sh/cli",
        },
        body: JSON.stringify(graphqlInput),
      });

      const payload = await parseResponse<GraphqlResponse<T>>(response);

      if (payload.errors?.length) {
        const message = payload.errors.map((error) => error.message ?? "Unknown GraphQL error").join("; ");
        throw new KataDomainError("UNKNOWN", message);
      }

      if (!payload.data) {
        throw new KataDomainError("UNKNOWN", "GitHub GraphQL response did not include data.");
      }

      return payload.data;
    },

    async rest<T>(restInput: RestInput): Promise<T> {
      const response = await request(`https://api.github.com${restInput.path}`, {
        method: restInput.method,
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "@kata-sh/cli",
        },
        body: restInput.body ? JSON.stringify(restInput.body) : undefined,
      });

      return parseResponse<T>(response);
    },
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new KataDomainError("NETWORK", `GitHub request failed (${response.status}): ${text}`);
  }

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}
