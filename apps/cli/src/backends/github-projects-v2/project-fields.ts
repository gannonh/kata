import { KataDomainError } from "../../domain/errors.js";
import type { createGithubClient } from "./client.js";

export const KATA_PROJECT_FIELDS = {
  status: "Status",
  type: "Kata Type",
  id: "Kata ID",
  parentId: "Kata Parent ID",
  artifactScope: "Kata Artifact Scope",
} as const;

export const KATA_STATUS_OPTIONS = [
  "Backlog",
  "Todo",
  "In Progress",
  "Agent Review",
  "Human Review",
  "Merging",
  "Done",
] as const;

export interface ProjectFieldIndex {
  projectId: string;
  fields: Record<string, { id: string; options?: Record<string, string> }>;
}

interface ProjectFieldNode {
  id: string;
  name: string;
  options?: Array<{ id: string; name: string }>;
}

interface ProjectV2 {
  id: string;
  fields: {
    nodes: Array<ProjectFieldNode | null>;
  };
}

interface ProjectFieldsQueryData {
  organization?: {
    projectV2?: ProjectV2 | null;
  } | null;
  user?: {
    projectV2?: ProjectV2 | null;
  } | null;
}

const PROJECT_FIELDS_QUERY = `
  query LoadKataProjectFields($owner: String!, $repo: String!, $projectNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      id
      owner {
        login
      }
    }
    organization(login: $owner) {
      projectV2(number: $projectNumber) {
        id
        fields(first: 50) {
          nodes {
            ... on ProjectV2Field {
              id
              name
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
    user(login: $owner) {
      projectV2(number: $projectNumber) {
        id
        fields(first: 50) {
          nodes {
            ... on ProjectV2Field {
              id
              name
            }
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`;

export async function loadProjectFieldIndex(input: {
  client: ReturnType<typeof createGithubClient>;
  owner: string;
  repo: string;
  projectNumber: number;
}): Promise<ProjectFieldIndex> {
  const data = await input.client.graphql<ProjectFieldsQueryData>({
    query: PROJECT_FIELDS_QUERY,
    variables: {
      owner: input.owner,
      repo: input.repo,
      projectNumber: input.projectNumber,
    },
  });

  const project = data.organization?.projectV2 ?? data.user?.projectV2;

  if (!project?.id) {
    throw new KataDomainError(
      "NOT_FOUND",
      `GitHub Projects v2 project ${input.projectNumber} was not found for ${input.owner}/${input.repo}.`,
    );
  }

  return {
    projectId: project.id,
    fields: Object.fromEntries(
      project.fields.nodes.filter(isProjectFieldNode).map((field) => [
        field.name,
        {
          id: field.id,
          options: field.options
            ? Object.fromEntries(field.options.map((option) => [option.name, option.id]))
            : undefined,
        },
      ]),
    ),
  };
}

function isProjectFieldNode(node: ProjectFieldNode | null): node is ProjectFieldNode {
  return Boolean(node?.id && node.name);
}
