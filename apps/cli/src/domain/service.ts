import type {
  KataArtifact,
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataIssueCreateInput,
  KataIssueGetInput,
  KataIssueUpdateStatusInput,
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataOpenPullRequestInput,
  KataProjectUpsertInput,
  KataProjectSnapshot,
  KataProjectSnapshotArtifact,
  KataProjectSnapshotNextAction,
  KataProjectSnapshotSlice,
  KataProjectSnapshotSliceDependencies,
  KataSliceCreateInput,
  KataSliceListInput,
  KataSliceUpdateStatusInput,
  KataTaskCreateInput,
  KataTaskListInput,
  KataTaskUpdateStatusInput,
} from "./types.js";
import { parseSliceDependencyIds } from "./dependencies.js";

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
    issue: {
      create: (input: KataIssueCreateInput) => adapter.createIssue(input),
      listOpen: () => adapter.listOpenIssues(),
      get: (input: KataIssueGetInput) => adapter.getIssue(input),
      updateStatus: (input: KataIssueUpdateStatusInput) => adapter.updateIssueStatus(input),
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
        futureIds: [],
      },
      roadmap: {
        plannedSliceIds: [],
        existingSliceIds: [],
        missingSliceIds: [],
        requirementToSliceIds: {},
        sliceDependencies: {},
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

  const rawSnapshotSlices = await Promise.all(
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
  const requirementScope = extractRequirementScope(requirementsContent);
  const roadmapRequirementScope = extractRequirementScope(roadmapContent);
  const futureIds = uniqueIds([...requirementScope.futureIds, ...roadmapRequirementScope.futureIds]);
  const requiredIds = uniqueIds([...requirementScope.requiredIds, ...roadmapRequirementScope.requiredIds]).filter(
    (id) => !futureIds.includes(id) || requirementScope.requiredIds.includes(id),
  );
  const coveredIds = uniqueIds(rawSnapshotSlices.flatMap((slice) => slice.requirementIds).filter((id) => requiredIds.includes(id)));
  const missingIds = requiredIds.filter((id) => !coveredIds.includes(id));
  const plannedSliceIds = extractRoadmapBackendSliceIds(roadmapContent);
  const existingSliceIds = rawSnapshotSlices.map((slice) => slice.id);
  const missingSliceIds = plannedSliceIds.filter((id) => !existingSliceIds.includes(id));
  const requirementToSliceIds = extractRequirementToSliceIds(roadmapContent);
  const sliceDependencies = mergeSliceDependencyMaps(
    extractRoadmapSliceDependencies(roadmapContent),
    extractBackendSliceDependencies(rawSnapshotSlices),
  );
  const snapshotSlices = mergeSnapshotSliceDependencies(rawSnapshotSlices, sliceDependencies);

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
      futureIds,
    },
    roadmap: {
      plannedSliceIds,
      existingSliceIds,
      missingSliceIds,
      requirementToSliceIds,
      sliceDependencies,
    },
    slices: snapshotSlices,
    readiness,
    nextAction,
    otherActions: determineOtherActions(
      activeMilestone.id,
      snapshotSlices,
      missingSliceIds,
      missingIds,
      requirementToSliceIds,
      readiness,
      nextAction,
    ),
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
  const unverifiedDoneSlice = slices.find((slice) =>
    slice.status === "done" &&
    slice.tasks.some((task) => task.status === "done" && task.verificationState !== "verified")
  );
  if (unverifiedDoneSlice) {
    return {
      workflow: "kata-verify-work",
      reason: `Slice ${unverifiedDoneSlice.id} is done but has tasks awaiting verification.`,
      target: { milestoneId, sliceId: unverifiedDoneSlice.id },
    };
  }

  const unverifiedTask = slices.flatMap((slice) => slice.tasks).find((task) =>
    task.status === "done" && task.verificationState !== "verified"
  );
  if (unverifiedTask) {
    return {
      workflow: "kata-verify-work",
      reason: `Task ${unverifiedTask.id} is done but not verified.`,
      target: { milestoneId, sliceId: unverifiedTask.sliceId, taskId: unverifiedTask.id },
    };
  }

  const executableSlice = slices.find((slice) => slice.status !== "done" || slice.tasks.some((task) => task.status !== "done"));
  if (executableSlice) {
    return {
      workflow: "kata-execute-phase",
      reason: `Slice ${executableSlice.id} still has execution work remaining.`,
      target: { milestoneId, sliceId: executableSlice.id },
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
  requirementToSliceIds: Record<string, string[]>,
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
    if (requirementToSliceIds[requirementId]?.some((sliceId) => missingSliceIds.includes(sliceId))) {
      continue;
    }
    actions.push({
      workflow: "kata-plan-phase",
      reason: `Requirement ${requirementId} is missing coverage and has no roadmap slice mapping, so it can be explicitly resolved into slice planning.`,
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

function extractRequirementScope(content: string): { requiredIds: string[]; futureIds: string[] } {
  const requiredIds: string[] = [];
  const futureIds: string[] = [];
  let mode: "required" | "future" | "ignore" = "required";

  for (const line of content.split(/\r?\n/)) {
    const headingMatch = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      const marks = headingMatch[1];
      const text = headingMatch[2];
      if (!marks || !text) continue;
      const headingLevel = marks.length;
      const heading = text.toLowerCase();
      if (/\b(future|deferred|follow[- ]?up|carry[- ]?forward|non[- ]?blocking)\b/.test(heading)) {
        mode = "future";
      } else if (/\b(out of scope|traceability|coverage|notes?)\b/.test(heading)) {
        mode = "ignore";
      } else if (headingLevel <= 2 && /\b(active|required|requirements?|roadmap|slices?|phases?)\b/.test(heading)) {
        mode = "required";
      }
      continue;
    }

    const ids = extractRequirementIds(line);
    if (ids.length === 0) continue;
    if (mode === "future") {
      futureIds.push(...ids);
    } else if (mode === "required") {
      requiredIds.push(...ids);
    }
  }

  return {
    requiredIds: uniqueIds(requiredIds),
    futureIds: uniqueIds(futureIds.filter((id) => !requiredIds.includes(id))),
  };
}

function extractSliceIds(content: string): string[] {
  return uniqueIds(parseSliceDependencyIds(content));
}

function extractRoadmapBackendSliceIdsFromLine(line: string): string[] {
  const ids: string[] = [];
  const labelPattern = /\b(?:backend\s+slice|backend\s+id|slice\s+id)\b\s*:?\s*(.*)$/i;

  for (const segment of splitRoadmapMetadataSegments(line)) {
    const match = labelPattern.exec(segment);
    if (!match) continue;
    const value = match[1]?.split(ROADMAP_METADATA_LABEL_TERMINATOR_PATTERN)[0] ?? "";
    ids.push(...extractSliceIds(value));
  }

  return uniqueIds(ids);
}

function splitRoadmapMetadataSegments(line: string): string[] {
  return line.split(/\s*(?:;|\||\s[-–—]\s)\s*/);
}

function parseMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isMarkdownTableDivider(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function backendSliceColumnIndexes(cells: string[]): number[] {
  return cells
    .map((cell, index) => (/\b(?:backend\s+slice(?:\s+id)?|backend\s+id|slice\s+id)\b/i.test(cell) ? index : -1))
    .filter((index) => index >= 0);
}

type SliceDependencyMap = Record<string, KataProjectSnapshotSliceDependencies>;

const ROADMAP_METADATA_LABEL_TERMINATOR_PATTERN = /\b(?:depends\s+on|blocked\s+by|dependency|dependencies|blocking|blocks)\b/i;
const BLOCKED_BY_ROADMAP_LABEL_PATTERN = /\b(?:kata\s+blocked\s+by|blocked\s+by|depends\s+on|dependency|dependencies)\b/i;
const INLINE_BLOCKED_BY_ROADMAP_LABEL_PATTERN = /\b(?:depends\s+on|blocked\s+by|dependency|dependencies)\b\s*:?\s*(.*)$/i;

function blockedByDependencyColumnIndexes(cells: string[]): number[] {
  return cells
    .map((cell, index) => (BLOCKED_BY_ROADMAP_LABEL_PATTERN.test(cell) ? index : -1))
    .filter((index) => index >= 0);
}

function blockingDependencyColumnIndexes(cells: string[]): number[] {
  return cells
    .map((cell, index) => (/\b(?:kata\s+blocking|blocking|blocks)\b/i.test(cell) ? index : -1))
    .filter((index) => index >= 0);
}

function extractRoadmapSliceDependencies(content: string): SliceDependencyMap {
  const dependencies: SliceDependencyMap = {};
  let backendSliceColumns: number[] = [];
  let blockedByColumns: number[] = [];
  let blockingColumns: number[] = [];

  for (const line of content.split(/\r?\n/)) {
    const cells = parseMarkdownTableRow(line);
    if (cells) {
      if (isMarkdownTableDivider(cells)) continue;

      const headerBackendColumns = backendSliceColumnIndexes(cells);
      if (headerBackendColumns.length > 0 && extractSliceIds(line).length === 0) {
        backendSliceColumns = headerBackendColumns;
        blockedByColumns = blockedByDependencyColumnIndexes(cells);
        blockingColumns = blockingDependencyColumnIndexes(cells);
        continue;
      }

      const sliceIds = uniqueIds([
        ...backendSliceColumns.flatMap((index) => extractSliceIds(cells[index] ?? "")),
        ...extractRoadmapBackendSliceIdsFromLine(line),
      ]);
      if (sliceIds.length > 0) {
        const blockedByIds = uniqueIds([
          ...blockedByColumns.flatMap((index) => parseSliceDependencyIds(cells[index] ?? "")),
          ...extractInlineDependencyIds(line, "blockedBy"),
        ]);
        const blockingIds = uniqueIds([
          ...blockingColumns.flatMap((index) => parseSliceDependencyIds(cells[index] ?? "")),
          ...extractInlineDependencyIds(line, "blocking"),
        ]);
        for (const sliceId of sliceIds) {
          addBlockedByDependencies(dependencies, sliceId, blockedByIds);
          addBlockingDependencies(dependencies, sliceId, blockingIds);
        }
      }
      continue;
    }

    backendSliceColumns = [];
    blockedByColumns = [];
    blockingColumns = [];

    const sliceIds = extractRoadmapBackendSliceIdsFromLine(line);
    if (sliceIds.length === 0) continue;

    const blockedByIds = extractInlineDependencyIds(line, "blockedBy");
    const blockingIds = extractInlineDependencyIds(line, "blocking");
    for (const sliceId of sliceIds) {
      addBlockedByDependencies(dependencies, sliceId, blockedByIds);
      addBlockingDependencies(dependencies, sliceId, blockingIds);
    }
  }

  return finalizeDependencyMap(dependencies);
}

function extractBackendSliceDependencies(slices: KataProjectSnapshotSlice[]): SliceDependencyMap {
  const dependencies: SliceDependencyMap = {};
  for (const slice of slices) {
    const sliceId = sliceDependencyMapKey(slice.id);
    addBlockedByDependencies(dependencies, sliceId, parseSliceDependencyIds(slice.blockedBy));
    addBlockingDependencies(dependencies, sliceId, parseSliceDependencyIds(slice.blocking));
  }
  return finalizeDependencyMap(dependencies);
}

function mergeSnapshotSliceDependencies(
  slices: KataProjectSnapshotSlice[],
  dependencies: SliceDependencyMap,
): KataProjectSnapshotSlice[] {
  return slices.map((slice) => {
    const sliceDependencies = dependencies[sliceDependencyMapKey(slice.id)];
    return {
      ...slice,
      blockedBy: uniqueIds([...parseSliceDependencyIds(slice.blockedBy), ...(sliceDependencies?.blockedBy ?? [])]),
      blocking: uniqueIds([...parseSliceDependencyIds(slice.blocking), ...(sliceDependencies?.blocking ?? [])]),
    };
  });
}

function mergeSliceDependencyMaps(...maps: SliceDependencyMap[]): SliceDependencyMap {
  const merged: SliceDependencyMap = {};
  for (const map of maps) {
    for (const [sliceId, dependencies] of Object.entries(map)) {
      addBlockedByDependencies(merged, sliceId, dependencies.blockedBy);
      addBlockingDependencies(merged, sliceId, dependencies.blocking);
    }
  }
  return finalizeDependencyMap(merged);
}

function extractInlineDependencyIds(line: string, relation: "blockedBy" | "blocking"): string[] {
  const ids: string[] = [];
  const pattern = relation === "blockedBy"
    ? INLINE_BLOCKED_BY_ROADMAP_LABEL_PATTERN
    : /\b(?:blocking|blocks)\b\s*:?\s*(.*)$/i;

  for (const segment of splitRoadmapMetadataSegments(line)) {
    const match = pattern.exec(segment);
    if (!match?.[1]) continue;
    ids.push(...parseSliceDependencyIds(match[1]));
  }

  return uniqueIds(ids);
}

function addBlockedByDependencies(map: SliceDependencyMap, sliceId: string, blockedByIds: string[]): void {
  const canonicalSliceId = sliceDependencyMapKey(sliceId);
  for (const blockedById of parseSliceDependencyIds(blockedByIds)) {
    if (blockedById === canonicalSliceId) continue;
    ensureDependencyEntry(map, canonicalSliceId).blockedBy = uniqueIds([
      ...ensureDependencyEntry(map, canonicalSliceId).blockedBy,
      blockedById,
    ]);
    ensureDependencyEntry(map, blockedById).blocking = uniqueIds([
      ...ensureDependencyEntry(map, blockedById).blocking,
      canonicalSliceId,
    ]);
  }
}

function addBlockingDependencies(map: SliceDependencyMap, sliceId: string, blockingIds: string[]): void {
  const canonicalSliceId = sliceDependencyMapKey(sliceId);
  for (const blockingId of parseSliceDependencyIds(blockingIds)) {
    if (blockingId === canonicalSliceId) continue;
    ensureDependencyEntry(map, canonicalSliceId).blocking = uniqueIds([
      ...ensureDependencyEntry(map, canonicalSliceId).blocking,
      blockingId,
    ]);
    ensureDependencyEntry(map, blockingId).blockedBy = uniqueIds([
      ...ensureDependencyEntry(map, blockingId).blockedBy,
      canonicalSliceId,
    ]);
  }
}

function ensureDependencyEntry(map: SliceDependencyMap, sliceId: string): KataProjectSnapshotSliceDependencies {
  const canonicalSliceId = sliceDependencyMapKey(sliceId);
  map[canonicalSliceId] ??= { blockedBy: [], blocking: [] };
  return map[canonicalSliceId];
}

function finalizeDependencyMap(map: SliceDependencyMap): SliceDependencyMap {
  const finalized: SliceDependencyMap = {};
  for (const sliceId of uniqueIds(Object.keys(map))) {
    const dependencies = map[sliceId];
    if (!dependencies) continue;
    const blockedBy = uniqueIds(parseSliceDependencyIds(dependencies.blockedBy));
    const blocking = uniqueIds(parseSliceDependencyIds(dependencies.blocking));
    if (blockedBy.length === 0 && blocking.length === 0) continue;
    finalized[sliceDependencyMapKey(sliceId)] = { blockedBy, blocking };
  }
  return finalized;
}

function sliceDependencyMapKey(sliceId: string): string {
  return parseSliceDependencyIds(sliceId)[0] ?? sliceId;
}

function extractRoadmapBackendSliceIdsByLine(content: string): Array<{ line: string; sliceIds: string[] }> {
  const entries: Array<{ line: string; sliceIds: string[] }> = [];
  let backendSliceColumns: number[] = [];

  for (const line of content.split(/\r?\n/)) {
    const cells = parseMarkdownTableRow(line);
    if (cells) {
      if (isMarkdownTableDivider(cells)) continue;

      const headerColumns = backendSliceColumnIndexes(cells);
      if (headerColumns.length > 0 && extractSliceIds(line).length === 0) {
        backendSliceColumns = headerColumns;
        continue;
      }

      const tableSliceIds = backendSliceColumns.flatMap((index) => extractSliceIds(cells[index] ?? ""));
      const inlineSliceIds = extractRoadmapBackendSliceIdsFromLine(line);
      const sliceIds = uniqueIds([...tableSliceIds, ...inlineSliceIds]);
      if (sliceIds.length > 0) entries.push({ line, sliceIds });
      continue;
    }

    backendSliceColumns = [];
    const sliceIds = extractRoadmapBackendSliceIdsFromLine(line);
    if (sliceIds.length > 0) entries.push({ line, sliceIds });
  }

  return entries;
}

function extractRoadmapBackendSliceIds(content: string): string[] {
  return uniqueIds(extractRoadmapBackendSliceIdsByLine(content).flatMap((entry) => entry.sliceIds));
}

function extractRequirementToSliceIds(content: string): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};
  for (const { line, sliceIds } of extractRoadmapBackendSliceIdsByLine(content)) {
    const requirementIds = extractRequirementIds(line);
    if (sliceIds.length === 0 || requirementIds.length === 0) continue;
    for (const requirementId of requirementIds) {
      mapping[requirementId] = uniqueIds([...(mapping[requirementId] ?? []), ...sliceIds]);
    }
  }
  return mapping;
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
