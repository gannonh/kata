import { KataDomainError } from "../../domain/errors.js";
import type { createGithubClient } from "./client.js";

export const KATA_PROJECT_FIELDS = {
  status: "Status",
  type: "Kata Type",
  id: "Kata ID",
  parentId: "Kata Parent ID",
  artifactScope: "Kata Artifact Scope",
  verificationState: "Kata Verification State",
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

const REQUIRED_TEXT_FIELD_NAMES = [
  KATA_PROJECT_FIELDS.type,
  KATA_PROJECT_FIELDS.id,
  KATA_PROJECT_FIELDS.parentId,
  KATA_PROJECT_FIELDS.artifactScope,
  KATA_PROJECT_FIELDS.verificationState,
] as const;

function formatBulletList(items: readonly string[]): string {
  return items.map((item) => `  - ${item}`).join("\n");
}

export interface ProjectFieldIndex {
  projectId: string;
  fields: Record<string, { id: string; dataType?: string; options?: Record<string, string> }>;
}

interface ProjectFieldNode {
  id: string;
  name: string;
  dataType?: string;
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
              dataType
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
              dataType
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

  const fields = Object.fromEntries(
    project.fields.nodes.filter(isProjectFieldNode).map((field) => [
      field.name,
      {
        id: field.id,
        dataType: field.dataType,
        options: field.options
          ? Object.fromEntries(field.options.map((option) => [option.name, option.id]))
          : undefined,
      },
    ]),
  );

  validateProjectFieldIndex(fields);

  return {
    projectId: project.id,
    fields,
  };
}

function isProjectFieldNode(node: ProjectFieldNode | null): node is ProjectFieldNode {
  return Boolean(node?.id && node.name);
}

function validateProjectFieldIndex(fields: ProjectFieldIndex["fields"]): void {
  const missingFields = REQUIRED_TEXT_FIELD_NAMES.filter((fieldName) => !fields[fieldName]);
  const incorrectlyTypedFields = REQUIRED_TEXT_FIELD_NAMES.filter((fieldName) => {
    const field = fields[fieldName];
    return field && field.dataType !== "TEXT";
  });
  const statusField = fields[KATA_PROJECT_FIELDS.status];
  const missingStatusOptions = KATA_STATUS_OPTIONS.filter((option) => !statusField?.options?.[option]);

  if (missingFields.length || incorrectlyTypedFields.length || missingStatusOptions.length) {
    throw new KataDomainError(
      "INVALID_CONFIG",
      [
        ...(missingFields.length
          ? [
              "GitHub Projects v2 project is missing required Kata fields:",
              formatBulletList(missingFields),
              "",
            ]
          : []),
        ...(incorrectlyTypedFields.length
          ? [
              "GitHub Projects v2 project has required Kata fields with the wrong type:",
              formatBulletList(incorrectlyTypedFields.map((fieldName) => `${fieldName} must be Text`)),
              "",
            ]
          : []),
        ...(missingStatusOptions.length
          ? [
              "GitHub Projects v2 project is missing required Kata workflow status options:",
              formatBulletList(
                missingStatusOptions.map((option) =>
                  `GitHub Project v2 field "${KATA_PROJECT_FIELDS.status}" is missing option "${option}".`
                ),
              ),
              "",
            ]
          : []),
        ...(missingFields.length
          ? [
              "Add each missing field in the GitHub Project table view:",
              "  1. Click the rightmost + field header.",
              "  2. Choose New field.",
              "  3. Enter the exact field name.",
              "  4. Choose Text and save.",
              "",
            ]
          : []),
        ...(incorrectlyTypedFields.length
          ? [
              "Fix incorrectly typed fields in the GitHub Project table view:",
              "  1. Open each field menu.",
              "  2. Recreate the field as Text with the exact field name.",
              "  3. Reapply existing values if needed.",
            ]
          : []),
      ].join("\n"),
    );
  }

}
