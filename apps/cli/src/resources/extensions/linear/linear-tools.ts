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
  ensureKataLabels,
  createKataMilestone,
  createKataSlice,
  createKataTask,
  listKataSlices,
  listKataTasks,
  listKataMilestones,
  getLinearStateForKataPhase,
  normalizeMarkdownContent,
} from "./linear-entities.js";
import {
  writeKataDocument,
  readKataDocument,
  listKataDocuments,
} from "./linear-documents.js";
import type { DocumentAttachment } from "./linear-documents.js";
import type { KataLabelSet } from "./linear-types.js";
import type { KataPhase } from "./linear-types.js";
import { deriveLinearState } from "./linear-state.js";
import {
  loadEffectiveLinearProjectConfig,
  resolveConfiguredLinearProjectId,
  resolveConfiguredLinearTeamId,
} from "../kata/linear-config.js";
import {
  renderCompactRead,
  renderErrorSummary,
  renderInventoryResult,
  renderMutationSummary,
} from "./tool-output.js";

// Re-export entity functions under kata_* names so module consumers and
// smoke-checks can confirm they are importable without loading the pi runtime.
export {
  ensureKataLabels as kata_ensure_labels,
  createKataMilestone as kata_create_milestone,
  createKataSlice as kata_create_slice,
  createKataTask as kata_create_task,
  listKataSlices as kata_list_slices,
  listKataTasks as kata_list_tasks,
  listKataMilestones as kata_list_milestones,
  writeKataDocument as kata_write_document,
  readKataDocument as kata_read_document,
  listKataDocuments as kata_list_documents,
  deriveLinearState as kata_derive_linear_state,
};

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
  kata_ensure_labels: "mutation",
  kata_create_milestone: "mutation",
  kata_create_slice: "mutation",
  kata_create_task: "mutation",
  kata_list_slices: "inventory",
  kata_list_tasks: "inventory",
  kata_write_document: "mutation",
  kata_read_document: "paged-read",
  kata_list_documents: "inventory",
  kata_list_milestones: "inventory",
  kata_derive_state: "state",
  kata_update_issue_state: "mutation",
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
            `   description: ${team.description || "—"}`,
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
            `   description: ${label.description ?? "—"}`,
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
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const docs = await client.listDocumentSummaries({ projectId: params.projectId });
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

  // =========================================================================
  // Kata entity tools — Kata-semantics wrappers over linear-entities.ts
  // =========================================================================

  pi.registerTool({
    name: "kata_ensure_labels",
    label: "Kata: Ensure Labels",
    description:
      "Idempotently provision the three Kata labels (kata:milestone, kata:slice, kata:task) " +
      "in the given team. Returns a compact summary with the three label IDs and names. " +
      "Call this once per session; pass the returned label IDs to the kata_create_* tools.",
    promptSnippet: "Ensure kata:* labels for a team and return a compact summary of milestone/slice/task label IDs.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID in which to provision the Kata labels" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const labels = await ensureKataLabels(client, params.teamId);
        return renderMutationSummary({
          noun: "Kata labels",
          action: "ensured",
          lines: [
            `teamId: ${params.teamId}`,
            `milestone: ${labels.milestone.id} (${labels.milestone.name})`,
            `slice: ${labels.slice.id} (${labels.slice.name})`,
            `task: ${labels.task.id} (${labels.task.name})`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_create_milestone",
    label: "Kata: Create Milestone",
    description:
      "Create a Linear ProjectMilestone representing a Kata milestone. " +
      "The name is formatted as '[M001] Title' for round-trip parsing.",
    promptSnippet: "Create a Linear ProjectMilestone representing a Kata milestone.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID to attach the milestone to" }),
      kataId: Type.String({ description: "Kata milestone ID, e.g. 'M001'" }),
      title: Type.String({ description: "Human-readable milestone title" }),
      description: Type.Optional(Type.String({ description: "Milestone description (markdown)" })),
      targetDate: Type.Optional(Type.String({ description: "Target date (ISO string, e.g. '2025-06-30')" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const milestone = await createKataMilestone(
          client,
          { projectId: params.projectId },
          {
            kataId: params.kataId,
            title: params.title,
            description: params.description,
            targetDate: params.targetDate,
          }
        );

        return renderMutationSummary({
          noun: "Milestone",
          action: "created",
          lines: [
            `id: ${milestone.id}`,
            `name: ${milestone.name}`,
            `projectId: ${params.projectId}`,
            `targetDate: ${milestone.targetDate ?? "—"}`,
            "Full description not echoed. Use linear_get_milestone to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_create_slice",
    label: "Kata: Create Slice",
    description:
      "Create a Linear issue representing a Kata slice. " +
      "The title is formatted as '[S01] Title'. Applies the kata:slice label. " +
      "Call kata_ensure_labels first to obtain sliceLabelId and taskLabelId.",
    promptSnippet: "Create a Linear issue representing a Kata slice.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID" }),
      projectId: Type.String({ description: "Project UUID" }),
      kataId: Type.String({ description: "Kata slice ID, e.g. 'S01'" }),
      title: Type.String({ description: "Human-readable slice title" }),
      milestoneId: Type.Optional(Type.String({ description: "Linear ProjectMilestone UUID to attach this slice to" })),
      sliceLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:slice (from kata_ensure_labels)" })),
      taskLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:task (from kata_ensure_labels); used to complete the KataLabelSet" })),
      description: Type.Optional(Type.String({ description: "Slice description (markdown). Use this for the canonical Sxx plan content." })),
      initialPhase: Type.Optional(
        Type.Union(
          [
            Type.Literal("backlog"),
            Type.Literal("planning"),
            Type.Literal("executing"),
            Type.Literal("verifying"),
            Type.Literal("done"),
          ],
          { description: "Initial Kata phase; omit to use the team's default workflow state" }
        )
      ),
    }),
    async execute(_id, params) {
      return run(async () => {
        const labelSet: KataLabelSet = {
          milestone: { id: "", name: "kata:milestone", color: "#7C3AED", isGroup: false },
          slice: { id: params.sliceLabelId ?? "", name: "kata:slice", color: "#2563EB", isGroup: false },
          task: { id: params.taskLabelId ?? "", name: "kata:task", color: "#16A34A", isGroup: false },
        };
        const states =
          params.initialPhase !== undefined
            ? await client.listWorkflowStates(params.teamId)
            : undefined;
        const issue = await createKataSlice(
          client,
          { teamId: params.teamId, projectId: params.projectId, labelSet },
          {
            kataId: params.kataId,
            title: params.title,
            description: params.description,
            milestoneId: params.milestoneId,
            initialPhase: params.initialPhase,
            states,
          }
        );

        return renderMutationSummary({
          noun: "Slice",
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
    name: "kata_create_task",
    label: "Kata: Create Task",
    description:
      "Create a Linear sub-issue representing a Kata task. " +
      "The title is formatted as '[T01] Title'. Applies the kata:task label. " +
      "The task is attached as a child of the given slice issue. " +
      "Call kata_ensure_labels first to obtain sliceLabelId and taskLabelId.",
    promptSnippet: "Create a Linear sub-issue representing a Kata task.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID" }),
      projectId: Type.String({ description: "Project UUID" }),
      kataId: Type.String({ description: "Kata task ID, e.g. 'T01'" }),
      title: Type.String({ description: "Human-readable task title" }),
      sliceIssueId: Type.String({ description: "Linear issue UUID of the parent slice issue" }),
      sliceLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:slice (from kata_ensure_labels); used to complete the KataLabelSet" })),
      taskLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:task (from kata_ensure_labels)" })),
      description: Type.Optional(Type.String({ description: "Task description (markdown). Use this for the canonical Txx plan content." })),
      initialPhase: Type.Optional(
        Type.Union(
          [
            Type.Literal("backlog"),
            Type.Literal("planning"),
            Type.Literal("executing"),
            Type.Literal("verifying"),
            Type.Literal("done"),
          ],
          { description: "Initial Kata phase; omit to use the team's default workflow state" }
        )
      ),
    }),
    async execute(_id, params) {
      return run(async () => {
        const labelSet: KataLabelSet = {
          milestone: { id: "", name: "kata:milestone", color: "#7C3AED", isGroup: false },
          slice: { id: params.sliceLabelId ?? "", name: "kata:slice", color: "#2563EB", isGroup: false },
          task: { id: params.taskLabelId ?? "", name: "kata:task", color: "#16A34A", isGroup: false },
        };
        const states =
          params.initialPhase !== undefined
            ? await client.listWorkflowStates(params.teamId)
            : undefined;
        const issue = await createKataTask(
          client,
          { teamId: params.teamId, projectId: params.projectId, labelSet },
          {
            kataId: params.kataId,
            title: params.title,
            sliceIssueId: params.sliceIssueId,
            description: params.description,
            initialPhase: params.initialPhase,
            states,
          }
        );

        return renderMutationSummary({
          noun: "Task",
          action: "created",
          lines: [
            `id: ${issue.id}`,
            `identifier: ${issue.identifier}`,
            `title: ${issue.title}`,
            `state: ${issue.state.name}`,
            `project: ${issue.project?.name ?? "—"}`,
            `parent: ${issue.parent?.identifier ?? "—"}`,
            "Full description not echoed. Use linear_get_issue to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_list_slices",
    label: "Kata: List Slices",
    description:
      "List Linear issues representing Kata slices in a project. " +
      "Pass milestoneId whenever the work is scoped to one milestone; omit it only when you intentionally need every slice in the project.",
    promptSnippet:
      "List Kata slices for a project. Pass milestoneId whenever you are working within one milestone.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID to scope the query" }),
      teamId: Type.String({ description: "Team UUID (from kata_derive_state or preferences)" }),
      milestoneId: Type.Optional(Type.String({
        description: "Project milestone UUID — strongly recommended when planning, reviewing, or enumerating slices for a specific milestone. Omit only when you need every slice in the project (rare).",
      })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const labelSet = await ensureKataLabels(client, params.teamId);
        const slices = await client.listIssueSummaries({
          projectId: params.projectId,
          labelIds: [labelSet.slice.id],
          ...(params.milestoneId ? { projectMilestoneId: params.milestoneId } : {}),
        });

        const broadScopeNote = params.milestoneId
          ? undefined
          : "milestoneId omitted; broad project inventory may be large.";
        const omittedFieldsNote = broadScopeNote
          ? `Large fields omitted from list output. Use linear_get_issue to inspect one issue.\n${broadScopeNote}`
          : "Large fields omitted from list output. Use linear_get_issue to inspect one issue.";

        return renderInventoryResult({
          noun: "slices",
          items: slices,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote,
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
    name: "kata_list_tasks",
    label: "Kata: List Tasks",
    description:
      "List compact inventory of Linear sub-issues representing Kata tasks for a given slice issue. " +
      "Queries by parentId — returns all direct children of the slice issue.",
    promptSnippet: "List compact inventory of Linear sub-issues representing Kata tasks for a given slice issue.",
    parameters: Type.Object({
      sliceIssueId: Type.String({ description: "Linear issue UUID of the parent slice issue" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const tasks = await client.listIssueSummaries({ parentId: params.sliceIssueId });
        return renderInventoryResult({
          noun: "tasks",
          items: tasks,
          offset: params.offset,
          limit: params.limit,
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

  // =========================================================================
  // Kata document tools — artifact storage as Linear Documents
  // =========================================================================

  pi.registerTool({
    name: "kata_write_document",
    label: "Kata: Write Document",
    description:
      "Write a Kata artifact as a Linear Document (upsert by title). " +
      "If a document with the given title already exists in the attachment target, its content is updated. " +
      "If no matching document exists, a new one is created. " +
      "Exactly one of projectId or issueId must be provided. " +
      "Returns a compact mutation summary (id/title/scope/updatedAt); content is not echoed. " +
      "Use kata_read_document to inspect content.",
    promptSnippet: "Write a Kata artifact document and return a compact summary; use kata_read_document for content reads.",
    parameters: Type.Object({
      title: Type.String({ description: "Document title, e.g. 'M001-ROADMAP' or 'DECISIONS'" }),
      content: Type.String({ description: "Markdown content to write" }),
      projectId: Type.Optional(Type.String({ description: "Project UUID — attach document to this project" })),
      issueId: Type.Optional(Type.String({ description: "Issue UUID — attach document to this issue" })),
    }),
    async execute(_id, params) {
      const hasProject = params.projectId !== undefined;
      const hasIssue = params.issueId !== undefined;
      if (hasProject === hasIssue) {
        return fail(new Error("Exactly one of projectId or issueId is required"));
      }
      const attachment: DocumentAttachment = hasProject
        ? { projectId: params.projectId! }
        : { issueId: params.issueId! };
      return run(async () => {
        const doc = await writeKataDocument(client, params.title, normalizeMarkdownContent(params.content), attachment);
        return renderMutationSummary({
          noun: "Document",
          action: "written",
          lines: [
            `id: ${doc.id}`,
            `title: ${doc.title}`,
            `project: ${doc.project?.name ?? "—"}`,
            `issue: ${doc.issue?.identifier ?? "—"}`,
            `updatedAt: ${doc.updatedAt}`,
            "Use kata_read_document to inspect content.",
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_read_document",
    label: "Kata: Read Document",
    description:
      "Read a Kata artifact document by title from the attachment target. " +
      "Returns compact metadata with paged markdown content when found, or null if not yet written. " +
      "null is the canonical signal for 'document does not exist yet'. " +
      "Exactly one of projectId or issueId must be provided.",
    promptSnippet: "Read one Kata artifact by title with optional offset/limit paging.",
    parameters: Type.Object({
      title: Type.String({ description: "Document title to look up, e.g. 'M001-ROADMAP'" }),
      projectId: Type.Optional(Type.String({ description: "Project UUID — scope the lookup to this project" })),
      issueId: Type.Optional(Type.String({ description: "Issue UUID — scope the lookup to this issue" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Line number to start reading from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of content lines to read" })),
    }),
    async execute(_id, params) {
      const hasProject = params.projectId !== undefined;
      const hasIssue = params.issueId !== undefined;
      if (hasProject === hasIssue) {
        return fail(new Error("Exactly one of projectId or issueId is required"));
      }
      const attachment: DocumentAttachment = hasProject
        ? { projectId: params.projectId! }
        : { issueId: params.issueId! };
      return run(async () => {
        const doc = await readKataDocument(client, params.title, attachment);
        if (!doc) return null;

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
    name: "kata_list_documents",
    label: "Kata: List Documents",
    description:
      "List Kata document inventory metadata attached to a given project or issue. " +
      "Zero-side-effect inspection surface — does not modify any state. " +
      "Document content is omitted from list output; use kata_read_document for paged content reads. " +
      "Exactly one of projectId or issueId must be provided.",
    promptSnippet: "List Kata document inventory metadata for a project or issue (content omitted).",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Project UUID — list documents attached to this project" })),
      issueId: Type.Optional(Type.String({ description: "Issue UUID — list documents attached to this issue" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      const hasProject = params.projectId !== undefined;
      const hasIssue = params.issueId !== undefined;
      if (hasProject === hasIssue) {
        return fail(new Error("Exactly one of projectId or issueId is required"));
      }
      return run(async () => {
        const docs = await client.listDocumentSummaries(hasProject
          ? { projectId: params.projectId! }
          : { issueId: params.issueId! });
        return renderInventoryResult({
          noun: "documents",
          items: docs,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Document contents omitted from list output. Use kata_read_document to read one document.",
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

  // =========================================================================
  // Kata state-derivation and advancement tools
  // =========================================================================

  pi.registerTool({
    name: "kata_list_milestones",
    label: "Kata: List Milestones",
    description:
      "List compact inventory of Linear project milestones for a Kata project, sorted by sortOrder. " +
      "Zero-side-effect inspection surface — does not modify any state.",
    promptSnippet: "List compact inventory of Linear project milestones for a Kata project, sorted by sortOrder.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Linear project UUID" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return run(async () => {
        const milestones = await listKataMilestones(client, params.projectId);
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
    name: "kata_derive_state",
    label: "Kata: Derive Linear State",
    description:
      "Derive a full KataState from the Linear API. " +
      "Reads projectId and teamId from project preferences (loadEffectiveLinearProjectConfig). " +
      "Reads LINEAR_API_KEY from process.env. " +
      "Returns a KataState JSON with activeMilestone, activeSlice, activeTask, phase, progress, blockers, " +
      "plus projectId and teamId (use these for kata_read_document / kata_list_documents calls). " +
      "Returns phase 'blocked' (not an error) when LINEAR_API_KEY or project config is missing.",
    promptSnippet: "Derive a full KataState from the Linear API.",
    parameters: Type.Object({}),
    async execute() {
      const apiKey = process.env.LINEAR_API_KEY;
      if (!apiKey) {
        return ok({
          phase: "blocked",
          activeMilestone: null,
          activeSlice: null,
          activeTask: null,
          blockers: ["LINEAR_API_KEY not set"],
          recentDecisions: [],
          nextAction: "Set LINEAR_API_KEY before calling kata_derive_state.",
          registry: [],
        });
      }

      const config = loadEffectiveLinearProjectConfig();
      const { projectId } = config.linear;

      if (!projectId) {
        return ok({
          phase: "blocked",
          activeMilestone: null,
          activeSlice: null,
          activeTask: null,
          blockers: ["Linear project not configured — set linear.projectSlug in .kata/preferences.md"],
          recentDecisions: [],
          nextAction: "Run /kata prefs to configure the Linear project.",
          registry: [],
        });
      }

      return run(async () => {
        const derivationClient = new LinearClient(apiKey);

        // Resolve projectId slug → UUID if needed (filter expressions require UUIDs).
        const projectResolution = await resolveConfiguredLinearProjectId(derivationClient);
        if (!projectResolution.projectId) {
          return {
            phase: "blocked",
            activeMilestone: null,
            activeSlice: null,
            activeTask: null,
            blockers: [projectResolution.error ?? "Linear project could not be resolved."],
            recentDecisions: [],
            nextAction: "Fix linear.projectSlug in preferences.",
            registry: [],
          };
        }
        const resolvedProjectId = projectResolution.projectId;

        const teamResolution = await resolveConfiguredLinearTeamId(derivationClient);
        if (!teamResolution.teamId) {
          return {
            phase: "blocked",
            activeMilestone: null,
            activeSlice: null,
            activeTask: null,
            blockers: [teamResolution.error ?? "Linear team could not be resolved."],
            recentDecisions: [],
            nextAction: "Fix linear.teamId or linear.teamKey in preferences.",
            registry: [],
          };
        }

        const teamId = teamResolution.teamId;
        const labelSet = await ensureKataLabels(derivationClient, teamId);

        const state = await deriveLinearState(derivationClient, {
          projectId: resolvedProjectId,
          teamId,
          sliceLabelId: labelSet.slice.id,
        });
        return { ...state, projectId: resolvedProjectId, teamId };
      });
    },
  });

  pi.registerTool({
    name: "kata_update_issue_state",
    label: "Kata: Update Issue State",
    description:
      "Advance a Linear issue to the workflow state corresponding to a given Kata phase. " +
      "Resolves the correct Linear stateId from the team's workflow states, then updates the issue. " +
      "Returns a compact mutation summary with issue identity and resolved state metadata.",
    promptSnippet: "Advance a Linear issue to a Kata phase and return compact state-update metadata.",
    parameters: Type.Object({
      issueId: Type.String({ description: "Linear issue UUID to update" }),
      phase: Type.Union(
        [
          Type.Literal("backlog"),
          Type.Literal("planning"),
          Type.Literal("executing"),
          Type.Literal("verifying"),
          Type.Literal("done"),
        ],
        { description: "Kata phase to advance the issue to" }
      ),
      teamId: Type.Optional(
        Type.String({ description: "Team UUID — resolved from project preferences when omitted" })
      ),
    }),
    async execute(_id, params) {
      return run(async () => {
        let resolvedTeamId = params.teamId ?? null;
        if (!resolvedTeamId) {
          const teamResolution = await resolveConfiguredLinearTeamId(client);
          if (!teamResolution.teamId) {
            throw new Error(
              teamResolution.error ??
                "teamId required — pass it explicitly or configure linear.teamId (or linear.teamKey) in kata preferences"
            );
          }
          resolvedTeamId = teamResolution.teamId;
        }

        // Guard: prevent the agent from marking a slice "done" directly.
        // Slices must go through the summarizing phase (orchestrator-driven),
        // which writes the summary/UAT docs and triggers the PR gate.
        if (params.phase === "done") {
          const issue = await client.getIssue(params.issueId);
          const isSlice = issue?.labels?.some(
            (l: { name: string }) => l.name === "kata:slice",
          );
          if (isSlice) {
            throw new Error(
              "Cannot advance a slice to done directly. " +
              "The orchestrator handles slice completion after the summarizing phase. " +
              "Only advance individual tasks to done — the slice will be completed automatically."
            );
          }
        }

        const states = await client.listWorkflowStates(resolvedTeamId);
        const targetState = getLinearStateForKataPhase(states, params.phase as KataPhase);
        if (!targetState) {
          throw new Error(`No workflow state found for phase: ${params.phase}`);
        }
        const issue = await client.updateIssue(params.issueId, { stateId: targetState.id });
        return renderMutationSummary({
          noun: "Issue state",
          action: "updated",
          lines: [
            `issueId: ${issue.id}`,
            `identifier: ${issue.identifier}`,
            `phase: ${params.phase}`,
            `stateId: ${targetState.id}`,
            `state: ${issue.state.name}`,
          ],
        });
      });
    },
  });
}
