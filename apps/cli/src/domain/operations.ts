import type { createKataDomainApi } from "./service.js";
import type {
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactWriteInput,
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataProjectUpsertInput,
  KataSliceCreateInput,
  KataSliceListInput,
  KataSliceUpdateStatusInput,
  KataTaskCreateInput,
  KataTaskListInput,
  KataTaskUpdateStatusInput,
} from "./types.js";

export const KATA_OPERATION_NAMES = [
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
] as const;

export type KataOperationName = (typeof KATA_OPERATION_NAMES)[number];

export type KataDomainApi = ReturnType<typeof createKataDomainApi>;

export function isKataOperationName(operation: string): operation is KataOperationName {
  return KATA_OPERATION_NAMES.includes(operation as KataOperationName);
}

export async function dispatchKataOperation(
  api: KataDomainApi,
  operation: KataOperationName,
  payload: unknown = {},
) {
  switch (operation) {
    case "project.getContext":
      return api.project.getContext();
    case "project.upsert":
      return api.project.upsert(payload as KataProjectUpsertInput);
    case "milestone.list":
      return api.milestone.list();
    case "milestone.getActive":
      return api.milestone.getActive();
    case "milestone.create":
      return api.milestone.create(payload as KataMilestoneCreateInput);
    case "milestone.complete":
      return api.milestone.complete(payload as KataMilestoneCompleteInput);
    case "slice.list":
      return api.slice.list(payload as KataSliceListInput);
    case "slice.create":
      return api.slice.create(payload as KataSliceCreateInput);
    case "slice.updateStatus":
      return api.slice.updateStatus(payload as KataSliceUpdateStatusInput);
    case "task.list":
      return api.task.list(payload as KataTaskListInput);
    case "task.create":
      return api.task.create(payload as KataTaskCreateInput);
    case "task.updateStatus":
      return api.task.updateStatus(payload as KataTaskUpdateStatusInput);
    case "artifact.list":
      return api.artifact.list(payload as KataArtifactListInput);
    case "artifact.read":
      return api.artifact.read(payload as KataArtifactReadInput);
    case "artifact.write":
      return api.artifact.write(payload as KataArtifactWriteInput);
    case "execution.getStatus":
      return api.execution.getStatus();
    case "health.check":
      return api.health.check();
  }
}
