import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

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
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataOpenPullRequestInput,
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
      status: "todo",
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
      status: "todo",
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
      status: "todo",
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
      status: "todo",
      verificationState: "pending",
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
});
