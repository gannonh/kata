/**
 * Pi tool definitions for the Linear extension.
 *
 * Each tool wraps a LinearClient method with parameter validation,
 * structured JSON output, and classified error handling.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { LinearClient } from "./linear-client.js";
import { classifyLinearError } from "./http.js";

// =============================================================================
// Helpers
// =============================================================================

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(err: unknown) {
  const classified = classifyLinearError(err);
  return {
    content: [{ type: "text" as const, text: `Error (${classified.kind}): ${classified.message}` }],
    isError: true,
    details: { errorKind: classified.kind, message: classified.message },
  };
}

async function run<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
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
    description: "List all teams in the Linear workspace.",
    parameters: Type.Object({}),
    async execute() { return run(() => client.listTeams()); },
  });

  pi.registerTool({
    name: "linear_get_team",
    label: "Linear: Get Team",
    description: "Get a team by key (e.g. 'KAT') or UUID.",
    parameters: Type.Object({
      idOrKey: Type.String({ description: "Team key (e.g. 'KAT') or UUID" }),
    }),
    async execute(_id, params) { return run(() => client.getTeam(params.idOrKey)); },
  });

  // =========================================================================
  // Projects
  // =========================================================================

  pi.registerTool({
    name: "linear_create_project",
    label: "Linear: Create Project",
    description: "Create a new Linear project.",
    parameters: Type.Object({
      name: Type.String({ description: "Project name" }),
      teamIds: Type.Array(Type.String(), { description: "Team UUIDs to associate with the project" }),
      description: Type.Optional(Type.String({ description: "Project description" })),
      state: Type.Optional(Type.String({ description: "Project state: planned, started, paused, completed, canceled, backlog" })),
      startDate: Type.Optional(Type.String({ description: "Start date (ISO format)" })),
      targetDate: Type.Optional(Type.String({ description: "Target date (ISO format)" })),
    }),
    async execute(_id, params) { return run(() => client.createProject(params)); },
  });

  pi.registerTool({
    name: "linear_get_project",
    label: "Linear: Get Project",
    description: "Get a project by UUID or slug ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Project UUID or slug ID" }),
    }),
    async execute(_id, params) { return run(() => client.getProject(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_projects",
    label: "Linear: List Projects",
    description: "List projects in the workspace, optionally filtered by team.",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Filter by team UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (default: 50)" })),
    }),
    async execute(_id, params) {
      return run(() => client.listProjects(params.teamId || params.first ? params : undefined));
    },
  });

  pi.registerTool({
    name: "linear_update_project",
    label: "Linear: Update Project",
    description: "Update a project's name, description, state, or dates.",
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
      return run(() => client.updateProject(id, input));
    },
  });

  pi.registerTool({
    name: "linear_delete_project",
    label: "Linear: Delete Project",
    description: "Delete a project by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Project UUID" }),
    }),
    async execute(_id, params) { return run(() => client.deleteProject(params.id)); },
  });

  // =========================================================================
  // Milestones
  // =========================================================================

  pi.registerTool({
    name: "linear_create_milestone",
    label: "Linear: Create Milestone",
    description: "Create a milestone under a project. Milestones belong to projects, not teams.",
    parameters: Type.Object({
      name: Type.String({ description: "Milestone name" }),
      projectId: Type.String({ description: "Project UUID (required — milestones belong to projects)" }),
      description: Type.Optional(Type.String({ description: "Milestone description" })),
      targetDate: Type.Optional(Type.String({ description: "Target date (ISO)" })),
      sortOrder: Type.Optional(Type.Number({ description: "Sort order" })),
    }),
    async execute(_id, params) { return run(() => client.createMilestone(params)); },
  });

  pi.registerTool({
    name: "linear_get_milestone",
    label: "Linear: Get Milestone",
    description: "Get a milestone by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Milestone UUID" }),
    }),
    async execute(_id, params) { return run(() => client.getMilestone(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_milestones",
    label: "Linear: List Milestones",
    description: "List milestones under a project.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID" }),
    }),
    async execute(_id, params) { return run(() => client.listMilestones(params.projectId)); },
  });

  pi.registerTool({
    name: "linear_update_milestone",
    label: "Linear: Update Milestone",
    description: "Update a milestone's name, description, target date, or sort order.",
    parameters: Type.Object({
      id: Type.String({ description: "Milestone UUID" }),
      name: Type.Optional(Type.String({ description: "New name" })),
      description: Type.Optional(Type.String({ description: "New description" })),
      targetDate: Type.Optional(Type.String({ description: "New target date (ISO)" })),
      sortOrder: Type.Optional(Type.Number({ description: "New sort order" })),
    }),
    async execute(_id, params) {
      const { id, ...input } = params;
      return run(() => client.updateMilestone(id, input));
    },
  });

  pi.registerTool({
    name: "linear_delete_milestone",
    label: "Linear: Delete Milestone",
    description: "Delete a milestone by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Milestone UUID" }),
    }),
    async execute(_id, params) { return run(() => client.deleteMilestone(params.id)); },
  });

  // =========================================================================
  // Issues (including sub-issues)
  // =========================================================================

  pi.registerTool({
    name: "linear_create_issue",
    label: "Linear: Create Issue",
    description: "Create an issue. Use parentId (UUID) to create a sub-issue. Supports project, milestone, labels, and state assignment.",
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
      priority: Type.Optional(Type.Number({ description: "Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low" })),
      estimate: Type.Optional(Type.Number({ description: "Issue estimate" })),
    }),
    async execute(_id, params) { return run(() => client.createIssue(params)); },
  });

  pi.registerTool({
    name: "linear_get_issue",
    label: "Linear: Get Issue",
    description: "Get an issue by UUID or identifier (e.g. 'KAT-42'). Returns full details including parent, children, labels, and state.",
    parameters: Type.Object({
      id: Type.String({ description: "Issue UUID or identifier (e.g. 'KAT-42')" }),
    }),
    async execute(_id, params) { return run(() => client.getIssue(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_issues",
    label: "Linear: List Issues",
    description: "List issues with optional filters: team, project, parent (for sub-issues), state, labels, assignee.",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Filter by team UUID" })),
      projectId: Type.Optional(Type.String({ description: "Filter by project UUID" })),
      parentId: Type.Optional(Type.String({ description: "Filter by parent issue UUID (lists sub-issues)" })),
      stateId: Type.Optional(Type.String({ description: "Filter by workflow state UUID" })),
      labelIds: Type.Optional(Type.Array(Type.String(), { description: "Filter by label UUIDs (issues with any of these labels)" })),
      assigneeId: Type.Optional(Type.String({ description: "Filter by assignee UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (default: 50)" })),
    }),
    async execute(_id, params) { return run(() => client.listIssues(params)); },
  });

  pi.registerTool({
    name: "linear_update_issue",
    label: "Linear: Update Issue",
    description: "Update an issue's title, description, state, labels, priority, assignee, parent, project, or milestone.",
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
      priority: Type.Optional(Type.Number({ description: "New priority" })),
      estimate: Type.Optional(Type.Number({ description: "New estimate" })),
    }),
    async execute(_id, params) {
      const { id, ...input } = params;
      return run(() => client.updateIssue(id, input));
    },
  });

  pi.registerTool({
    name: "linear_delete_issue",
    label: "Linear: Delete Issue",
    description: "Delete an issue by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Issue UUID" }),
    }),
    async execute(_id, params) { return run(() => client.deleteIssue(params.id)); },
  });

  // =========================================================================
  // Workflow States
  // =========================================================================

  pi.registerTool({
    name: "linear_list_workflow_states",
    label: "Linear: List Workflow States",
    description: "List all workflow states for a team. States have types: backlog, unstarted, started, completed, canceled.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID" }),
    }),
    async execute(_id, params) { return run(() => client.listWorkflowStates(params.teamId)); },
  });

  // =========================================================================
  // Labels
  // =========================================================================

  pi.registerTool({
    name: "linear_create_label",
    label: "Linear: Create Label",
    description: "Create an issue label. Omit teamId for a workspace-level label.",
    parameters: Type.Object({
      name: Type.String({ description: "Label name" }),
      color: Type.Optional(Type.String({ description: "Label color hex (e.g. '#FF0000')" })),
      description: Type.Optional(Type.String({ description: "Label description" })),
      teamId: Type.Optional(Type.String({ description: "Team UUID — omit for workspace-level label" })),
    }),
    async execute(_id, params) { return run(() => client.createLabel(params)); },
  });

  pi.registerTool({
    name: "linear_list_labels",
    label: "Linear: List Labels",
    description: "List labels, optionally filtered by team.",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Filter by team UUID" })),
    }),
    async execute(_id, params) {
      return run(() => client.listLabels(params.teamId ? { teamId: params.teamId } : undefined));
    },
  });

  pi.registerTool({
    name: "linear_delete_label",
    label: "Linear: Delete Label",
    description: "Delete a label by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Label UUID" }),
    }),
    async execute(_id, params) { return run(() => client.deleteLabel(params.id)); },
  });

  pi.registerTool({
    name: "linear_ensure_label",
    label: "Linear: Ensure Label",
    description: "Get or create a label by name. Idempotent — returns existing label if name matches, creates new one otherwise.",
    parameters: Type.Object({
      name: Type.String({ description: "Label name" }),
      color: Type.Optional(Type.String({ description: "Label color hex (used only when creating)" })),
      description: Type.Optional(Type.String({ description: "Label description (used only when creating)" })),
      teamId: Type.Optional(Type.String({ description: "Team UUID — omit for workspace-level label" })),
    }),
    async execute(_id, params) {
      const { name, ...opts } = params;
      return run(() => client.ensureLabel(name, Object.keys(opts).length > 0 ? opts : undefined));
    },
  });

  // =========================================================================
  // Documents
  // =========================================================================

  pi.registerTool({
    name: "linear_create_document",
    label: "Linear: Create Document",
    description: "Create a document. Attach to a project and/or issue via their UUIDs.",
    parameters: Type.Object({
      title: Type.String({ description: "Document title" }),
      content: Type.Optional(Type.String({ description: "Document content (markdown)" })),
      projectId: Type.Optional(Type.String({ description: "Project UUID to attach document to" })),
      issueId: Type.Optional(Type.String({ description: "Issue UUID to attach document to" })),
      icon: Type.Optional(Type.String({ description: "Document icon emoji" })),
      color: Type.Optional(Type.String({ description: "Document color hex" })),
    }),
    async execute(_id, params) { return run(() => client.createDocument(params)); },
  });

  pi.registerTool({
    name: "linear_get_document",
    label: "Linear: Get Document",
    description: "Get a document by UUID. Returns full markdown content.",
    parameters: Type.Object({
      id: Type.String({ description: "Document UUID" }),
    }),
    async execute(_id, params) { return run(() => client.getDocument(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_documents",
    label: "Linear: List Documents",
    description: "List documents, optionally filtered by project.",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Filter by project UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (default: 50)" })),
    }),
    async execute(_id, params) {
      return run(() => client.listDocuments(
        params.projectId || params.first ? params : undefined,
      ));
    },
  });

  pi.registerTool({
    name: "linear_delete_document",
    label: "Linear: Delete Document",
    description: "Delete a document by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Document UUID" }),
    }),
    async execute(_id, params) { return run(() => client.deleteDocument(params.id)); },
  });

  pi.registerTool({
    name: "linear_update_document",
    label: "Linear: Update Document",
    description: "Update a document's title, content, icon, or color.",
    parameters: Type.Object({
      id: Type.String({ description: "Document UUID" }),
      title: Type.Optional(Type.String({ description: "New title" })),
      content: Type.Optional(Type.String({ description: "New content (markdown)" })),
      icon: Type.Optional(Type.String({ description: "New icon emoji" })),
      color: Type.Optional(Type.String({ description: "New color hex" })),
    }),
    async execute(_id, params) {
      const { id, ...input } = params;
      return run(() => client.updateDocument(id, input));
    },
  });

  // =========================================================================
  // Viewer (utility)
  // =========================================================================

  pi.registerTool({
    name: "linear_get_viewer",
    label: "Linear: Get Viewer",
    description: "Get the authenticated user's profile. Useful for verifying API key and getting user ID.",
    parameters: Type.Object({}),
    async execute() { return run(() => client.getViewer()); },
  });
}
