import { KataDomainError } from "../../domain/errors.js";

export interface LinearHealthClientInput {
  apiKey: string;
  fetch?: typeof fetch;
}

export interface LinearViewer {
  id: string;
  name: string;
  email: string;
  organization: { id: string; name: string } | null;
}

export interface LinearTeamSummary {
  id: string;
  key: string;
  name: string;
}

export interface LinearProjectSummary {
  id: string;
  name: string;
  slugId: string;
  state: string;
  url: string;
}

export interface LinearKataMetadataSupport {
  kataId: boolean;
  parentLinks: boolean;
  artifactScope: boolean;
  verificationState: boolean;
  dependencyBlocking: boolean;
  blockedByRelations: boolean;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

export interface LinearHealthClient {
  getViewer(): Promise<LinearViewer>;
  getTeam(teamIdOrKey: string): Promise<LinearTeamSummary | null>;
  getProject(projectIdOrSlug: string): Promise<LinearProjectSummary | null>;
  getKataMetadataSupport(): Promise<LinearKataMetadataSupport>;
}

export function createLinearHealthClient(input: LinearHealthClientInput): LinearHealthClient {
  const request = input.fetch ?? fetch;

  async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await request("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: input.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "@kata-sh/cli",
      },
      body: JSON.stringify({ query, variables }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new KataDomainError("NETWORK", `Linear request failed (${response.status}): ${text}`);
    }

    let payload: GraphqlResponse<T>;
    try {
      payload = text ? (JSON.parse(text) as GraphqlResponse<T>) : {};
    } catch {
      throw new KataDomainError("NETWORK", "Linear response was not valid JSON.");
    }

    if (payload.data != null) return payload.data;

    if (payload.errors?.length) {
      const message = payload.errors.map((error) => error.message ?? "Unknown GraphQL error").join("; ");
      throw new KataDomainError("UNKNOWN", message);
    }

    throw new KataDomainError("UNKNOWN", "Linear GraphQL response did not include data.");
  }

  return {
    async getViewer() {
      const data = await graphql<{ viewer: LinearViewer }>(`
        query ViewerForKataDoctor {
          viewer {
            id
            name
            email
            organization {
              id
              name
            }
          }
        }
      `);
      return data.viewer;
    },

    async getTeam(teamIdOrKey: string) {
      const byKey = await graphql<{ teams: { nodes: LinearTeamSummary[] } }>(`
        query TeamByKeyForKataDoctor($key: String!) {
          teams(filter: { key: { eq: $key } }, first: 1) {
            nodes {
              id
              key
              name
            }
          }
        }
      `, { key: teamIdOrKey });
      if (byKey.teams.nodes.length > 0) return byKey.teams.nodes[0] ?? null;

      const byId = await graphql<{ team: LinearTeamSummary | null }>(`
        query TeamByIdForKataDoctor($id: String!) {
          team(id: $id) {
            id
            key
            name
          }
        }
      `, { id: teamIdOrKey });
      return byId.team;
    },

    async getProject(projectIdOrSlug: string) {
      const bySlug = await graphql<{ projects: { nodes: LinearProjectSummary[] } }>(`
        query ProjectBySlugForKataDoctor($slug: String!) {
          projects(filter: { slugId: { eq: $slug } }, first: 1) {
            nodes {
              id
              name
              slugId
              state
              url
            }
          }
        }
      `, { slug: projectIdOrSlug });
      if (bySlug.projects.nodes.length > 0) return bySlug.projects.nodes[0] ?? null;

      const byId = await graphql<{ project: LinearProjectSummary | null }>(`
        query ProjectByIdForKataDoctor($id: String!) {
          project(id: $id) {
            id
            name
            slugId
            state
            url
          }
        }
      `, { id: projectIdOrSlug });
      return byId.project;
    },

    async getKataMetadataSupport() {
      const response = await graphql<{ issueRelationType: { enumValues: Array<{ name: string }> } | null }>(`
        query KataMetadataSupportForDoctor {
          issueRelationType: __type(name: "IssueRelationType") {
            enumValues {
              name
            }
          }
        }
      `);
      const enumNames = new Set((response.issueRelationType?.enumValues ?? []).map((value) => value.name.toLowerCase()));

      return {
        kataId: true,
        parentLinks: true,
        artifactScope: true,
        verificationState: true,
        dependencyBlocking: enumNames.has("blocks"),
        blockedByRelations: enumNames.has("blocked_by"),
      };
    },
  };
}
