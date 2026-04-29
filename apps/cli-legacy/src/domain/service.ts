import type {
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactWriteInput,
  KataBackendAdapter,
  KataOpenPullRequestInput,
  KataSliceListInput,
  KataTaskListInput,
} from "./types.js";

export function createKataDomainApi(adapter: KataBackendAdapter) {
  return {
    project: {
      getContext: () => adapter.getProjectContext(),
    },
    milestone: {
      getActive: () => adapter.getActiveMilestone(),
    },
    slice: {
      list: (input: KataSliceListInput) => adapter.listSlices(input),
    },
    task: {
      list: (input: KataTaskListInput) => adapter.listTasks(input),
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
  };
}
