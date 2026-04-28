import type {
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactWriteInput,
  KataBackendAdapter,
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
} from "./types.js";

export function createKataDomainApi(adapter: KataBackendAdapter) {
  return {
    project: {
      getContext: () => adapter.getProjectContext(),
      upsert: (input: KataProjectUpsertInput) => adapter.upsertProject(input),
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
