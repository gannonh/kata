import type {
  KataArtifact,
  KataArtifactListParams,
  KataArtifactReadParams,
  KataBackendAdapter,
  KataExecutionStatusParams,
  KataOpenPullRequestParams,
  KataSliceListParams,
  KataTaskListParams,
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
      list: (params?: KataSliceListParams) => adapter.listSlices(params),
    },
    task: {
      list: (params?: KataTaskListParams) => adapter.listTasks(params),
    },
    artifact: {
      list: (params: KataArtifactListParams) => adapter.listArtifacts(params),
      read: (params: KataArtifactReadParams) => adapter.readArtifact(params),
      write: (artifact: KataArtifact) => adapter.writeArtifact(artifact),
    },
    pr: {
      open: (params?: KataOpenPullRequestParams) => adapter.openPullRequest(params),
    },
    execution: {
      getStatus: (params?: KataExecutionStatusParams) => adapter.getExecutionStatus(params),
    },
  };
}
