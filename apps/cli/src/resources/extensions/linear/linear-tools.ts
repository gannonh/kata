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
  resolveConfiguredLinearTeamId,
} from "../kata/linear-config.js";

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
    promptSnippet: "List all teams in the Linear workspace.",
    parameters: Type.Object({}),
    async execute() { return run(() => client.listTeams()); },
  });

  pi.registerTool({
    name: "linear_get_team",
    label: "Linear: Get Team",
    description: "Get a team by key (e.g. 'KAT') or UUID.",
    promptSnippet: "Get a team by key or UUID.",
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
    promptSnippet: "Create a new Linear project.",
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
    promptSnippet: "Get a project by UUID or slug ID.",
    parameters: Type.Object({
      id: Type.String({ description: "Project UUID or slug ID" }),
    }),
    async execute(_id, params) { return run(() => client.getProject(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_projects",
    label: "Linear: List Projects",
    description: "List projects in the workspace, optionally filtered by team.",
    promptSnippet: "List projects in the workspace, optionally filtered by team.",
    parameters: Type.Object({
      teamId: Type.Optional(Type.String({ description: "Filter by team UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (default: 50)" })),
    }),
    async execute(_id, params) {
      const hasParams = params.teamId !== undefined || params.first !== undefined;
      return run(() => client.listProjects(hasParams ? params : undefined));
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
      return run(() => client.updateProject(id, input));
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
    async execute(_id, params) { return run(() => client.deleteProject(params.id)); },
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
    async execute(_id, params) { return run(() => client.createMilestone(params)); },
  });

  pi.registerTool({
    name: "linear_get_milestone",
    label: "Linear: Get Milestone",
    description: "Get a milestone by UUID.",
    promptSnippet: "Get a milestone by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Milestone UUID" }),
    }),
    async execute(_id, params) { return run(() => client.getMilestone(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_milestones",
    label: "Linear: List Milestones",
    description: "List milestones under a project.",
    promptSnippet: "List milestones under a project.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID" }),
    }),
    async execute(_id, params) { return run(() => client.listMilestones(params.projectId)); },
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
      return run(() => client.updateMilestone(id, input));
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
    async execute(_id, params) { return run(() => client.deleteMilestone(params.id)); },
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
    async execute(_id, params) { return run(() => client.createIssue(params)); },
  });

  pi.registerTool({
    name: "linear_get_issue",
    label: "Linear: Get Issue",
    description: "Get an issue by UUID or identifier (e.g. 'KAT-42'). Returns full details including parent, children, labels, and state.",
    promptSnippet: "Get an issue by UUID or identifier.",
    parameters: Type.Object({
      id: Type.String({ description: "Issue UUID or identifier (e.g. 'KAT-42')" }),
    }),
    async execute(_id, params) { return run(() => client.getIssue(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_issues",
    label: "Linear: List Issues",
    description: "List issues with optional filters: team, project, parent (for sub-issues), state, labels, assignee.",
    promptSnippet: "List issues with optional filters: team, project, parent (for sub-issues), state, labels, assignee.",
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
      return run(() => client.createRelation(params));
    },
  });

  pi.registerTool({
    name: "linear_list_relations",
    label: "Linear: List Relations",
    description: "List all relations for an issue (outbound and inbound) with normalized direction.",
    promptSnippet: "List all relations for an issue.",
    parameters: Type.Object({
      issueId: Type.String({ description: "Issue UUID" }),
    }),
    async execute(_id, params) {
      return run(() => client.listRelations(params.issueId));
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
      const { id, ...input } = params;
      return run(() => client.updateIssue(id, input));
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
    async execute(_id, params) { return run(() => client.deleteIssue(params.id)); },
  });

  // =========================================================================
  // Workflow States
  // =========================================================================

  pi.registerTool({
    name: "linear_list_workflow_states",
    label: "Linear: List Workflow States",
    description: "List all workflow states for a team. States have types: backlog, unstarted, started, completed, canceled.",
    promptSnippet: "List all workflow states for a team.",
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
    promptSnippet: "Create an issue label.",
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
    promptSnippet: "List labels, optionally filtered by team.",
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
    promptSnippet: "Delete a label by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Label UUID" }),
    }),
    async execute(_id, params) { return run(() => client.deleteLabel(params.id)); },
  });

  // ── Comments ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "linear_add_comment",
    label: "Linear: Add Comment",
    description: "Post a comment on a Linear issue. Returns the created comment with id, body, createdAt, and url.",
    promptSnippet: "Post a comment on a Linear issue.",
    parameters: Type.Object({
      issueId: Type.String({ description: "Issue UUID to comment on" }),
      body: Type.String({ description: "Comment body (markdown supported)" }),
    }),
    async execute(_id, params) { return run(() => client.createComment(params.issueId, params.body)); },
  });

  pi.registerTool({
    name: "linear_ensure_label",
    label: "Linear: Ensure Label",
    description: "Get or create a label by name. Idempotent — returns existing label if name matches, creates new one otherwise.",
    promptSnippet: "Get or create a label by name.",
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
    promptSnippet: "Create a document.",
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
    promptSnippet: "Get a document by UUID.",
    parameters: Type.Object({
      id: Type.String({ description: "Document UUID" }),
    }),
    async execute(_id, params) { return run(() => client.getDocument(params.id)); },
  });

  pi.registerTool({
    name: "linear_list_documents",
    label: "Linear: List Documents",
    description: "List documents, optionally filtered by project.",
    promptSnippet: "List documents, optionally filtered by project.",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Filter by project UUID" })),
      first: Type.Optional(Type.Number({ description: "Max results per page (default: 50)" })),
    }),
    async execute(_id, params) {
      const hasParams = params.projectId !== undefined || params.first !== undefined;
      return run(() => client.listDocuments(hasParams ? params : undefined));
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
    async execute(_id, params) { return run(() => client.deleteDocument(params.id)); },
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
    promptSnippet: "Get the authenticated users profile.",
    parameters: Type.Object({}),
    async execute() { return run(() => client.getViewer()); },
  });

  // =========================================================================
  // Kata entity tools — Kata-semantics wrappers over linear-entities.ts
  // =========================================================================

  pi.registerTool({
    name: "kata_ensure_labels",
    label: "Kata: Ensure Labels",
    description:
      "Idempotently provision the three Kata labels (kata:milestone, kata:slice, kata:task) " +
      "in the given team. Returns the full KataLabelSet with label IDs. " +
      "Call this once per session; pass the returned label IDs to the kata_create_* tools.",
    promptSnippet: "Idempotently provision the three Kata labels (kata:milestone, kata:slice, kata:task) in the given team.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID in which to provision the Kata labels" }),
    }),
    async execute(_id, params) {
      return run(() => ensureKataLabels(client, params.teamId));
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
      return run(() =>
        createKataMilestone(
          client,
          { projectId: params.projectId },
          {
            kataId: params.kataId,
            title: params.title,
            description: params.description,
            targetDate: params.targetDate,
          }
        )
      );
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
        return createKataSlice(
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
        return createKataTask(
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
      });
    },
  });

  pi.registerTool({
    name: "kata_list_slices",
    label: "Kata: List Slices",
    description:
      "List all Linear issues representing Kata slices in a project. " +
      "Resolves the kata:slice label automatically from the team.",
    promptSnippet: "List all Linear issues representing Kata slices in a project.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID to scope the query" }),
      teamId: Type.String({ description: "Team UUID (from kata_derive_state or preferences)" }),
    }),
    async execute(_id, params) {
      return run(async () => {
        const labelSet = await ensureKataLabels(client, params.teamId);
        return listKataSlices(client, params.projectId, labelSet.slice.id);
      });
    },
  });

  pi.registerTool({
    name: "kata_list_tasks",
    label: "Kata: List Tasks",
    description:
      "List all Linear sub-issues representing Kata tasks for a given slice issue. " +
      "Queries by parentId — returns all direct children of the slice issue.",
    promptSnippet: "List all Linear sub-issues representing Kata tasks for a given slice issue.",
    parameters: Type.Object({
      sliceIssueId: Type.String({ description: "Linear issue UUID of the parent slice issue" }),
    }),
    async execute(_id, params) {
      return run(() => listKataTasks(client, params.sliceIssueId));
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
      "Returns the full LinearDocument including id, title, content, createdAt, updatedAt.",
    promptSnippet: "Write a Kata artifact as a Linear Document (upsert by title).",
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
      return run(() => writeKataDocument(client, params.title, params.content, attachment));
    },
  });

  pi.registerTool({
    name: "kata_read_document",
    label: "Kata: Read Document",
    description:
      "Read a Kata artifact document by title from the attachment target. " +
      "Returns the document (with full markdown content) if found, or null if not yet written. " +
      "null is the canonical signal for 'document does not exist yet'. " +
      "Exactly one of projectId or issueId must be provided.",
    promptSnippet: "Read a Kata artifact document by title from the attachment target.",
    parameters: Type.Object({
      title: Type.String({ description: "Document title to look up, e.g. 'M001-ROADMAP'" }),
      projectId: Type.Optional(Type.String({ description: "Project UUID — scope the lookup to this project" })),
      issueId: Type.Optional(Type.String({ description: "Issue UUID — scope the lookup to this issue" })),
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
      return run(() => readKataDocument(client, params.title, attachment));
    },
  });

  pi.registerTool({
    name: "kata_list_documents",
    label: "Kata: List Documents",
    description:
      "List all Kata documents attached to a given project or issue. " +
      "Zero-side-effect inspection surface — does not modify any state. " +
      "Returns an array of LinearDocument objects; empty array means no documents exist. " +
      "Exactly one of projectId or issueId must be provided.",
    promptSnippet: "List all Kata documents attached to a given project or issue.",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Project UUID — list documents attached to this project" })),
      issueId: Type.Optional(Type.String({ description: "Issue UUID — list documents attached to this issue" })),
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
      return run(() => listKataDocuments(client, attachment));
    },
  });

  // =========================================================================
  // Kata state-derivation and advancement tools
  // =========================================================================

  pi.registerTool({
    name: "kata_list_milestones",
    label: "Kata: List Milestones",
    description:
      "List all Linear project milestones for a Kata project, sorted by sortOrder. " +
      "Zero-side-effect inspection surface — does not modify any state.",
    promptSnippet: "List all Linear project milestones for a Kata project, sorted by sortOrder.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Linear project UUID" }),
    }),
    async execute(_id, params) {
      return run(() => listKataMilestones(client, params.projectId));
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
          blockers: ["Linear project not configured — set linear.projectId in kata preferences"],
          recentDecisions: [],
          nextAction: "Run /kata prefs to configure the Linear project.",
          registry: [],
        });
      }

      return run(async () => {
        const derivationClient = new LinearClient(apiKey);
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
          projectId,
          teamId,
          sliceLabelId: labelSet.slice.id,
        });
        return { ...state, projectId, teamId };
      });
    },
  });

  pi.registerTool({
    name: "kata_update_issue_state",
    label: "Kata: Update Issue State",
    description:
      "Advance a Linear issue to the workflow state corresponding to a given Kata phase. " +
      "Resolves the correct Linear stateId from the team's workflow states, then updates the issue. " +
      "Returns the updated issue with its new state.",
    promptSnippet: "Advance a Linear issue to the workflow state corresponding to a given Kata phase.",
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
        return client.updateIssue(params.issueId, { stateId: targetState.id });
      });
    },
  });
}
