/**
 * Tool definitions for the Linear extension.
 *
 * Each tool wraps a LinearClient method with parameter validation,
 * structured JSON output, and classified error handling.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { LinearClient } from "./linear-client.js";
import { classifyLinearError } from "./http.js";
import {
  normalizeMarkdownContent,
} from "./linear-entities.js";
import {
  renderCompactRead,
  renderErrorSummary,
  renderInventoryResult,
  renderMutationSummary,
} from "./tool-output.js";

export const LINEAR_TOOL_STRATEGIES = {
  linear_list_teams: "inventory",
  linear_get_team: "compact-read",
  linear_create_project: "mutation",
  linear_get_project: "compact-read",
  linear_list_projects: "inventory",
  linear_update_project: "mutation",
  linear_delete_project: "mutation",
  linear_create_milestone: "mutation",
  linear_get_milestone: "compact-read",
  linear_list_milestones: "inventory",
  linear_update_milestone: "mutation",
  linear_delete_milestone: "mutation",
  linear_create_issue: "mutation",
  linear_get_issue: "paged-read",
  linear_list_issues: "inventory",
  linear_create_relation: "mutation",
  linear_list_relations: "inventory",
  linear_update_issue: "mutation",
  linear_delete_issue: "mutation",
  linear_list_workflow_states: "inventory",
  linear_create_label: "mutation",
  linear_list_labels: "inventory",
  linear_delete_label: "mutation",
  linear_add_comment: "mutation",
  linear_ensure_label: "mutation",
  linear_create_document: "mutation",
  linear_get_document: "paged-read",
  linear_list_documents: "inventory",
  linear_delete_document: "mutation",
  linear_update_document: "mutation",
  linear_get_viewer: "compact-read",
} as const;

// =============================================================================
// Helpers
// =============================================================================

function okText(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function ok(data: unknown) {
  return okText(JSON.stringify(data, null, 2));
}

function fail(err: unknown) {
  const classified = classifyLinearError(err);
  return {
    content: [{ type: "text" as const, text: renderErrorSummary(classified.kind, classified.message) }],
    isError: true,
    details: { errorKind: classified.kind, message: classified.message },
  };
}

async function run<T>(fn: () => Promise<T | string>) {
  try {
    const value = await fn();
    return typeof value === "string" ? okText(value) : ok(value);
  } catch (err) {
    return fail(err);
  }
}

// =============================================================================
// Tool Registration
// =============================================================================

export function registerLinearTools(pi: ExtensionAPI, client: LinearClient) {

  // =========================================================================
  // Teams
  // =========================================================================

  pi.registerTool({
    name: "linear_list_teams",
    label: "Linear: List Teams",
    description: "List compact team inventory for the Linear workspace.",
    promptSnippet: "List compact team inventory for the Linear workspace.",
    parameters: Type.Object({
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const teams = await client.listTeams();
        return renderInventoryResult({
          noun: "teams",
          items: teams,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use linear_get_team to inspect one team.",
          renderItem: (team, index) => [
            `${index}. ${team.key}: ${team.name}`,
            `   id: ${team.id}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_get_team",
    label: "Linear: Get Team",
    description: "Get a team by key (e.g. 'KAT') or UUID.",
    promptSnippet: "Get a team by key or UUID.",
    parameters: Type.Object({
      idOrKey: Type.String({ description: "Team key (e.g. 'KAT') or UUID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const team = await client.getTeam(params.idOrKey);
        if (typeof team === "string") return team;
        if (!team) throw new Error(`Team not found: ${params.idOrKey}`);

        return renderCompactRead({
          heading: `Team ${team.key}: ${team.name}`,
          metadata: [
            `id: ${team.id}`,
            `key: ${team.key}`,
            `name: ${team.name}`,
            `description: ${team.description ?? "—"}`,
          ],
        });
      });
    },
  });

  // =========================================================================
  // Projects
  // =========================================================================

  pi.registerTool({
    name: "linear_create_project",
    label: "Linear: Create Project",
    description: "Create a new Linear project.",
    promptSnippet: "Create a new Linear project.",
    parameters: Type.Object({
      name: Type.String({ description: "Project name" }),
      teamIds: Type.Array(Type.String(), { description: "Team UUIDs to associate with the project" }),
      description: Type.Optional(Type.String({ description: "Project description" })),
      state: Type.Optional(Type.String({ description: "Project state: planned, started, paused, completed, canceled, backlog" })),
      startDate: Type.Optional(Type.String({ description: "Start date (ISO format)" })),
      targetDate: Type.Optional(Type.String({ description: "Target date (ISO format)" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const project = await client.createProject(params);
        return renderMutationSummary({
          noun: "Project",
          action: "created",
          lines: [
            `id: ${project.id}`,
            `name: ${project.name}`,
            `slugId: ${project.slugId}`,
            `state: ${project.state}`,
            `targetDate: ${project.targetDate ?? "—"}`,
            "Full description not echoed. Use linear_get_project to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_get_project",
    label: "Linear: Get Project",
    description: "Get a project by UUID or slug ID.",
    promptSnippet: "Get a project by UUID or slug ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Project UUID or slug ID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const project = await client.getProject(params.id);
        if (!project) throw new Error(`Project not found: ${params.id}`);

        return renderCompactRead({
          heading: `Project ${project.name}`,
          metadata: [
            `id: ${project.id}`,
            `slugId: ${project.slugId}`,
            `state: ${project.state}`,
            `startDate: ${project.startDate ?? "—"}`,
            `targetDate: ${project.targetDate ?? "—"}`,
            `updatedAt: ${project.updatedAt}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_list_projects",
    label: "Linear: List Projects",
    description: "List compact project inventory in the workspace, optionally filtered by team.",
    promptSnippet: "List compact project inventory in the workspace, optionally filtered by team.",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Filter by team UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (default: 50)" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const { offset, limit, ...filters } = params;
        const hasFilters = filters.teamId !== undefined || filters.first !== undefined;
        const projects = await client.listProjects(hasFilters ? filters : undefined);
        return renderInventoryResult({
          noun: "projects",
          items: projects,
          offset,
          limit,
          omittedFieldsNote: "Large fields omitted from list output. Use linear_get_project to inspect one project.",
          renderItem: (project, index) => [
            `${index}. ${project.name}`,
            `   id: ${project.id}`,
            `   slugId: ${project.slugId}`,
            `   state: ${project.state}`,
            `   targetDate: ${project.targetDate ?? "—"}`,
            `   updatedAt: ${project.updatedAt}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_update_project",
    label: "Linear: Update Project",
    description: "Update a project's name, description, state, or dates.",
    promptSnippet: "Update a projects name, description, state, or dates.",
    parameters: Type.Object({
      id: Type.String({ description: "Project UUID" }),
      name: Type.Optional(Type.String({ description: "New name" })),
      description: Type.Optional(Type.String({ description: "New description" })),
      state: Type.Optional(Type.String({ description: "New state" })),
      startDate: Type.Optional(Type.String({ description: "New start date (ISO)" })),
      targetDate: Type.Optional(Type.String({ description: "New target date (ISO)" })),
    }),
    async execute(_id, params) {
      const { id, ...input } = params;
      return run(async () => {
        const project = await client.updateProject(id, input);
        return renderMutationSummary({
          noun: "Project",
          action: "updated",
          lines: [
            `id: ${project.id}`,
            `name: ${project.name}`,
            `slugId: ${project.slugId}`,
            `state: ${project.state}`,
            `targetDate: ${project.targetDate ?? "—"}`,
            "Full description not echoed. Use linear_get_project to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_delete_project",
    label: "Linear: Delete Project",
    description: "Delete a project by UUID.",
    promptSnippet: "Delete a project by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Project UUID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const deleted = await client.deleteProject(params.id);
        return renderMutationSummary({
          noun: "Project",
          action: "deleted",
          lines: [
            `id: ${params.id}`,
            `deleted: ${deleted ? "yes" : "no"}`,
          ],
        });
      });
    },
  });

  // =========================================================================
  // Milestones
  // =========================================================================

  pi.registerTool({
    name: "linear_create_milestone",
    label: "Linear: Create Milestone",
    description: "Create a milestone under a project. Milestones belong to projects, not teams.",
    promptSnippet: "Create a milestone under a project.",
    parameters: Type.Object({
      name: Type.String({ description: "Milestone name" }),
      projectId: Type.String({ description: "Project UUID (required — milestones belong to projects)" }),
      description: Type.Optional(Type.String({ description: "Milestone description" })),
      targetDate: Type.Optional(Type.String({ description: "Target date (ISO)" })),
      sortOrder: Type.Optional(Type.Number({ description: "Sort order" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const milestone = await client.createMilestone(params);
        return renderMutationSummary({
          noun: "Milestone",
          action: "created",
          lines: [
            `id: ${milestone.id}`,
            `name: ${milestone.name}`,
            `sortOrder: ${milestone.sortOrder}`,
            `targetDate: ${milestone.targetDate ?? "—"}`,
            "Full description not echoed. Use linear_get_milestone to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_get_milestone",
    label: "Linear: Get Milestone",
    description: "Get a milestone by UUID.",
    promptSnippet: "Get a milestone by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Milestone UUID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const milestone = await client.getMilestone(params.id);
        if (!milestone) throw new Error(`Milestone not found: ${params.id}`);

        return renderCompactRead({
          heading: `Milestone ${milestone.name}`,
          metadata: [
            `id: ${milestone.id}`,
            `projectId: ${milestone.projectId ?? "—"}`,
            `sortOrder: ${milestone.sortOrder}`,
            `targetDate: ${milestone.targetDate ?? "—"}`,
            `updatedAt: ${milestone.updatedAt}`,
            `description: ${milestone.description ?? "—"}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_list_milestones",
    label: "Linear: List Milestones",
    description: "List compact milestone inventory under a project.",
    promptSnippet: "List compact milestone inventory under a project.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const milestones = await client.listMilestones(params.projectId);
        return renderInventoryResult({
          noun: "milestones",
          items: milestones,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use linear_get_milestone to inspect one milestone.",
          renderItem: (milestone, index) => [
            `${index}. ${milestone.name}`,
            `   id: ${milestone.id}`,
            `   sortOrder: ${milestone.sortOrder}`,
            `   targetDate: ${milestone.targetDate ?? "—"}`,
            `   updatedAt: ${milestone.updatedAt}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_update_milestone",
    label: "Linear: Update Milestone",
    description: "Update a milestone's name, description, target date, or sort order.",
    promptSnippet: "Update a milestones name, description, target date, or sort order.",
    parameters: Type.Object({
      id: Type.String({ description: "Milestone UUID" }),
      name: Type.Optional(Type.String({ description: "New name" })),
      description: Type.Optional(Type.String({ description: "New description" })),
      targetDate: Type.Optional(Type.String({ description: "New target date (ISO)" })),
      sortOrder: Type.Optional(Type.Number({ description: "New sort order" })),
    }),
    async execute(_id, params) {
      const { id, ...input } = params;
      return run(async () => {
        const milestone = await client.updateMilestone(id, input);
        return renderMutationSummary({
          noun: "Milestone",
          action: "updated",
          lines: [
            `id: ${milestone.id}`,
            `name: ${milestone.name}`,
            `sortOrder: ${milestone.sortOrder}`,
            `targetDate: ${milestone.targetDate ?? "—"}`,
            "Full description not echoed. Use linear_get_milestone to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_delete_milestone",
    label: "Linear: Delete Milestone",
    description: "Delete a milestone by UUID.",
    promptSnippet: "Delete a milestone by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Milestone UUID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const deleted = await client.deleteMilestone(params.id);
        return renderMutationSummary({
          noun: "Milestone",
          action: "deleted",
          lines: [
            `id: ${params.id}`,
            `deleted: ${deleted ? "yes" : "no"}`,
          ],
        });
      });
    },
  });

  // =========================================================================
  // Issues (including sub-issues)
  // =========================================================================

  pi.registerTool({
    name: "linear_create_issue",
    label: "Linear: Create Issue",
    description: "Create an issue. Use parentId (UUID) to create a sub-issue. Supports project, milestone, labels, and state assignment.",
    promptSnippet: "Create an issue.",
    parameters: Type.Object({
      title: Type.String({ description: "Issue title" }),
      teamId: Type.String({ description: "Team UUID" }),
      description: Type.Optional(Type.String({ description: "Issue description (markdown)" })),
      parentId: Type.Optional(Type.String({ description: "Parent issue UUID — creates a sub-issue" })),
      projectId: Type.Optional(Type.String({ description: "Project UUID" })),
      projectMilestoneId: Type.Optional(Type.String({ description: "Milestone UUID" })),
      stateId: Type.Optional(Type.String({ description: "Workflow state UUID" })),
      assigneeId: Type.Optional(Type.String({ description: "Assignee user UUID" })),
      labelIds: Type.Optional(Type.Array(Type.String(), { description: "Label UUIDs to attach" })),
      priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 4, description: "Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low" })),
      estimate: Type.Optional(Type.Number({ description: "Issue estimate" })),
    }),
    async execute(_id, params) {
      const input = { ...params };
      if (input.description !== undefined) {
        input.description = normalizeMarkdownContent(input.description);
      }
      return run(async () => {
        const issue = await client.createIssue(input);
        return renderMutationSummary({
          noun: "Issue",
          action: "created",
          lines: [
            `id: ${issue.id}`,
            `identifier: ${issue.identifier}`,
            `title: ${issue.title}`,
            `state: ${issue.state.name}`,
            `project: ${issue.project?.name ?? "—"}`,
            `milestone: ${issue.projectMilestone?.name ?? "—"}`,
            "Full description not echoed. Use linear_get_issue to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_get_issue",
    label: "Linear: Get Issue",
    description: "Get an issue by UUID or identifier (e.g. 'KAT-42'). Returns compact issue metadata with paged description content via offset/limit.",
    promptSnippet: "Read one issue by UUID or identifier with optional offset/limit paging.",
    parameters: Type.Object({
      id: Type.String({ description: "Issue UUID or identifier (e.g. 'KAT-42')" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Line number to start reading description from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of description lines to read" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const issue = await client.getIssue(params.id);
        if (!issue) throw new Error(`Issue not found: ${params.id}`);

        return renderCompactRead({
          heading: `${issue.identifier}: ${issue.title}`,
          metadata: [
            `id: ${issue.id}`,
            `state: ${issue.state.name}`,
            `priority: ${issue.priority}`,
            `project: ${issue.project?.name ?? "—"}`,
            `milestone: ${issue.projectMilestone?.name ?? "—"}`,
            `labels: ${issue.labels.map((label) => label.name).join(", ") || "—"}`,
            `children: ${issue.children.nodes.length}`,
          ],
          bodyLabel: "description",
          body: issue.description,
          offset: params.offset,
          limit: params.limit,
          emptyBodyMessage: "No description.",
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_list_issues",
    label: "Linear: List Issues",
    description:
      "Generic Linear issue inventory with optional filters: team, project, milestone, parent, state, labels, assignee. " +
      "For Kata milestone planning or slice lookup, prefer kata_list_slices with milestoneId. Use linear_get_issue for a paged compact read of one issue.",
    promptSnippet:
      "List generic Linear issue inventory with optional filters. For Kata slice enumeration, prefer kata_list_slices with milestoneId.",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Filter by team UUID" })),
      projectId: Type.Optional(Type.String({ description: "Filter by project UUID" })),
      projectMilestoneId: Type.Optional(Type.String({ description: "Filter by project milestone UUID" })),
      parentId: Type.Optional(Type.String({ description: "Filter by parent issue UUID (lists sub-issues)" })),
      stateId: Type.Optional(Type.String({ description: "Filter by workflow state UUID" })),
      labelIds: Type.Optional(Type.Array(Type.String(), { description: "Filter by label UUIDs (issues with any of these labels)" })),
      assigneeId: Type.Optional(Type.String({ description: "Filter by assignee UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (default: 50)" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const { offset, limit, ...filters } = params;
        const issues = await client.listIssueSummaries(filters);
        return renderInventoryResult({
          noun: "issues",
          items: issues,
          offset,
          limit,
          omittedFieldsNote: "Large fields omitted from list output. Use linear_get_issue to inspect one issue.",
          renderItem: (issue, index) => [
            `${index}. ${issue.identifier}: ${issue.title}`,
            `   state: ${issue.state.name}`,
            `   project: ${issue.project?.name ?? "—"}`,
            `   milestone: ${issue.projectMilestone?.name ?? "—"}`,
            `   labels: ${issue.labels.map((label) => label.name).join(", ") || "—"}`,
            `   updatedAt: ${issue.updatedAt}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_create_relation",
    label: "Linear: Create Relation",
    description: "Create an issue relation (blocks, blocked_by, relates_to, duplicate).",
    promptSnippet: "Create an issue relation between two issues.",
    parameters: Type.Object({
      issueId: Type.String({ description: "UUID of the source issue" }),
      relatedIssueId: Type.String({ description: "UUID of the related issue" }),
      type: Type.Union(
        [
          Type.Literal("blocks"),
          Type.Literal("blocked_by"),
          Type.Literal("relates_to"),
          Type.Literal("duplicate"),
        ],
        { description: "Relation type" }
      ),
    }),
    async execute(_id, params) {
      return run(async () => {
        const relation = await client.createRelation(params);
        return renderMutationSummary({
          noun: "Relation",
          action: "created",
          lines: [
            `id: ${relation.id}`,
            `type: ${relation.type}`,
            `direction: ${relation.direction}`,
            `issue: ${relation.issue.identifier}: ${relation.issue.title}`,
            `otherIssue: ${relation.otherIssue.identifier}: ${relation.otherIssue.title}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_list_relations",
    label: "Linear: List Relations",
    description: "List compact relation inventory for an issue (outbound and inbound) with normalized direction.",
    promptSnippet: "List compact relation inventory for an issue.",
    parameters: Type.Object({
      issueId: Type.String({ description: "Issue UUID" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const relations = await client.listRelations(params.issueId);
        return renderInventoryResult({
          noun: "relations",
          items: relations,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use linear_get_issue to inspect related issues in context.",
          renderItem: (relation, index) => [
            `${index}. ${relation.type} (${relation.direction})`,
            `   id: ${relation.id}`,
            `   issue: ${relation.issue.identifier}: ${relation.issue.title}`,
            `   otherIssue: ${relation.otherIssue.identifier}: ${relation.otherIssue.title}`,
            `   otherState: ${relation.otherIssue.state?.name ?? "—"}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_update_issue",
    label: "Linear: Update Issue",
    description: "Update an issue's title, description, state, labels, priority, assignee, parent, project, or milestone.",
    promptSnippet: "Update an issues title, description, state, labels, priority, assignee, parent, project, or milestone.",
    parameters: Type.Object({
      id: Type.String({ description: "Issue UUID" }),
      title: Type.Optional(Type.String({ description: "New title" })),
      description: Type.Optional(Type.String({ description: "New description (markdown)" })),
      parentId: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: "New parent issue UUID (or null to unset)" })),
      projectId: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: "New project UUID (or null to unset)" })),
      projectMilestoneId: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: "New milestone UUID (or null to unset)" })),
      stateId: Type.Optional(Type.String({ description: "New workflow state UUID" })),
      assigneeId: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: "New assignee UUID (or null to unset)" })),
      labelIds: Type.Optional(Type.Array(Type.String(), { description: "New label UUIDs (replaces all labels)" })),
      priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 4, description: "New priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low" })),
      estimate: Type.Optional(Type.Number({ description: "New estimate" })),
    }),
    async execute(_id, params) {
      const { id, ...rest } = params;
      const input = { ...rest };
      if (input.description !== undefined) {
        input.description = normalizeMarkdownContent(input.description);
      }
      return run(async () => {
        const issue = await client.updateIssue(id, input);
        return renderMutationSummary({
          noun: "Issue",
          action: "updated",
          lines: [
            `id: ${issue.id}`,
            `identifier: ${issue.identifier}`,
            `title: ${issue.title}`,
            `state: ${issue.state.name}`,
            `project: ${issue.project?.name ?? "—"}`,
            `milestone: ${issue.projectMilestone?.name ?? "—"}`,
            "Full description not echoed. Use linear_get_issue to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_delete_issue",
    label: "Linear: Delete Issue",
    description: "Delete an issue by UUID.",
    promptSnippet: "Delete an issue by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Issue UUID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const deleted = await client.deleteIssue(params.id);
        return renderMutationSummary({
          noun: "Issue",
          action: "deleted",
          lines: [
            `id: ${params.id}`,
            `deleted: ${deleted ? "yes" : "no"}`,
          ],
        });
      });
    },
  });

  // =========================================================================
  // Workflow States
  // =========================================================================

  pi.registerTool({
    name: "linear_list_workflow_states",
    label: "Linear: List Workflow States",
    description: "List compact workflow-state inventory for a team. States have types: backlog, unstarted, started, completed, canceled.",
    promptSnippet: "List compact workflow-state inventory for a team.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const states = await client.listWorkflowStates(params.teamId);
        return renderInventoryResult({
          noun: "workflow states",
          items: states,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use linear_get_team and workflow state IDs for precise updates.",
          renderItem: (state, index) => [
            `${index}. ${state.name}`,
            `   id: ${state.id}`,
            `   type: ${state.type}`,
            `   position: ${state.position}`,
            `   color: ${state.color}`,
          ].join("\n"),
        });
      });
    },
  });

  // =========================================================================
  // Labels
  // =========================================================================

  pi.registerTool({
    name: "linear_create_label",
    label: "Linear: Create Label",
    description: "Create an issue label. Omit teamId for a workspace-level label.",
    promptSnippet: "Create an issue label.",
    parameters: Type.Object({
      name: Type.String({ description: "Label name" }),
      color: Type.Optional(Type.String({ description: "Label color hex (e.g. '#FF0000')" })),
      description: Type.Optional(Type.String({ description: "Label description" })),
      teamId: Type.Optional(Type.String({ description: "Team UUID — omit for workspace-level label" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const label = await client.createLabel(params);
        return renderMutationSummary({
          noun: "Label",
          action: "created",
          lines: [
            `id: ${label.id}`,
            `name: ${label.name}`,
            `color: ${label.color}`,
            `isGroup: ${label.isGroup ? "yes" : "no"}`,
            `description: ${label.description ?? "—"}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_list_labels",
    label: "Linear: List Labels",
    description: "List compact label inventory, optionally filtered by team.",
    promptSnippet: "List compact label inventory, optionally filtered by team.",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Filter by team UUID" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const labels = await client.listLabels(params.teamId ? { teamId: params.teamId } : undefined);
        return renderInventoryResult({
          noun: "labels",
          items: labels,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use linear_ensure_label or linear_create_label for updates.",
          renderItem: (label, index) => [
            `${index}. ${label.name}`,
            `   id: ${label.id}`,
            `   color: ${label.color}`,
            `   isGroup: ${label.isGroup ? "yes" : "no"}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_delete_label",
    label: "Linear: Delete Label",
    description: "Delete a label by UUID.",
    promptSnippet: "Delete a label by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Label UUID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const deleted = await client.deleteLabel(params.id);
        return renderMutationSummary({
          noun: "Label",
          action: "deleted",
          lines: [
            `id: ${params.id}`,
            `deleted: ${deleted ? "yes" : "no"}`,
          ],
        });
      });
    },
  });

  // ── Comments ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "linear_add_comment",
    label: "Linear: Add Comment",
    description:
      "Post a comment on a Linear issue. Returns a compact mutation summary (id, issueId, createdAt, url); " +
      "comment body is omitted from mutation output.",
    promptSnippet: "Post a comment on a Linear issue and return a compact summary (body omitted).",
    parameters: Type.Object({
      issueId: Type.String({ description: "Issue UUID to comment on" }),
      body: Type.String({ description: "Comment body (markdown supported)" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const comment = await client.createComment(params.issueId, normalizeMarkdownContent(params.body));
        return renderMutationSummary({
          noun: "Comment",
          action: "created",
          lines: [
            `id: ${comment.id}`,
            `issueId: ${params.issueId}`,
            `createdAt: ${comment.createdAt}`,
            `url: ${comment.url}`,
            "Body omitted from mutation output. Use Linear UI to inspect full comment content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_ensure_label",
    label: "Linear: Ensure Label",
    description:
      "Get or create a label by name. Idempotent — returns a compact mutation summary with key label metadata " +
      "(id, name, color, group flag, description).",
    promptSnippet: "Ensure a label by name and return compact label metadata.",
    parameters: Type.Object({
      name: Type.String({ description: "Label name" }),
      color: Type.Optional(Type.String({ description: "Label color hex (used only when creating)" })),
      description: Type.Optional(Type.String({ description: "Label description (used only when creating)" })),
      teamId: Type.Optional(Type.String({ description: "Team UUID — omit for workspace-level label" })),
    }),
    async execute(_id, params) {
      const { name, ...opts } = params;
      return run(async () => {
        const label = await client.ensureLabel(name, Object.keys(opts).length > 0 ? opts : undefined);
        return renderMutationSummary({
          noun: "Label",
          action: "ensured",
          lines: [
            `id: ${label.id}`,
            `name: ${label.name}`,
            `color: ${label.color}`,
            `isGroup: ${label.isGroup ? "yes" : "no"}`,
            `description: ${label.description ?? "—"}`,
          ],
        });
      });
    },
  });

  // =========================================================================
  // Documents
  // =========================================================================

  pi.registerTool({
    name: "linear_create_document",
    label: "Linear: Create Document",
    description: "Create a document. Attach to a project and/or issue via their UUIDs.",
    promptSnippet: "Create a document.",
    parameters: Type.Object({
      title: Type.String({ description: "Document title" }),
      content: Type.Optional(Type.String({ description: "Document content (markdown)" })),
      projectId: Type.Optional(Type.String({ description: "Project UUID to attach document to" })),
      issueId: Type.Optional(Type.String({ description: "Issue UUID to attach document to" })),
      icon: Type.Optional(Type.String({ description: "Document icon emoji" })),
      color: Type.Optional(Type.String({ description: "Document color hex" })),
    }),
    async execute(_id, params) {
      const input = { ...params };
      if (input.content !== undefined) {
        input.content = normalizeMarkdownContent(input.content);
      }
      return run(async () => {
        const doc = await client.createDocument(input);
        return renderMutationSummary({
          noun: "Document",
          action: "created",
          lines: [
            `id: ${doc.id}`,
            `title: ${doc.title}`,
            `project: ${doc.project?.name ?? "—"}`,
            `issue: ${doc.issue?.identifier ?? "—"}`,
            `updatedAt: ${doc.updatedAt}`,
            "Full content not echoed. Use linear_get_document to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_get_document",
    label: "Linear: Get Document",
    description: "Get a document by UUID. Returns compact metadata with paged markdown content via offset/limit.",
    promptSnippet: "Read one document by UUID with optional offset/limit paging.",
    parameters: Type.Object({
      id: Type.String({ description: "Document UUID" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Line number to start reading from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of content lines to read" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const doc = await client.getDocument(params.id);
        if (!doc) throw new Error(`Document not found: ${params.id}`);

        return renderCompactRead({
          heading: `Document ${doc.title}`,
          metadata: [
            `id: ${doc.id}`,
            `project: ${doc.project?.name ?? "—"}`,
            `issue: ${doc.issue?.identifier ?? "—"}`,
            `updatedAt: ${doc.updatedAt}`,
          ],
          bodyLabel: "content",
          body: doc.content,
          offset: params.offset,
          limit: params.limit,
          emptyBodyMessage: "No content.",
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_list_documents",
    label: "Linear: List Documents",
    description: "List document inventory metadata, optionally filtered by project. Document content is omitted from list output.",
    promptSnippet: "List document inventory metadata (content omitted), optionally filtered by project.",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Filter by project UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (backward-compatible pass-through to the client query)" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const docsQuery = {
          ...(params.projectId !== undefined ? { projectId: params.projectId } : {}),
          ...(params.first !== undefined ? { first: params.first } : {}),
        };
        const docs = await client.listDocumentSummaries(docsQuery);
        return renderInventoryResult({
          noun: "documents",
          items: docs,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Document contents omitted from list output. Use linear_get_document to read one document.",
          renderItem: (doc, index) => [
            `${index}. ${doc.title}`,
            `   id: ${doc.id}`,
            `   project: ${doc.project?.name ?? "—"}`,
            `   issue: ${doc.issue?.identifier ?? "—"}`,
            `   updatedAt: ${doc.updatedAt}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_delete_document",
    label: "Linear: Delete Document",
    description: "Delete a document by UUID.",
    promptSnippet: "Delete a document by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Document UUID" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const deleted = await client.deleteDocument(params.id);
        return renderMutationSummary({
          noun: "Document",
          action: "deleted",
          lines: [
            `id: ${params.id}`,
            `deleted: ${deleted ? "yes" : "no"}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "linear_update_document",
    label: "Linear: Update Document",
    description: "Update a document's title, content, icon, or color.",
    promptSnippet: "Update a documents title, content, icon, or color.",
    parameters: Type.Object({
      id: Type.String({ description: "Document UUID" }),
      title: Type.Optional(Type.String({ description: "New title" })),
      content: Type.Optional(Type.String({ description: "New content (markdown)" })),
      icon: Type.Optional(Type.String({ description: "New icon emoji" })),
      color: Type.Optional(Type.String({ description: "New color hex" })),
    }),
    async execute(_id, params) {
      const { id, ...rest } = params;
      const input = { ...rest };
      if (input.content !== undefined) {
        input.content = normalizeMarkdownContent(input.content);
      }
      return run(async () => {
        const doc = await client.updateDocument(id, input);
        return renderMutationSummary({
          noun: "Document",
          action: "updated",
          lines: [
            `id: ${doc.id}`,
            `title: ${doc.title}`,
            `project: ${doc.project?.name ?? "—"}`,
            `issue: ${doc.issue?.identifier ?? "—"}`,
            `updatedAt: ${doc.updatedAt}`,
            "Full content not echoed. Use linear_get_document to inspect content.",
          ],
        });
      });
    },
  });

  // =========================================================================
  // Viewer (utility)
  // =========================================================================

  pi.registerTool({
    name: "linear_get_viewer",
    label: "Linear: Get Viewer",
    description: "Get the authenticated user's profile. Useful for verifying API key and getting user ID.",
    promptSnippet: "Get the authenticated users profile.",
    parameters: Type.Object({}),
    async execute() {
      return run(async () => {
        const viewer = await client.getViewer();
        return renderCompactRead({
          heading: `Viewer ${viewer.displayName || viewer.name}`,
          metadata: [
            `id: ${viewer.id}`,
            `email: ${viewer.email}`,
            `active: ${viewer.active}`,
          ],
        });
      });
    },
  });

}
