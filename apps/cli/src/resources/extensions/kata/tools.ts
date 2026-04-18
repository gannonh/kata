import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { KataBackend } from "./backend.js";
import { createBackend } from "./backend.js";
import {
  renderCompactRead,
  renderErrorSummary,
  renderInventoryResult,
  renderMutationSummary,
} from "../linear/tool-output.js";

export const KATA_TOOL_STRATEGIES = {
  kata_ensure_labels: "mutation",
  kata_create_milestone: "mutation",
  kata_create_slice: "mutation",
  kata_create_task: "mutation",
  kata_list_slices: "inventory",
  kata_list_tasks: "inventory",
  kata_get_issue: "paged-read",
  kata_upsert_comment: "mutation",
  kata_create_followup_issue: "mutation",
  kata_write_document: "mutation",
  kata_read_document: "paged-read",
  kata_list_documents: "inventory",
  kata_list_milestones: "inventory",
  kata_derive_state: "state",
  kata_update_issue_state: "mutation",
} as const;

function okText(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function ok(data: unknown) {
  return okText(JSON.stringify(data, null, 2));
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: renderErrorSummary("kata", message) }],
    isError: true,
    details: { errorKind: "kata", message },
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

async function withBackend<T>(
  createBackendImpl: (basePath: string) => Promise<KataBackend>,
  fn: (backend: KataBackend) => Promise<T | string>,
) {
  return run(async () => {
    const backend = await createBackendImpl(process.cwd());
    return fn(backend);
  });
}

export function registerKataTools(
  pi: ExtensionAPI,
  deps: { createBackend?: typeof createBackend } = {},
) {
  const createBackendImpl = deps.createBackend ?? createBackend;

  pi.registerTool({
    name: "kata_ensure_labels",
    label: "Kata: Ensure Labels",
    description:
      "Ensure any backend-managed Kata labels or marker conventions are ready for the active workflow backend. " +
      "In Linear mode, labels are ensured during backend bootstrap. In GitHub mode, labels are created lazily during artifact writes.",
    promptSnippet: "Ensure backend-managed Kata labels or marker conventions are ready for the active workflow backend.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID in which to provision the Kata labels (used in Linear mode; ignored in GitHub mode)" }),
    }),
    async execute() {
      return withBackend(createBackendImpl, async (backend) => renderMutationSummary({
        noun: "Kata backend",
        action: "prepared",
        lines: [
          `mode: ${backend.isLinearMode ? "linear" : "github"}`,
          backend.isLinearMode
            ? "Linear labels are ensured during backend bootstrap."
            : "GitHub labels are created lazily via GraphQL when artifact writes require them.",
        ],
      }));
    },
  });

  pi.registerTool({
    name: "kata_create_milestone",
    label: "Kata: Create Milestone",
    description:
      "Create a backend-native Kata milestone. Linear mode creates a ProjectMilestone. GitHub mode creates or updates a milestone issue with canonical metadata.",
    promptSnippet: "Create a backend-native Kata milestone.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID to attach the milestone to in Linear mode (ignored in GitHub mode)" }),
      kataId: Type.String({ description: "Kata milestone ID, e.g. 'M001'" }),
      title: Type.String({ description: "Human-readable milestone title" }),
      description: Type.Optional(Type.String({ description: "Milestone description (markdown)" })),
      targetDate: Type.Optional(Type.String({ description: "Target date (ISO string, e.g. '2025-06-30')" })),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const milestone = await backend.createMilestone({
          kataId: params.kataId,
          title: params.title,
          description: params.description,
          targetDate: params.targetDate,
        });
        return renderMutationSummary({
          noun: "Milestone",
          action: "created",
          lines: [
            `id: ${milestone.id}`,
            `name: ${milestone.name}`,
            `targetDate: ${milestone.targetDate ?? "—"}`,
            ...(milestone.trackerIssueId ? [`trackerIssueId: ${milestone.trackerIssueId}`] : []),
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_create_slice",
    label: "Kata: Create Slice",
    description:
      "Create a backend-native Kata slice. Linear mode creates a slice issue. GitHub mode creates or updates a slice issue with canonical metadata and plan body.",
    promptSnippet: "Create a backend-native Kata slice.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID in Linear mode (ignored in GitHub mode)" }),
      projectId: Type.String({ description: "Project UUID in Linear mode (ignored in GitHub mode)" }),
      kataId: Type.String({ description: "Kata slice ID, e.g. 'S01'" }),
      title: Type.String({ description: "Human-readable slice title" }),
      milestoneId: Type.Optional(Type.String({ description: "Milestone identifier for the active backend" })),
      sliceLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:slice in Linear mode (ignored by backend-native dispatch)" })),
      taskLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:task in Linear mode (ignored by backend-native dispatch)" })),
      description: Type.Optional(Type.String({ description: "Slice description or canonical plan content." })),
      initialPhase: Type.Optional(
        Type.Union([
          Type.Literal("backlog"),
          Type.Literal("planning"),
          Type.Literal("executing"),
          Type.Literal("verifying"),
          Type.Literal("done"),
        ], { description: "Initial Kata phase; omit to use backend defaults." }),
      ),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const issue = await backend.createSlice({
          kataId: params.kataId,
          title: params.title,
          description: params.description,
          milestoneId: params.milestoneId,
          initialPhase: params.initialPhase,
        });
        return renderMutationSummary({
          noun: "Slice",
          action: "created",
          lines: [
            `id: ${issue.id}`,
            `identifier: ${issue.identifier}`,
            `title: ${issue.title}`,
            `state: ${issue.state}`,
            `project: ${issue.projectName ?? "—"}`,
            `milestone: ${issue.milestoneName ?? "—"}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_create_task",
    label: "Kata: Create Task",
    description:
      "Create a backend-native Kata task. Linear mode creates a sub-issue. GitHub mode creates or updates a task issue and links it as a real GitHub sub-issue via GraphQL.",
    promptSnippet: "Create a backend-native Kata task.",
    parameters: Type.Object({
      teamId: Type.String({ description: "Team UUID in Linear mode (ignored in GitHub mode)" }),
      projectId: Type.String({ description: "Project UUID in Linear mode (ignored in GitHub mode)" }),
      kataId: Type.String({ description: "Kata task ID, e.g. 'T01'" }),
      title: Type.String({ description: "Human-readable task title" }),
      sliceIssueId: Type.String({ description: "Parent slice issue identifier for the active backend" }),
      sliceLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:slice in Linear mode (ignored by backend-native dispatch)" })),
      taskLabelId: Type.Optional(Type.String({ description: "Label UUID for kata:task in Linear mode (ignored by backend-native dispatch)" })),
      description: Type.Optional(Type.String({ description: "Task description or canonical plan content." })),
      initialPhase: Type.Optional(
        Type.Union([
          Type.Literal("backlog"),
          Type.Literal("planning"),
          Type.Literal("executing"),
          Type.Literal("verifying"),
          Type.Literal("done"),
        ], { description: "Initial Kata phase; omit to use backend defaults." }),
      ),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const issue = await backend.createTask({
          kataId: params.kataId,
          title: params.title,
          sliceIssueId: params.sliceIssueId,
          description: params.description,
          initialPhase: params.initialPhase,
        });
        return renderMutationSummary({
          noun: "Task",
          action: "created",
          lines: [
            `id: ${issue.id}`,
            `identifier: ${issue.identifier}`,
            `title: ${issue.title}`,
            `state: ${issue.state}`,
            `parent: ${issue.parentIdentifier ?? params.sliceIssueId}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_list_slices",
    label: "Kata: List Slices",
    description:
      "List backend-native Kata slices for the active project. Pass milestoneId whenever you are working within one milestone.",
    promptSnippet: "List backend-native Kata slices for the active project.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID to scope the query in Linear mode (ignored in GitHub mode)" }),
      teamId: Type.String({ description: "Team UUID in Linear mode (ignored in GitHub mode)" }),
      milestoneId: Type.Optional(Type.String({ description: "Backend milestone identifier; strongly recommended when working within one milestone." })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const slices = await backend.listSlices({ milestoneId: params.milestoneId });
        return renderInventoryResult({
          noun: "slices",
          items: slices,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use backend-native reads or task-specific tools to inspect one issue.",
          renderItem: (issue, index) => [
            `${index}. ${issue.identifier}: ${issue.title}`,
            `   state: ${issue.state}`,
            `   project: ${issue.projectName ?? "—"}`,
            `   milestone: ${issue.milestoneName ?? "—"}`,
            `   labels: ${issue.labels.join(", ") || "—"}`,
            `   updatedAt: ${issue.updatedAt ?? "—"}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_list_tasks",
    label: "Kata: List Tasks",
    description:
      "List backend-native Kata tasks for the given slice issue. GitHub mode enumerates real sub-issues via GraphQL.",
    promptSnippet: "List backend-native Kata tasks for the given slice issue.",
    parameters: Type.Object({
      sliceIssueId: Type.String({ description: "Parent slice issue identifier for the active backend" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const tasks = await backend.listTasks(params.sliceIssueId);
        return renderInventoryResult({
          noun: "tasks",
          items: tasks,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use backend-native reads or task-specific tools to inspect one issue.",
          renderItem: (issue, index) => [
            `${index}. ${issue.identifier}: ${issue.title}`,
            `   state: ${issue.state}`,
            `   parent: ${issue.parentIdentifier ?? params.sliceIssueId}`,
            `   labels: ${issue.labels.join(", ") || "—"}`,
            `   updatedAt: ${issue.updatedAt ?? "—"}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_get_issue",
    label: "Kata: Get Issue",
    description:
      "Read one backend-native Kata issue by identifier with paged description output and compact child/comment metadata.",
    promptSnippet: "Read one backend-native Kata issue by identifier with paged description output.",
    parameters: Type.Object({
      issueId: Type.String({ description: "Backend issue identifier" }),
      includeChildren: Type.Optional(Type.Boolean({ description: "Include child issue metadata (default true)" })),
      includeComments: Type.Optional(Type.Boolean({ description: "Include comment metadata (default true)" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Line number to start reading description from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of description lines to read" })),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const issue = await backend.getIssue(params.issueId, {
          includeChildren: params.includeChildren ?? true,
          includeComments: params.includeComments ?? true,
        });
        if (issue === null) return null;

        return renderCompactRead({
          heading: `Issue ${issue.identifier}: ${issue.title}`,
          metadata: [
            `id: ${issue.id}`,
            `state: ${issue.state}`,
            `project: ${issue.projectName ?? "—"}`,
            `milestone: ${issue.milestoneName ?? "—"}`,
            `parent: ${issue.parentIdentifier ?? "—"}`,
            `labels: ${issue.labels.join(", ") || "—"}`,
            `children: ${issue.children.length}`,
            `comments: ${issue.comments.length}`,
            `updatedAt: ${issue.updatedAt ?? "—"}`,
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
    name: "kata_upsert_comment",
    label: "Kata: Upsert Comment",
    description:
      "Create or update an issue comment in a backend-native way. Marker-aware dispatch lets workers retry safely without duplicate summaries.",
    promptSnippet: "Create or update an issue comment with optional marker-aware dispatch.",
    parameters: Type.Object({
      issueId: Type.String({ description: "Backend issue identifier" }),
      body: Type.String({ description: "Comment body markdown" }),
      marker: Type.Optional(Type.String({ description: "Stable marker used to locate and upsert an existing comment" })),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const comment = await backend.upsertComment({
          issueId: params.issueId,
          body: params.body,
          marker: params.marker,
        });
        return renderMutationSummary({
          noun: "Comment",
          action: "upserted",
          lines: [
            `id: ${comment.id}`,
            `issueId: ${comment.issueId}`,
            `action: ${comment.action ?? "upserted"}`,
            ...(params.marker ? [`requestedMarker: ${params.marker}`] : []),
            ...(comment.marker !== undefined ? [`storedMarker: ${comment.marker ?? "—"}`] : []),
            `createdAt: ${comment.createdAt ?? "—"}`,
            `updatedAt: ${comment.updatedAt ?? "—"}`,
            ...(comment.url ? [`url: ${comment.url}`] : []),
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_create_followup_issue",
    label: "Kata: Create Follow-up Issue",
    description:
      "Create a backend-native follow-up issue linked to an existing issue. Returns a compact mutation summary to keep output bounded.",
    promptSnippet: "Create a backend-native follow-up issue linked to an existing issue.",
    parameters: Type.Object({
      parentIssueId: Type.Optional(Type.String({ description: "Optional parent/source issue identifier for the follow-up" })),
      relationType: Type.Optional(
        Type.Union([
          Type.Literal("relates_to"),
          Type.Literal("blocked_by"),
        ], { description: "Optional relationship type when linking to parent/source issue" }),
      ),
      title: Type.String({ description: "Follow-up issue title" }),
      description: Type.String({ description: "Follow-up issue description" }),
    }),
    async execute(_id, params) {
      if (params.relationType && !params.parentIssueId) {
        return fail(new Error("parentIssueId is required when relationType is provided"));
      }

      return withBackend(createBackendImpl, async (backend) => {
        const issue = await backend.createFollowupIssue({
          parentIssueId: params.parentIssueId,
          relationType: params.relationType,
          title: params.title,
          description: params.description,
        });
        return renderMutationSummary({
          noun: "Follow-up issue",
          action: "created",
          lines: [
            `id: ${issue.id}`,
            `identifier: ${issue.identifier}`,
            `title: ${issue.title}`,
            `state: ${issue.state}`,
            `parent: ${issue.parentIdentifier ?? params.parentIssueId ?? "—"}`,
            ...(params.relationType ? [`relationType: ${params.relationType}`] : []),
            `project: ${issue.projectName ?? "—"}`,
            `milestone: ${issue.milestoneName ?? "—"}`,
          ],
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_write_document",
    label: "Kata: Write Document",
    description:
      "Write a backend-native Kata artifact document. Exactly one of projectId or issueId must be provided. Content is not echoed.",
    promptSnippet: "Write a backend-native Kata artifact document.",
    parameters: Type.Object({
      title: Type.String({ description: "Document title, e.g. 'M001-ROADMAP' or 'DECISIONS'" }),
      content: Type.String({ description: "Markdown content to write" }),
      projectId: Type.Optional(Type.String({ description: "Project identifier for project-scoped artifacts" })),
      issueId: Type.Optional(Type.String({ description: "Issue identifier for issue-scoped artifacts" })),
    }),
    async execute(_id, params) {
      const hasProject = params.projectId !== undefined;
      const hasIssue = params.issueId !== undefined;
      if (hasProject === hasIssue) {
        return fail(new Error("Exactly one of projectId or issueId is required"));
      }
      return withBackend(createBackendImpl, async (backend) => {
        await backend.writeDocument(
          params.title,
          params.content,
          hasProject ? { projectId: params.projectId! } : { issueId: params.issueId! },
        );
        return renderMutationSummary({
          noun: "Document",
          action: "written",
          lines: [
            `title: ${params.title}`,
            `scope: ${hasProject ? `project:${params.projectId}` : `issue:${params.issueId}`}`,
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
      "Read a backend-native Kata artifact document by title from the given scope. Returns JSON null if not found.",
    promptSnippet: "Read a backend-native Kata artifact document by title from the given scope.",
    parameters: Type.Object({
      title: Type.String({ description: "Document title to look up, e.g. 'M001-ROADMAP'" }),
      projectId: Type.Optional(Type.String({ description: "Project identifier for project-scoped artifacts" })),
      issueId: Type.Optional(Type.String({ description: "Issue identifier for issue-scoped artifacts" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Line number to start reading from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of content lines to read" })),
    }),
    async execute(_id, params) {
      const hasProject = params.projectId !== undefined;
      const hasIssue = params.issueId !== undefined;
      if (hasProject === hasIssue) {
        return fail(new Error("Exactly one of projectId or issueId is required"));
      }
      return withBackend(createBackendImpl, async (backend) => {
        const content = await backend.readDocument(
          params.title,
          hasProject ? { projectId: params.projectId! } : { issueId: params.issueId! },
        );
        if (content === null) return null;

        return renderCompactRead({
          heading: `Document ${params.title}`,
          metadata: [
            `scope: ${hasProject ? `project:${params.projectId}` : `issue:${params.issueId}`}`,
          ],
          bodyLabel: "content",
          body: content,
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
      "List backend-native Kata artifact document inventory for the given scope. Document content is omitted from list output.",
    promptSnippet: "List backend-native Kata artifact document inventory for the given scope.",
    parameters: Type.Object({
      projectId: Type.Optional(Type.String({ description: "Project identifier for project-scoped artifacts" })),
      issueId: Type.Optional(Type.String({ description: "Issue identifier for issue-scoped artifacts" })),
      first: Type.Optional(Type.Number({ description: "Backward-compatible paging hint (ignored by backend-native dispatch)" })),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      const hasProject = params.projectId !== undefined;
      const hasIssue = params.issueId !== undefined;
      if (hasProject === hasIssue) {
        return fail(new Error("Exactly one of projectId or issueId is required"));
      }
      return withBackend(createBackendImpl, async (backend) => {
        const docs = await backend.listDocuments(
          hasProject ? { projectId: params.projectId! } : { issueId: params.issueId! },
        );
        return renderInventoryResult({
          noun: "documents",
          items: docs,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Document contents omitted from list output. Use kata_read_document to read one document.",
          renderItem: (title, index) => `${index}. ${title}`,
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_list_milestones",
    label: "Kata: List Milestones",
    description: "List backend-native Kata milestones for the active project.",
    promptSnippet: "List backend-native Kata milestones for the active project.",
    parameters: Type.Object({
      projectId: Type.String({ description: "Project UUID in Linear mode (ignored in GitHub mode)" }),
      offset: Type.Optional(Type.Integer({ minimum: 1, description: "Item number to start from (1-indexed)" })),
      limit: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum number of items to return" })),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const milestones = await backend.listMilestones();
        return renderInventoryResult({
          noun: "milestones",
          items: milestones,
          offset: params.offset,
          limit: params.limit,
          omittedFieldsNote: "Large fields omitted from list output. Use backend-native milestone reads to inspect one milestone.",
          renderItem: (milestone, index) => [
            `${index}. ${milestone.name}`,
            `   id: ${milestone.id}`,
            `   targetDate: ${milestone.targetDate ?? "—"}`,
            `   updatedAt: ${milestone.updatedAt ?? "—"}`,
          ].join("\n"),
        });
      });
    },
  });

  pi.registerTool({
    name: "kata_derive_state",
    label: "Kata: Derive State",
    description: "Derive a full KataState from the configured workflow backend.",
    promptSnippet: "Derive a full KataState from the configured workflow backend.",
    parameters: Type.Object({}),
    async execute() {
      return withBackend(createBackendImpl, async (backend) => {
        const state = await backend.deriveState();
        return {
          ...state,
          workflowMode: backend.isLinearMode ? "linear" : "github",
        };
      });
    },
  });

  pi.registerTool({
    name: "kata_update_issue_state",
    label: "Kata: Update Issue State",
    description:
      "Advance a backend-native Kata issue to the workflow state corresponding to the given Kata phase.",
    promptSnippet: "Advance a backend-native Kata issue to the workflow state corresponding to the given Kata phase.",
    parameters: Type.Object({
      issueId: Type.String({ description: "Backend issue identifier" }),
      phase: Type.Union([
        Type.Literal("backlog"),
        Type.Literal("planning"),
        Type.Literal("executing"),
        Type.Literal("verifying"),
        Type.Literal("done"),
      ], { description: "Kata phase to advance the issue to" }),
      teamId: Type.Optional(Type.String({ description: "Team UUID override in Linear mode (ignored in GitHub mode)" })),
    }),
    async execute(_id, params) {
      return withBackend(createBackendImpl, async (backend) => {
        const result = await backend.updateIssueState(params.issueId, params.phase, params.teamId);
        return renderMutationSummary({
          noun: "Issue state",
          action: "updated",
          lines: [
            `issueId: ${result.issueId}`,
            `identifier: ${result.identifier ?? "—"}`,
            `phase: ${result.phase}`,
            ...(result.stateId ? [`stateId: ${result.stateId}`] : []),
            `state: ${result.state}`,
          ],
        });
      });
    },
  });
}
