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
  const roadmapSliceEntries = extractRoadmapSliceEntries(roadmapContent);
  const roadmapSliceResolution = resolveRoadmapSliceReferences(roadmapSliceEntries, rawSnapshotSlices);
  const plannedSliceIds = extractRoadmapPlannedSliceIds(roadmapSliceEntries, roadmapSliceResolution);
  const existingSliceIds = rawSnapshotSlices.map((slice) => slice.id);
  const missingSliceIds = plannedSliceIds.filter((id) => !existingSliceIds.includes(id));
  const requirementToSliceIds = extractRequirementToSliceIds(roadmapSliceEntries, roadmapSliceResolution);
  const sliceDependencies = mergeSliceDependencyMaps(
    extractRoadmapSliceDependencies(roadmapSliceEntries, roadmapSliceResolution),
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

  const executableSlice = slices.find((slice) =>
    hasExecutionWorkRemaining(slice) && findOpenKnownBlockerIds(slice, slices).length === 0
  );
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
    if (!hasExecutionWorkRemaining(slice)) continue;
    const openBlockerIds = findOpenKnownBlockerIds(slice, slices);
    actions.push({
      workflow: "kata-execute-phase",
      reason: openBlockerIds.length > 0
        ? `Slice ${slice.id} is blocked by ${openBlockerIds.join(", ")}.`
        : `Slice ${slice.id} has execution work remaining and can be explicitly selected.`,
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

function hasExecutionWorkRemaining(slice: KataProjectSnapshotSlice): boolean {
  return slice.status !== "done" || slice.tasks.some((task) => task.status !== "done");
}

function findOpenKnownBlockerIds(slice: KataProjectSnapshotSlice, slices: KataProjectSnapshotSlice[]): string[] {
  const sliceById = new Map(slices.map((snapshotSlice) => [sliceDependencyMapKey(snapshotSlice.id), snapshotSlice]));
  return parseSliceDependencyIds(slice.blockedBy).filter((blockedById) => {
    const blocker = sliceById.get(sliceDependencyMapKey(blockedById));
    return blocker ? blocker.status !== "done" : false;
  });
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

function extractPlannedSliceIds(content: string): string[] {
  const ids: string[] = [];
  for (const match of content.matchAll(/\bplanned\s+slice\s+(\d+)\b/gi)) {
    const numericId = Number(match[1]);
    if (!Number.isSafeInteger(numericId) || numericId < 0) continue;
    ids.push(`Planned Slice ${numericId}`);
  }
  return uniqueIds(ids);
}

function extractPlannedSliceTitle(cell: string, plannedSliceId: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(plannedSliceId)}\\b\\s*(?::|[-–—])?\\s*(.*)$`, "i");
  const match = pattern.exec(cell.trim());
  const title = match?.[1]?.trim() ?? "";
  if (!title || /^\[.*\]$/.test(title) || /^none$/i.test(title)) return null;
  return title;
}

function parseRoadmapSliceReferenceIds(value: unknown): string[] {
  if (typeof value === "string") {
    return uniqueIds([...parseSliceDependencyIds(value), ...extractPlannedSliceIds(value)]);
  }
  if (Array.isArray(value)) return uniqueIds(value.flatMap((item) => parseRoadmapSliceReferenceIds(item)));
  return [];
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

function plannedSliceColumnIndexes(cells: string[]): number[] {
  return cells
    .map((cell, index) => (
      /\b(?:phase\/planned\s+slice|roadmap\s+slice)\b/i.test(cell) ||
      (/\bplanned\s+slice\b/i.test(cell) && !/\bplanned\s+slices\b/i.test(cell))
        ? index
        : -1
    ))
    .filter((index) => index >= 0);
}

function requirementColumnIndexes(cells: string[]): number[] {
  return cells
    .map((cell, index) => (/\brequirements?\b/i.test(cell) ? index : -1))
    .filter((index) => index >= 0);
}

type SliceDependencyMap = Record<string, KataProjectSnapshotSliceDependencies>;

type RoadmapSliceEntry = {
  line: string;
  plannedSliceIds: string[];
  backendSliceIds: string[];
  blockedByIds: string[];
  blockingIds: string[];
  requirementIds: string[];
  titleByPlannedSliceId: Record<string, string>;
};

type RoadmapSliceResolution = Map<string, string[]>;

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

function extractRoadmapSliceEntries(content: string): RoadmapSliceEntry[] {
  const entries: RoadmapSliceEntry[] = [];
  let plannedSliceColumns: number[] = [];
  let backendSliceColumns: number[] = [];
  let blockedByColumns: number[] = [];
  let blockingColumns: number[] = [];
  let requirementColumns: number[] = [];

  for (const line of content.split(/\r?\n/)) {
    const cells = parseMarkdownTableRow(line);
    if (cells) {
      if (isMarkdownTableDivider(cells)) continue;

      const headerPlannedColumns = plannedSliceColumnIndexes(cells);
      const headerBackendColumns = backendSliceColumnIndexes(cells);
      const headerRequirementColumns = requirementColumnIndexes(cells);
      if (
        (headerPlannedColumns.length > 0 || headerBackendColumns.length > 0 || headerRequirementColumns.length > 0) &&
        extractSliceIds(line).length === 0 &&
        extractPlannedSliceIds(line).length === 0 &&
        extractRequirementIds(line).length === 0
      ) {
        plannedSliceColumns = headerPlannedColumns;
        backendSliceColumns = headerBackendColumns;
        blockedByColumns = blockedByDependencyColumnIndexes(cells);
        blockingColumns = blockingDependencyColumnIndexes(cells);
        requirementColumns = headerRequirementColumns;
        continue;
      }

      const plannedSliceIds = uniqueIds(plannedSliceColumns.flatMap((index) => extractPlannedSliceIds(cells[index] ?? "")));
      const backendSliceIds = uniqueIds([
        ...backendSliceColumns.flatMap((index) => extractSliceIds(cells[index] ?? "")),
        ...extractRoadmapBackendSliceIdsFromLine(line),
      ]);
      const sourceIds = uniqueIds([...plannedSliceIds, ...backendSliceIds]);
      if (sourceIds.length > 0) {
        entries.push({
          line,
          plannedSliceIds,
          backendSliceIds,
          blockedByIds: uniqueIds([
            ...blockedByColumns.flatMap((index) => parseRoadmapSliceReferenceIds(cells[index] ?? "")),
            ...extractInlineDependencyIds(line, "blockedBy"),
          ]),
          blockingIds: uniqueIds([
            ...blockingColumns.flatMap((index) => parseRoadmapSliceReferenceIds(cells[index] ?? "")),
            ...extractInlineDependencyIds(line, "blocking"),
          ]),
          requirementIds: uniqueIds(
            requirementColumns.length > 0
              ? requirementColumns.flatMap((index) => extractRequirementIds(cells[index] ?? ""))
              : extractRequirementIds(line),
          ),
          titleByPlannedSliceId: extractPlannedSliceTitles(cells, plannedSliceColumns, plannedSliceIds),
        });
      }
      continue;
    }

    plannedSliceColumns = [];
    backendSliceColumns = [];
    blockedByColumns = [];
    blockingColumns = [];
    requirementColumns = [];

    const plannedSliceIds = extractPlannedSliceIds(line);
    const backendSliceIds = extractRoadmapBackendSliceIdsFromLine(line);
    const sourceIds = uniqueIds([...plannedSliceIds, ...backendSliceIds]);
    if (sourceIds.length === 0) continue;

    entries.push({
      line,
      plannedSliceIds,
      backendSliceIds,
      blockedByIds: extractInlineDependencyIds(line, "blockedBy"),
      blockingIds: extractInlineDependencyIds(line, "blocking"),
      requirementIds: extractRequirementIds(line),
      titleByPlannedSliceId: extractPlannedSliceTitles([line], [0], plannedSliceIds),
    });
  }

  return entries;
}

function extractRoadmapSliceDependencies(
  entries: RoadmapSliceEntry[],
  resolution: RoadmapSliceResolution,
): SliceDependencyMap {
  const dependencies: SliceDependencyMap = {};

  for (const entry of entries) {
    const sliceIds = resolvedRoadmapEntrySliceIds(entry, resolution);
    if (sliceIds.length === 0) continue;

    const blockedByIds = resolveRoadmapSliceIds(entry.blockedByIds, resolution);
    const blockingIds = resolveRoadmapSliceIds(entry.blockingIds, resolution);
    for (const sliceId of sliceIds) {
      addBlockedByDependencies(dependencies, sliceId, blockedByIds);
      addBlockingDependencies(dependencies, sliceId, blockingIds);
    }
  }

  return finalizeDependencyMap(dependencies);
}

function extractPlannedSliceTitles(
  cells: string[],
  plannedSliceColumns: number[],
  plannedSliceIds: string[],
): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const column of plannedSliceColumns) {
    const cell = cells[column] ?? "";
    for (const plannedSliceId of plannedSliceIds) {
      const title = extractPlannedSliceTitle(cell, plannedSliceId);
      if (title) titles[plannedSliceId] = title;
    }
  }
  return titles;
}

function resolveRoadmapSliceReferences(
  entries: RoadmapSliceEntry[],
  slices: KataProjectSnapshotSlice[],
): RoadmapSliceResolution {
  const resolution: RoadmapSliceResolution = new Map();

  for (const entry of entries) {
    for (const plannedSliceId of entry.plannedSliceIds) {
      if (entry.backendSliceIds.length > 0) {
        resolution.set(plannedSliceId, entry.backendSliceIds);
        continue;
      }

      const matchedSliceId = findMatchingBackendSliceId(plannedSliceId, entry, slices);
      if (matchedSliceId) resolution.set(plannedSliceId, [matchedSliceId]);
    }
  }

  return resolution;
}

function findMatchingBackendSliceId(
  plannedSliceId: string,
  entry: RoadmapSliceEntry,
  slices: KataProjectSnapshotSlice[],
): string | null {
  const title = entry.titleByPlannedSliceId[plannedSliceId];
  if (title) {
    const normalizedTitle = normalizeRoadmapMatchText(title);
    const titleMatches = slices.filter((slice) => normalizeRoadmapMatchText(slice.title) === normalizedTitle);
    if (titleMatches.length === 1) return titleMatches[0]?.id ?? null;
  }

  if (entry.requirementIds.length > 0) {
    const requirementMatches = slices.filter((slice) => {
      const sliceRequirementIds = new Set(slice.requirementIds);
      return entry.requirementIds.every((requirementId) => sliceRequirementIds.has(requirementId));
    });
    if (requirementMatches.length === 1) return requirementMatches[0]?.id ?? null;
  }

  return null;
}

function normalizeRoadmapMatchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolvedRoadmapEntrySliceIds(entry: RoadmapSliceEntry, resolution: RoadmapSliceResolution): string[] {
  return uniqueIds([
    ...entry.backendSliceIds,
    ...entry.plannedSliceIds.flatMap((plannedSliceId) => resolution.get(plannedSliceId) ?? [plannedSliceId]),
  ]);
}

function resolveRoadmapSliceIds(ids: string[], resolution: RoadmapSliceResolution): string[] {
  return uniqueIds(ids.flatMap((id) => resolution.get(id) ?? [id]));
}

function extractRoadmapPlannedSliceIds(entries: RoadmapSliceEntry[], resolution: RoadmapSliceResolution): string[] {
  return uniqueIds(entries.flatMap((entry) => resolvedRoadmapEntrySliceIds(entry, resolution)));
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
    ids.push(...parseRoadmapSliceReferenceIds(match[1]));
  }

  return uniqueIds(ids);
}

function addBlockedByDependencies(map: SliceDependencyMap, sliceId: string, blockedByIds: string[]): void {
  const canonicalSliceId = sliceDependencyMapKey(sliceId);
  for (const blockedById of parseRoadmapSliceReferenceIds(blockedByIds)) {
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
  for (const blockingId of parseRoadmapSliceReferenceIds(blockingIds)) {
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
    const blockedBy = uniqueIds(parseRoadmapSliceReferenceIds(dependencies.blockedBy));
    const blocking = uniqueIds(parseRoadmapSliceReferenceIds(dependencies.blocking));
    if (blockedBy.length === 0 && blocking.length === 0) continue;
    finalized[sliceDependencyMapKey(sliceId)] = { blockedBy, blocking };
  }
  return finalized;
}

function sliceDependencyMapKey(sliceId: string): string {
  return parseSliceDependencyIds(sliceId)[0] ?? sliceId;
}

function extractRequirementToSliceIds(
  entries: RoadmapSliceEntry[],
  resolution: RoadmapSliceResolution,
): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};
  for (const entry of entries) {
    const sliceIds = resolvedRoadmapEntrySliceIds(entry, resolution);
    if (sliceIds.length === 0 || entry.requirementIds.length === 0) continue;
    for (const requirementId of entry.requirementIds) {
      mapping[requirementId] = uniqueIds([...(mapping[requirementId] ?? []), ...sliceIds]);
    }
  }
  return mapping;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
