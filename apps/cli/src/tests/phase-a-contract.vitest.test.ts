import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runCall } from "../commands/call.js";
import { dispatchKataOperation, KATA_OPERATION_NAMES } from "../domain/operations.js";
import { createKataDomainApi } from "../domain/service.js";
import { runJsonCommand } from "../transports/json.js";
import type {
  KataArtifact,
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataExecutionStatus,
  KataIssueCreateInput,
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataOpenPullRequestInput,
  KataProjectSnapshot,
  KataProjectUpsertInput,
  KataSliceCreateInput,
  KataSliceListInput,
  KataSliceUpdateStatusInput,
  KataTaskCreateInput,
  KataTaskListInput,
  KataTaskUpdateStatusInput,
} from "../domain/types.js";

const workspacePath = "/tmp/kata";
const payloadRequiredCallOperations = [
  "project.upsert",
  "milestone.create",
  "milestone.complete",
  "slice.list",
  "slice.create",
  "slice.updateStatus",
  "task.list",
  "task.create",
  "task.updateStatus",
  "issue.create",
  "artifact.list",
  "artifact.read",
  "artifact.write",
];

async function withTempFile(content: string, run: (filePath: string) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "kata-cli-test-"));
  const filePath = path.join(directory, "request.json");

  try {
    await writeFile(filePath, content, "utf8");
    await run(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createFakeAdapter(): KataBackendAdapter {
  const artifact: KataArtifact = {
    id: "artifact-1",
    scopeType: "project",
    scopeId: "project-1",
    artifactType: "project-brief",
    title: "Project Brief",
    content: "# Brief",
    format: "markdown",
    updatedAt: "2026-04-28T00:00:00.000Z",
    provenance: {
      backend: "github",
      backendId: "artifact-1",
    },
  };

  return {
    getProjectContext: async () => ({
      backend: "github",
      workspacePath,
      repository: {
        owner: "kata",
        name: "repo",
      },
    }),
    upsertProject: async (input: KataProjectUpsertInput) => ({
      backend: "github",
      workspacePath,
      title: input.title,
      description: input.description,
      repository: {
        owner: "kata",
        name: "repo",
      },
    }),
    listMilestones: async () => [],
    getActiveMilestone: async () => null,
    createMilestone: async (input: KataMilestoneCreateInput) => ({
      id: "milestone-1",
      title: input.title,
      goal: input.goal,
      status: "active",
      active: true,
    }),
    completeMilestone: async (input: KataMilestoneCompleteInput) => ({
      id: input.milestoneId,
      title: "Completed Milestone",
      goal: input.summary,
      status: "done",
      active: false,
    }),
    listSlices: async (_input: KataSliceListInput) => [],
    createSlice: async (input: KataSliceCreateInput) => ({
      id: "slice-1",
      milestoneId: input.milestoneId,
      title: input.title,
      goal: input.goal,
      status: "backlog",
      order: input.order ?? 0,
    }),
    updateSliceStatus: async (input: KataSliceUpdateStatusInput) => ({
      id: input.sliceId,
      milestoneId: "milestone-1",
      title: "Slice",
      goal: "Slice goal",
      status: input.status,
      order: 0,
    }),
    listTasks: async (_input: KataTaskListInput) => [],
    createTask: async (input: KataTaskCreateInput) => ({
      id: "task-1",
      sliceId: input.sliceId,
      title: input.title,
      description: input.description,
      status: "backlog",
      verificationState: "pending",
    }),
    updateTaskStatus: async (input: KataTaskUpdateStatusInput) => ({
      id: input.taskId,
      sliceId: "slice-1",
      title: "Task",
      description: "Task description",
      status: input.status,
      verificationState: input.verificationState ?? "pending",
    }),
    createIssue: async (input: KataIssueCreateInput) => ({
      id: "issue-1",
      title: input.title,
      body: `# Design\n\n${input.design}\n\n# Plan\n\n${input.plan}`,
      status: "backlog",
      url: "https://github.com/kata/repo/issues/1",
    }),
    listArtifacts: async (_input: KataArtifactListInput) => [artifact],
    readArtifact: async (_input: KataArtifactReadInput) => artifact,
    writeArtifact: async (input: KataArtifactWriteInput) => ({
      ...artifact,
      ...input,
    }),
    openPullRequest: async (input: KataOpenPullRequestInput) => ({
      id: "pr-1",
      url: "https://github.com/kata/repo/pull/1",
      branch: input.head,
      base: input.base,
      status: "open",
      mergeReady: false,
    }),
    getExecutionStatus: async (): Promise<KataExecutionStatus> => ({
      queueDepth: 0,
      activeWorkers: 0,
      escalations: [],
    }),
    checkHealth: async () => ({
      ok: true,
      backend: "github",
      checks: [
        {
          name: "github",
          status: "ok",
          message: "GitHub backend is reachable",
        },
      ],
    }),
  };
}

function createAdapter(): KataBackendAdapter {
  return {
    ...createFakeAdapter(),
    createMilestone: async (input: KataMilestoneCreateInput) => ({
      id: input.title,
      title: input.title,
      goal: input.goal,
      status: "active",
      active: true,
    }),
  };
}

describe("Phase A domain contract", () => {
  it("defines the expected operation names in order", () => {
    expect(KATA_OPERATION_NAMES).toEqual([
      "project.getContext",
      "project.getSnapshot",
      "project.upsert",
      "milestone.list",
      "milestone.getActive",
      "milestone.create",
      "milestone.complete",
      "slice.list",
      "slice.create",
      "slice.updateStatus",
      "task.list",
      "task.create",
      "task.updateStatus",
      "issue.create",
      "artifact.list",
      "artifact.read",
      "artifact.write",
      "execution.getStatus",
      "health.check",
    ]);
  });

  it("dispatches create operations through the domain API", async () => {
    const api = createKataDomainApi(createFakeAdapter());

    await expect(
      dispatchKataOperation(api, "project.upsert", {
        title: "Kata",
        description: "Real backend",
      }),
    ).resolves.toMatchObject({
      backend: "github",
      title: "Kata",
      description: "Real backend",
    });

    await expect(
      dispatchKataOperation(api, "milestone.create", {
        title: "Phase A",
        goal: "Expand contract",
      }),
    ).resolves.toMatchObject({
      id: "milestone-1",
      status: "active",
      active: true,
    });

    await expect(
      dispatchKataOperation(api, "slice.create", {
        milestoneId: "milestone-1",
        title: "Contract",
        goal: "Define operations",
        order: 2,
      }),
    ).resolves.toMatchObject({
      id: "slice-1",
      milestoneId: "milestone-1",
      status: "backlog",
      order: 2,
    });

    await expect(
      dispatchKataOperation(api, "task.create", {
        sliceId: "slice-1",
        title: "Write test",
        description: "Add Phase A contract test",
      }),
    ).resolves.toMatchObject({
      id: "task-1",
      status: "backlog",
      verificationState: "pending",
    });

    await expect(
      dispatchKataOperation(api, "issue.create", {
        title: "Plan standalone fix",
        design: "## Problem\n\nA one-off fix needs design.",
        plan: "## Tasks\n\n- [ ] Implement the fix.",
      }),
    ).resolves.toMatchObject({
      id: "issue-1",
      status: "backlog",
      body: expect.stringContaining("# Design"),
    });
  });

  it("builds a project snapshot with a concrete next action", async () => {
    const api = createKataDomainApi({
      ...createFakeAdapter(),
      getActiveMilestone: async () => ({
        id: "M001",
        title: "Phase A",
        goal: "Validate end to end",
        status: "active",
        active: true,
      }),
      listSlices: async () => [
        {
          id: "S001",
          milestoneId: "M001",
          title: "Initialization",
          goal: "Cover E2E-01",
          status: "done",
          order: 0,
        },
      ],
      listTasks: async () => [
        {
          id: "T001",
          sliceId: "S001",
          title: "Verify initialization",
          description: "Covers E2E-01",
          status: "done",
          verificationState: "verified",
        },
      ],
      listArtifacts: async (input: KataArtifactListInput) => [
        {
          id: `${input.scopeType}:${input.scopeId}:summary`,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          artifactType: "summary",
          title: "Summary",
          content: "Covered E2E-01",
          format: "markdown",
          updatedAt: "2026-04-28T00:00:00.000Z",
          provenance: { backend: "github", backendId: "comment:1" },
        },
      ],
      readArtifact: async (input: KataArtifactReadInput) => ({
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.artifactType,
        content: input.artifactType === "roadmap"
          ? "Backend Slice: S001 covers E2E-01\nBackend Slice: S002 covers E2E-02"
          : "E2E-01\nE2E-02",
        format: "markdown",
        updatedAt: "2026-04-28T00:00:00.000Z",
        provenance: { backend: "github", backendId: "comment:2" },
      }),
    });

    await expect(dispatchKataOperation(api, "project.getSnapshot")).resolves.toMatchObject({
      activeMilestone: { id: "M001" },
      roadmap: {
        plannedSliceIds: ["S001", "S002"],
        existingSliceIds: ["S001"],
        missingSliceIds: ["S002"],
        requirementToSliceIds: {
          "E2E-01": ["S001"],
          "E2E-02": ["S002"],
        },
      },
      requirements: {
        requiredIds: ["E2E-01", "E2E-02"],
        coveredIds: ["E2E-01"],
        missingIds: ["E2E-02"],
        futureIds: [],
      },
      nextAction: {
        workflow: "kata-plan-phase",
        target: { sliceId: "S002" },
      },
    });
  });

  it("does not treat milestone roadmap planned-slice labels as backend slice ids", async () => {
    const api = createKataDomainApi({
      ...createFakeAdapter(),
      getActiveMilestone: async () => ({
        id: "M002",
        title: "Symphony Migration",
        goal: "Validate global slice sequencing",
        status: "active",
        active: true,
      }),
      listSlices: async () => [
        {
          id: "S005",
          milestoneId: "M002",
          title: "Map Symphony migration baseline",
          goal: "Cover SYM-03 and SYM-08",
          status: "backlog",
          order: 1,
        },
      ],
      listTasks: async () => [],
      listArtifacts: async (input: KataArtifactListInput) =>
        input.scopeType === "slice"
          ? [
              {
                id: `${input.scopeType}:${input.scopeId}:plan`,
                scopeType: input.scopeType,
                scopeId: input.scopeId,
                artifactType: "plan",
                title: "Plan",
                content: "Covers SYM-03 and SYM-08",
                format: "markdown",
                updatedAt: "2026-04-29T00:00:00.000Z",
                provenance: { backend: "github", backendId: "comment:1" },
              },
            ]
          : [],
      readArtifact: async (input: KataArtifactReadInput) => ({
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.artifactType,
        content: input.artifactType === "roadmap"
          ? [
              "## Planned Slices",
              "- [ ] S001: Map Symphony migration baseline",
              "",
              "| Requirement | Phase/Planned Slice | Status |",
              "|---|---|---|",
              "| SYM-03 | Phase 1 / S001 | Pending |",
              "| SYM-08 | Phase 1 / S001 | Pending |",
            ].join("\n")
          : "SYM-03\nSYM-08",
        format: "markdown",
        updatedAt: "2026-04-29T00:00:00.000Z",
        provenance: { backend: "github", backendId: "comment:2" },
      }),
    });

    await expect(dispatchKataOperation(api, "project.getSnapshot")).resolves.toMatchObject({
      roadmap: {
        plannedSliceIds: [],
        existingSliceIds: ["S005"],
        missingSliceIds: [],
        requirementToSliceIds: {},
      },
      requirements: {
        coveredIds: ["SYM-03", "SYM-08"],
        missingIds: [],
      },
      nextAction: {
        workflow: "kata-execute-phase",
        reason: "Slice S005 still has execution work remaining.",
        target: { milestoneId: "M002", sliceId: "S005" },
      },
    });
  });

  it("extracts backend slice ids from structured roadmap table columns", async () => {
    const api = createKataDomainApi({
      ...createFakeAdapter(),
      getActiveMilestone: async () => ({
        id: "M003",
        title: "Structured Roadmap",
        goal: "Validate backend slice table extraction",
        status: "active",
        active: true,
      }),
      listSlices: async () => [
        {
          id: "S012",
          milestoneId: "M003",
          title: "Build the first path",
          goal: "Cover REQ-01",
          status: "done",
          order: 1,
        },
      ],
      listTasks: async () => [],
      listArtifacts: async () => [],
      readArtifact: async (input: KataArtifactReadInput) => ({
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.artifactType,
        content: input.artifactType === "roadmap"
          ? [
              "| Requirement | Backend Slice ID | Status |",
              "|---|---|---|",
              "| REQ-01 | S012 | Done |",
              "| REQ-02 | S013 | Pending |",
            ].join("\n")
          : "REQ-01\nREQ-02",
        format: "markdown",
        updatedAt: "2026-04-29T00:00:00.000Z",
        provenance: { backend: "github", backendId: "comment:3" },
      }),
    });

    await expect(dispatchKataOperation(api, "project.getSnapshot")).resolves.toMatchObject({
      roadmap: {
        plannedSliceIds: ["S012", "S013"],
        existingSliceIds: ["S012"],
        missingSliceIds: ["S013"],
        requirementToSliceIds: {
          "REQ-01": ["S012"],
          "REQ-02": ["S013"],
        },
      },
      requirements: {
        coveredIds: ["REQ-01"],
        missingIds: ["REQ-02"],
      },
      nextAction: {
        workflow: "kata-plan-phase",
        target: { sliceId: "S013" },
      },
    });
  });

  it("prioritizes executing existing planned slices before planning later roadmap slices", async () => {
    const api = createKataDomainApi({
      ...createFakeAdapter(),
      getActiveMilestone: async () => ({
        id: "M001",
        title: "Phase A",
        goal: "Validate end to end",
        status: "active",
        active: true,
      }),
      listSlices: async () => [
        {
          id: "S001",
          milestoneId: "M001",
          title: "Initialization",
          goal: "Cover E2E-01",
          status: "done",
          order: 0,
        },
        {
          id: "S003",
          milestoneId: "M001",
          title: "Execution handoff",
          goal: "Cover E2E-06",
          status: "backlog",
          order: 2,
        },
      ],
      listTasks: async (input: KataTaskListInput) =>
        input.sliceId === "S003"
          ? [
              {
                id: "T007",
                sliceId: "S003",
                title: "Validate execute-phase selects approved work",
                description: "Covers E2E-06",
                status: "backlog",
                verificationState: "pending",
              },
            ]
          : [
              {
                id: "T001",
                sliceId: "S001",
                title: "Verify initialization",
                description: "Covers E2E-01",
                status: "done",
                verificationState: "verified",
              },
            ],
      listArtifacts: async (input: KataArtifactListInput) => [
        {
          id: `${input.scopeType}:${input.scopeId}:summary`,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          artifactType: "summary",
          title: "Summary",
          content: input.scopeId === "S003" ? "Covers E2E-06" : "Covered E2E-01",
          format: "markdown",
          updatedAt: "2026-04-28T00:00:00.000Z",
          provenance: { backend: "github", backendId: "comment:1" },
        },
      ],
      readArtifact: async (input: KataArtifactReadInput) => ({
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.artifactType,
        content: input.artifactType === "roadmap"
          ? "Backend Slice: S001 covers E2E-01\nBackend Slice: S003 covers E2E-06\nBackend Slice: S004 covers E2E-10"
          : "E2E-01\nE2E-06\nE2E-10",
        format: "markdown",
        updatedAt: "2026-04-28T00:00:00.000Z",
        provenance: { backend: "github", backendId: "comment:2" },
      }),
    });

    await expect(dispatchKataOperation(api, "project.getSnapshot")).resolves.toMatchObject({
      roadmap: {
        missingSliceIds: ["S004"],
        requirementToSliceIds: {
          "E2E-01": ["S001"],
          "E2E-06": ["S003"],
          "E2E-10": ["S004"],
        },
      },
      nextAction: {
        workflow: "kata-execute-phase",
        reason: "Slice S003 still has execution work remaining.",
        target: { milestoneId: "M001", sliceId: "S003" },
      },
      otherActions: [
        {
          workflow: "kata-plan-phase",
          target: { milestoneId: "M001", sliceId: "S004" },
        },
      ],
    });
  });

  it("prioritizes verifying a completed slice before executing the next slice", async () => {
    const api = createKataDomainApi({
      ...createFakeAdapter(),
      getActiveMilestone: async () => ({
        id: "M001",
        title: "Phase A",
        goal: "Validate end to end",
        status: "active",
        active: true,
      }),
      listSlices: async () => [
        {
          id: "S003",
          milestoneId: "M001",
          title: "Execution handoff",
          goal: "Cover E2E-06",
          status: "done",
          order: 2,
        },
        {
          id: "S004",
          milestoneId: "M001",
          title: "Completion",
          goal: "Cover E2E-08",
          status: "backlog",
          order: 3,
        },
      ],
      listTasks: async (input: KataTaskListInput) =>
        input.sliceId === "S003"
          ? [
              {
                id: "T007",
                sliceId: "S003",
                title: "Validate execute-phase selects approved work",
                description: "Covers E2E-06",
                status: "done",
                verificationState: "pending",
              },
              {
                id: "T008",
                sliceId: "S003",
                title: "Validate execute-phase records progress",
                description: "Covers E2E-06",
                status: "done",
                verificationState: "pending",
              },
            ]
          : [
              {
                id: "T010",
                sliceId: "S004",
                title: "Validate completion preconditions",
                description: "Covers E2E-08",
                status: "backlog",
                verificationState: "pending",
              },
            ],
      listArtifacts: async (input: KataArtifactListInput) => [
        {
          id: `${input.scopeType}:${input.scopeId}:summary`,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          artifactType: "summary",
          title: "Summary",
          content: input.scopeId === "S003" ? "Covers E2E-06" : "Covers E2E-08",
          format: "markdown",
          updatedAt: "2026-04-28T00:00:00.000Z",
          provenance: { backend: "github", backendId: "comment:1" },
        },
      ],
      readArtifact: async (input: KataArtifactReadInput) => ({
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.artifactType,
        content: input.artifactType === "roadmap"
          ? "Backend Slice: S003 covers E2E-06\nBackend Slice: S004 covers E2E-08"
          : "E2E-06\nE2E-08",
        format: "markdown",
        updatedAt: "2026-04-28T00:00:00.000Z",
        provenance: { backend: "github", backendId: "comment:2" },
      }),
    });

    const snapshot = await dispatchKataOperation(api, "project.getSnapshot") as KataProjectSnapshot;

    expect(snapshot).toMatchObject({
      nextAction: {
        workflow: "kata-verify-work",
        reason: "Slice S003 is done but has tasks awaiting verification.",
        target: { milestoneId: "M001", sliceId: "S003" },
      },
    });
    expect(snapshot.otherActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        workflow: "kata-verify-work",
        target: { milestoneId: "M001", sliceId: "S003", taskId: "T007" },
      }),
      expect.objectContaining({
        workflow: "kata-verify-work",
        target: { milestoneId: "M001", sliceId: "S003", taskId: "T008" },
      }),
      expect.objectContaining({
        workflow: "kata-execute-phase",
        target: { milestoneId: "M001", sliceId: "S004" },
      }),
    ]));
  });

  it("surfaces requirement planning only when no roadmap slice maps to the requirement", async () => {
    const api = createKataDomainApi({
      ...createFakeAdapter(),
      getActiveMilestone: async () => ({
        id: "M001",
        title: "Phase A",
        goal: "Validate end to end",
        status: "active",
        active: true,
      }),
      listSlices: async () => [
        {
          id: "S001",
          milestoneId: "M001",
          title: "Initialization",
          goal: "Cover E2E-01",
          status: "done",
          order: 0,
        },
        {
          id: "S003",
          milestoneId: "M001",
          title: "Execution handoff",
          goal: "Cover E2E-06",
          status: "backlog",
          order: 2,
        },
      ],
      listTasks: async (input: KataTaskListInput) =>
        input.sliceId === "S003"
          ? [
              {
                id: "T007",
                sliceId: "S003",
                title: "Validate execute-phase selects approved work",
                description: "Covers E2E-06",
                status: "backlog",
                verificationState: "pending",
              },
            ]
          : [
              {
                id: "T001",
                sliceId: "S001",
                title: "Verify initialization",
                description: "Covers E2E-01",
                status: "done",
                verificationState: "verified",
              },
            ],
      listArtifacts: async (input: KataArtifactListInput) => [
        {
          id: `${input.scopeType}:${input.scopeId}:summary`,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          artifactType: "summary",
          title: "Summary",
          content: input.scopeId === "S003" ? "Covers E2E-06" : "Covered E2E-01",
          format: "markdown",
          updatedAt: "2026-04-28T00:00:00.000Z",
          provenance: { backend: "github", backendId: "comment:1" },
        },
      ],
      readArtifact: async (input: KataArtifactReadInput) => ({
        id: `${input.scopeType}:${input.scopeId}:${input.artifactType}`,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        artifactType: input.artifactType,
        title: input.artifactType,
        content: input.artifactType === "roadmap"
          ? "Backend Slice: S001 covers E2E-01\nBackend Slice: S004 covers E2E-10\nFuture note mentions FUT-01"
          : [
              "## Active Requirements",
              "E2E-01",
              "E2E-06",
              "E2E-10",
              "",
              "## Future Requirements",
              "",
              "### Post-Phase-A Hardening",
              "FUT-01",
            ].join("\n"),
        format: "markdown",
        updatedAt: "2026-04-28T00:00:00.000Z",
        provenance: { backend: "github", backendId: "comment:2" },
      }),
    });

    await expect(dispatchKataOperation(api, "project.getSnapshot")).resolves.toMatchObject({
      roadmap: {
        requirementToSliceIds: {
          "E2E-01": ["S001"],
          "E2E-10": ["S004"],
        },
      },
      requirements: {
        requiredIds: ["E2E-01", "E2E-06", "E2E-10"],
        futureIds: ["FUT-01"],
        missingIds: ["E2E-10"],
      },
      otherActions: [
        {
          workflow: "kata-plan-phase",
          target: { milestoneId: "M001", sliceId: "S004" },
        },
      ],
    });
  });
});

describe("Phase A operation transport", () => {
  it("routes new lifecycle operations through runJsonCommand", async () => {
    const api = createKataDomainApi(createAdapter());
    const result = await runJsonCommand(
      {
        operation: "milestone.create",
        payload: { title: "M001", goal: "Ship first milestone" },
      },
      api,
    );

    expect(JSON.parse(result)).toMatchObject({
      ok: true,
      data: { id: "M001", active: true },
    });
  });

  it.each([
    {
      operation: "slice.updateStatus",
      payload: { sliceId: "slice-1", status: "blocked" },
      method: "updateSliceStatus",
    },
    {
      operation: "artifact.write",
      payload: {
        scopeType: "project",
        scopeId: "project-1",
        artifactType: "plan",
        title: "Plan",
        content: "Do the work",
        format: "html",
      },
      method: "writeArtifact",
    },
  ] as const)("rejects invalid $operation payloads before adapter dispatch", async ({ operation, payload, method }) => {
    const adapter = createFakeAdapter();
    const spy = vi.fn(adapter[method]);
    const api = createKataDomainApi({
      ...adapter,
      [method]: spy,
    });

    const result = await runJsonCommand({ operation, payload }, api);

    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects missing slice.list.milestoneId through runJsonCommand before adapter dispatch", async () => {
    const adapter = createFakeAdapter();
    const listSlices = vi.fn(adapter.listSlices);
    const api = createKataDomainApi({
      ...adapter,
      listSlices,
    });

    const result = await runJsonCommand({ operation: "slice.list", payload: {} }, api);

    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(listSlices).not.toHaveBeenCalled();
  });
});

describe("Phase A call command validation", () => {
  it("keeps unknown operations as UNKNOWN errors", async () => {
    const result = await runCall({
      operation: "unknown.operation",
      cwd: workspacePath,
    });

    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: { code: "UNKNOWN" },
    });
  });

  it.each(payloadRequiredCallOperations)("requires an input file for payload operation %s", async (operation) => {
    const result = await runCall({
      operation,
      cwd: workspacePath,
    });

    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("rejects unreadable input files before dispatch", async () => {
    const result = await runCall({
      operation: "milestone.create",
      inputPath: path.join(tmpdir(), "missing-kata-call-input.json"),
      cwd: workspacePath,
    });

    expect(JSON.parse(result)).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("rejects invalid JSON input before dispatch", async () => {
    await withTempFile("{", async (inputPath) => {
      const result = await runCall({
        operation: "milestone.create",
        inputPath,
        cwd: workspacePath,
      });

      expect(JSON.parse(result)).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    });
  });

  it.each(["null", "[]", '"not an object"'])("rejects non-object JSON input %s before dispatch", async (content) => {
    await withTempFile(content, async (inputPath) => {
      const result = await runCall({
        operation: "milestone.create",
        inputPath,
        cwd: workspacePath,
      });

      expect(JSON.parse(result)).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    });
  });

  it("rejects missing slice.list.milestoneId from input files before backend resolution", async () => {
    await withTempFile("{}", async (inputPath) => {
      const result = await runCall({
        operation: "slice.list",
        inputPath,
        cwd: workspacePath,
      });

      expect(JSON.parse(result)).toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    });
  });
});
