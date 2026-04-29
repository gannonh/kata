import type {
  KataArtifact,
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataOpenPullRequestInput,
  KataProjectUpsertInput,
  KataProjectSnapshot,
  KataProjectSnapshotArtifact,
  KataProjectSnapshotNextAction,
  KataProjectSnapshotSlice,
  KataSliceCreateInput,
  KataSliceListInput,
  KataSliceUpdateStatusInput,
  KataTaskCreateInput,
  KataTaskListInput,
  KataTaskUpdateStatusInput,
} from "./types.js";

export function createKataDomainApi(adapter: KataBackendAdapter) {
  return {
    project: {
      getContext: () => adapter.getProjectContext(),
      upsert: (input: KataProjectUpsertInput) => adapter.upsertProject(input),
      getSnapshot: () => getProjectSnapshot(adapter),
    },
    milestone: {
      list: () => adapter.listMilestones(),
      getActive: () => adapter.getActiveMilestone(),
      create: (input: KataMilestoneCreateInput) => adapter.createMilestone(input),
      complete: (input: KataMilestoneCompleteInput) => adapter.completeMilestone(input),
    },
    slice: {
      list: (input: KataSliceListInput) => adapter.listSlices(input),
      create: (input: KataSliceCreateInput) => adapter.createSlice(input),
      updateStatus: (input: KataSliceUpdateStatusInput) => adapter.updateSliceStatus(input),
    },
    task: {
      list: (input: KataTaskListInput) => adapter.listTasks(input),
      create: (input: KataTaskCreateInput) => adapter.createTask(input),
      updateStatus: (input: KataTaskUpdateStatusInput) => adapter.updateTaskStatus(input),
    },
    artifact: {
      list: (input: KataArtifactListInput) => adapter.listArtifacts(input),
      read: (input: KataArtifactReadInput) => adapter.readArtifact(input),
      write: (input: KataArtifactWriteInput) => adapter.writeArtifact(input),
    },
    pr: {
      open: (input: KataOpenPullRequestInput) => adapter.openPullRequest(input),
    },
    execution: {
      getStatus: () => adapter.getExecutionStatus(),
    },
    health: {
      check: () => adapter.checkHealth(),
    },
  };
}

async function getProjectSnapshot(adapter: KataBackendAdapter): Promise<KataProjectSnapshot> {
  const context = await adapter.getProjectContext();
  const activeMilestone = await adapter.getActiveMilestone();

  if (!activeMilestone) {
    return {
      context,
      activeMilestone: null,
      milestoneArtifacts: [],
      requirements: {
        requiredIds: [],
        coveredIds: [],
        missingIds: [],
      },
      roadmap: {
        plannedSliceIds: [],
        existingSliceIds: [],
        missingSliceIds: [],
      },
      slices: [],
      readiness: {
        hasActiveMilestone: false,
        allRoadmapSlicesExist: false,
        allSlicesDone: false,
        allTasksDone: false,
        allTasksVerified: false,
        milestoneCompletable: false,
      },
      nextAction: {
        workflow: "kata-new-milestone",
        reason: "No active milestone exists.",
      },
      otherActions: [],
    };
  }

  const [milestoneArtifacts, requirementsArtifact, roadmapArtifact, slices] = await Promise.all([
    safeListArtifacts(adapter, { scopeType: "milestone", scopeId: activeMilestone.id }),
    safeReadArtifact(adapter, { scopeType: "milestone", scopeId: activeMilestone.id, artifactType: "requirements" }),
    safeReadArtifact(adapter, { scopeType: "milestone", scopeId: activeMilestone.id, artifactType: "roadmap" }),
    adapter.listSlices({ milestoneId: activeMilestone.id }),
  ]);

  const snapshotSlices = await Promise.all(
    slices.map(async (slice): Promise<KataProjectSnapshotSlice> => {
      const [tasks, sliceArtifacts] = await Promise.all([
        adapter.listTasks({ sliceId: slice.id }),
        safeListArtifacts(adapter, { scopeType: "slice", scopeId: slice.id }),
      ]);

      const snapshotTasks = await Promise.all(
        tasks.map(async (task) => {
          const taskArtifacts = await safeListArtifacts(adapter, { scopeType: "task", scopeId: task.id });
          return {
            ...task,
            artifacts: summarizeArtifacts(taskArtifacts),
            requirementIds: uniqueIds([
              ...extractRequirementIds(task.title),
              ...extractRequirementIds(task.description),
              ...taskArtifacts.flatMap((artifact) => extractRequirementIds(artifact.content)),
            ]),
          };
        }),
      );

      return {
        ...slice,
        tasks: snapshotTasks,
        artifacts: summarizeArtifacts(sliceArtifacts),
        requirementIds: uniqueIds([
          ...extractRequirementIds(slice.title),
          ...extractRequirementIds(slice.goal),
          ...sliceArtifacts.flatMap((artifact) => extractRequirementIds(artifact.content)),
          ...snapshotTasks.flatMap((task) => task.requirementIds),
        ]),
      };
    }),
  );

  const roadmapContent = roadmapArtifact?.content ?? "";
  const requirementsContent = requirementsArtifact?.content ?? "";
  const requiredIds = uniqueIds([...extractRequirementIds(requirementsContent), ...extractRequirementIds(roadmapContent)]);
  const coveredIds = uniqueIds(snapshotSlices.flatMap((slice) => slice.requirementIds));
  const missingIds = requiredIds.filter((id) => !coveredIds.includes(id));
  const plannedSliceIds = uniqueIds(extractSliceIds(roadmapContent));
  const existingSliceIds = snapshotSlices.map((slice) => slice.id);
  const missingSliceIds = plannedSliceIds.filter((id) => !existingSliceIds.includes(id));

  const readiness = {
    hasActiveMilestone: true,
    allRoadmapSlicesExist: missingSliceIds.length === 0,
    allSlicesDone: snapshotSlices.length > 0 && snapshotSlices.every((slice) => slice.status === "done"),
    allTasksDone: snapshotSlices.length > 0 && snapshotSlices.every((slice) => slice.tasks.every((task) => task.status === "done")),
    allTasksVerified:
      snapshotSlices.length > 0 &&
      snapshotSlices.every((slice) => slice.tasks.every((task) => task.verificationState === "verified")),
    milestoneCompletable: false,
  };
  readiness.milestoneCompletable =
    readiness.allRoadmapSlicesExist &&
    readiness.allSlicesDone &&
    readiness.allTasksDone &&
    readiness.allTasksVerified &&
    missingIds.length === 0;

  const nextAction = determineNextAction(activeMilestone.id, snapshotSlices, missingSliceIds, missingIds, readiness);

  return {
    context,
    activeMilestone,
    milestoneArtifacts: summarizeArtifacts(milestoneArtifacts),
    requirements: {
      requiredIds,
      coveredIds,
      missingIds,
    },
    roadmap: {
      plannedSliceIds,
      existingSliceIds,
      missingSliceIds,
    },
    slices: snapshotSlices,
    readiness,
    nextAction,
    otherActions: determineOtherActions(activeMilestone.id, snapshotSlices, missingSliceIds, missingIds, readiness, nextAction),
  };
}

async function safeListArtifacts(
  adapter: KataBackendAdapter,
  input: KataArtifactListInput,
): Promise<KataArtifact[]> {
  try {
    return await adapter.listArtifacts(input);
  } catch {
    return [];
  }
}

async function safeReadArtifact(
  adapter: KataBackendAdapter,
  input: KataArtifactReadInput,
): Promise<KataArtifact | null> {
  try {
    return await adapter.readArtifact(input);
  } catch {
    return null;
  }
}

function summarizeArtifacts(artifacts: KataArtifact[]): KataProjectSnapshotArtifact[] {
  return artifacts.map((artifact) => ({
    artifactType: artifact.artifactType,
    title: artifact.title,
    updatedAt: artifact.updatedAt,
    provenance: artifact.provenance,
    requirementIds: extractRequirementIds(artifact.content),
  }));
}

function determineNextAction(
  milestoneId: string,
  slices: KataProjectSnapshotSlice[],
  missingSliceIds: string[],
  missingRequirementIds: string[],
  readiness: KataProjectSnapshot["readiness"],
): KataProjectSnapshotNextAction {
  const executableSlice = slices.find((slice) => slice.status !== "done" || slice.tasks.some((task) => task.status !== "done"));
  if (executableSlice) {
    return {
      workflow: "kata-execute-phase",
      reason: `Slice ${executableSlice.id} still has execution work remaining.`,
      target: { milestoneId, sliceId: executableSlice.id },
    };
  }

  const unverifiedTask = slices.flatMap((slice) => slice.tasks).find((task) => task.verificationState !== "verified");
  if (unverifiedTask) {
    return {
      workflow: "kata-verify-work",
      reason: `Task ${unverifiedTask.id} is done but not verified.`,
      target: { milestoneId, sliceId: unverifiedTask.sliceId, taskId: unverifiedTask.id },
    };
  }

  if (missingSliceIds.length > 0) {
    return {
      workflow: "kata-plan-phase",
      reason: `Roadmap slice ${missingSliceIds[0]} is not represented in backend state.`,
      target: { milestoneId, sliceId: missingSliceIds[0] },
    };
  }

  if (missingRequirementIds.length > 0) {
    return {
      workflow: "kata-plan-phase",
      reason: `Requirement ${missingRequirementIds[0]} is not covered by completed milestone evidence.`,
      target: { milestoneId, requirementId: missingRequirementIds[0] },
    };
  }

  if (readiness.milestoneCompletable) {
    return {
      workflow: "kata-complete-milestone",
      reason: "All roadmap slices exist, all slices and tasks are done, and all tasks are verified.",
      target: { milestoneId },
    };
  }

  return {
    workflow: "kata-plan-phase",
    reason: "Milestone state is incomplete and needs additional planning before completion.",
    target: { milestoneId },
  };
}

function determineOtherActions(
  milestoneId: string,
  slices: KataProjectSnapshotSlice[],
  missingSliceIds: string[],
  missingRequirementIds: string[],
  readiness: KataProjectSnapshot["readiness"],
  nextAction: KataProjectSnapshotNextAction,
): KataProjectSnapshotNextAction[] {
  const actions: KataProjectSnapshotNextAction[] = [];

  for (const slice of slices) {
    if (slice.status === "done" && slice.tasks.every((task) => task.status === "done")) continue;
    actions.push({
      workflow: "kata-execute-phase",
      reason: `Slice ${slice.id} has execution work remaining and can be explicitly selected.`,
      target: { milestoneId, sliceId: slice.id },
    });
  }

  for (const task of slices.flatMap((slice) => slice.tasks)) {
    if (task.status !== "done" || task.verificationState === "verified") continue;
    actions.push({
      workflow: "kata-verify-work",
      reason: `Task ${task.id} is done but not verified and can be explicitly verified.`,
      target: { milestoneId, sliceId: task.sliceId, taskId: task.id },
    });
  }

  for (const sliceId of missingSliceIds) {
    actions.push({
      workflow: "kata-plan-phase",
      reason: `Roadmap slice ${sliceId} is not represented in backend state and can be explicitly planned.`,
      target: { milestoneId, sliceId },
    });
  }

  for (const requirementId of missingRequirementIds) {
    actions.push({
      workflow: "kata-plan-phase",
      reason: `Requirement ${requirementId} is not covered by completed milestone evidence and can be explicitly planned.`,
      target: { milestoneId, requirementId },
    });
  }

  if (readiness.milestoneCompletable) {
    actions.push({
      workflow: "kata-complete-milestone",
      reason: "Milestone is completable and can be explicitly closed.",
      target: { milestoneId },
    });
  }

  return dedupeActions(actions).filter((action) => !sameAction(action, nextAction));
}

function extractRequirementIds(content: string): string[] {
  return uniqueIds(content.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? []);
}

function extractSliceIds(content: string): string[] {
  return uniqueIds(content.match(/\bS\d+\b/g) ?? []);
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function dedupeActions(actions: KataProjectSnapshotNextAction[]): KataProjectSnapshotNextAction[] {
  const seen = new Set<string>();
  const deduped: KataProjectSnapshotNextAction[] = [];
  for (const action of actions) {
    const key = actionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
}

function sameAction(left: KataProjectSnapshotNextAction, right: KataProjectSnapshotNextAction): boolean {
  return actionKey(left) === actionKey(right);
}

function actionKey(action: KataProjectSnapshotNextAction): string {
  return [
    action.workflow,
    action.target?.milestoneId ?? "",
    action.target?.sliceId ?? "",
    action.target?.taskId ?? "",
    action.target?.requirementId ?? "",
  ].join(":");
}
