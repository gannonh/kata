import type {
  KataArtifactWriteInput,
  KataBackendAdapter,
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
      list: (input: { milestoneId: string }) => adapter.listSlices(input),
    },
    task: {
      list: (input: { sliceId: string }) => adapter.listTasks(input),
    },
    artifact: {
      list: (input: { scopeType: "project" | "milestone" | "slice" | "task"; scopeId: string }) =>
        adapter.listArtifacts(input),
      read: (input: {
        scopeType: "project" | "milestone" | "slice" | "task";
        scopeId: string;
        artifactType:
          | "project-brief"
          | "requirements"
          | "roadmap"
          | "phase-context"
          | "research"
          | "plan"
          | "summary"
          | "verification"
          | "uat"
          | "retrospective";
      }) => adapter.readArtifact(input),
      write: (input: KataArtifactWriteInput) => adapter.writeArtifact(input),
    },
    pr: {
      open: (input: { title: string; body: string; base: string; head: string }) => adapter.openPullRequest(input),
    },
    execution: {
      getStatus: () => adapter.getExecutionStatus(),
    },
  };
}
