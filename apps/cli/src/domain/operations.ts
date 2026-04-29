import type { createKataDomainApi } from "./service.js";
import type {
  KataArtifactListInput,
  KataArtifactReadInput,
  KataArtifactType,
  KataArtifactWriteInput,
  KataMilestoneCompleteInput,
  KataMilestoneCreateInput,
  KataProjectUpsertInput,
  KataScopeType,
  KataSlice,
  KataSliceCreateInput,
  KataSliceListInput,
  KataSliceUpdateStatusInput,
  KataTask,
  KataTaskCreateInput,
  KataTaskListInput,
  KataTaskUpdateStatusInput,
} from "./types.js";

export const KATA_OPERATION_NAMES = [
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
  "artifact.list",
  "artifact.read",
  "artifact.write",
  "execution.getStatus",
  "health.check",
] as const;

export type KataOperationName = (typeof KATA_OPERATION_NAMES)[number];

export type KataDomainApi = ReturnType<typeof createKataDomainApi>;

export interface KataPayloadValidationResult {
  ok: boolean;
  message?: string;
}

const NO_PAYLOAD_OPERATIONS = new Set<KataOperationName>([
  "project.getContext",
  "project.getSnapshot",
  "milestone.list",
  "milestone.getActive",
  "execution.getStatus",
  "health.check",
]);

const SLICE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "agent_review",
  "human_review",
  "merging",
  "done",
] as const satisfies readonly KataSlice["status"][];

const TASK_STATUSES = ["backlog", "todo", "in_progress", "done"] as const satisfies readonly KataTask["status"][];
const TASK_VERIFICATION_STATES = ["pending", "verified", "failed"] as const satisfies readonly KataTask["verificationState"][];
const SCOPE_TYPES = ["project", "milestone", "slice", "task"] as const satisfies readonly KataScopeType[];
const ARTIFACT_TYPES = [
  "project-brief",
  "requirements",
  "roadmap",
  "phase-context",
  "context",
  "decisions",
  "research",
  "plan",
  "slice",
  "summary",
  "verification",
  "uat",
  "retrospective",
] as const satisfies readonly KataArtifactType[];
const ARTIFACT_FORMATS = ["markdown", "text", "json"] as const;

export function isKataOperationName(operation: string): operation is KataOperationName {
  return KATA_OPERATION_NAMES.includes(operation as KataOperationName);
}

function valid() {
  return { ok: true };
}

function invalid(message: string) {
  return { ok: false, message };
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return !!payload && typeof payload === "object" && !Array.isArray(payload);
}

function requireNonEmptyString(payload: Record<string, unknown>, field: string): KataPayloadValidationResult {
  return typeof payload[field] === "string" && payload[field].trim().length > 0
    ? valid()
    : invalid(`Field "${field}" must be a non-empty string.`);
}

function requireString(payload: Record<string, unknown>, field: string): KataPayloadValidationResult {
  return typeof payload[field] === "string" ? valid() : invalid(`Field "${field}" must be a string.`);
}

function requireOptionalNumber(payload: Record<string, unknown>, field: string): KataPayloadValidationResult {
  return payload[field] === undefined || typeof payload[field] === "number"
    ? valid()
    : invalid(`Field "${field}" must be a number when provided.`);
}

function requireEnum<T extends string>(
  payload: Record<string, unknown>,
  field: string,
  values: readonly T[],
): KataPayloadValidationResult {
  return typeof payload[field] === "string" && values.includes(payload[field] as T)
    ? valid()
    : invalid(`Field "${field}" must be one of: ${values.join(", ")}.`);
}

function requireOptionalEnum<T extends string>(
  payload: Record<string, unknown>,
  field: string,
  values: readonly T[],
): KataPayloadValidationResult {
  return payload[field] === undefined ? valid() : requireEnum(payload, field, values);
}

function requireFields(
  payload: Record<string, unknown>,
  validators: Array<(payload: Record<string, unknown>) => KataPayloadValidationResult>,
): KataPayloadValidationResult {
  for (const validator of validators) {
    const result = validator(payload);
    if (!result.ok) {
      return result;
    }
  }
  return valid();
}

export function validateKataOperationPayload(
  operation: KataOperationName,
  payload: unknown = {},
): KataPayloadValidationResult {
  if (NO_PAYLOAD_OPERATIONS.has(operation)) {
    return valid();
  }

  if (!isRecord(payload)) {
    return invalid(`Payload for ${operation} must be a JSON object.`);
  }

  switch (operation) {
    case "project.getContext":
    case "project.getSnapshot":
    case "milestone.list":
    case "milestone.getActive":
    case "execution.getStatus":
    case "health.check":
      return valid();
    case "project.upsert":
      return requireFields(payload, [
        (input) => requireNonEmptyString(input, "title"),
        (input) => requireString(input, "description"),
      ]);
    case "milestone.create":
      return requireFields(payload, [
        (input) => requireNonEmptyString(input, "title"),
        (input) => requireNonEmptyString(input, "goal"),
      ]);
    case "milestone.complete":
      return requireFields(payload, [
        (input) => requireNonEmptyString(input, "milestoneId"),
        (input) => requireNonEmptyString(input, "summary"),
      ]);
    case "slice.list":
      return requireNonEmptyString(payload, "milestoneId");
    case "slice.create":
      return requireFields(payload, [
        (input) => requireNonEmptyString(input, "milestoneId"),
        (input) => requireNonEmptyString(input, "title"),
        (input) => requireNonEmptyString(input, "goal"),
        (input) => requireOptionalNumber(input, "order"),
      ]);
    case "slice.updateStatus":
      return requireFields(payload, [
        (input) => requireNonEmptyString(input, "sliceId"),
        (input) => requireEnum(input, "status", SLICE_STATUSES),
      ]);
    case "task.list":
      return requireNonEmptyString(payload, "sliceId");
    case "task.create":
      return requireFields(payload, [
        (input) => requireNonEmptyString(input, "sliceId"),
        (input) => requireNonEmptyString(input, "title"),
        (input) => requireNonEmptyString(input, "description"),
      ]);
    case "task.updateStatus":
      return requireFields(payload, [
        (input) => requireNonEmptyString(input, "taskId"),
        (input) => requireEnum(input, "status", TASK_STATUSES),
        (input) => requireOptionalEnum(input, "verificationState", TASK_VERIFICATION_STATES),
      ]);
    case "artifact.list":
      return requireFields(payload, [
        (input) => requireEnum(input, "scopeType", SCOPE_TYPES),
        (input) => requireNonEmptyString(input, "scopeId"),
      ]);
    case "artifact.read":
      return requireFields(payload, [
        (input) => requireEnum(input, "scopeType", SCOPE_TYPES),
        (input) => requireNonEmptyString(input, "scopeId"),
        (input) => requireEnum(input, "artifactType", ARTIFACT_TYPES),
      ]);
    case "artifact.write":
      return requireFields(payload, [
        (input) => requireEnum(input, "scopeType", SCOPE_TYPES),
        (input) => requireNonEmptyString(input, "scopeId"),
        (input) => requireEnum(input, "artifactType", ARTIFACT_TYPES),
        (input) => requireNonEmptyString(input, "title"),
        (input) => requireNonEmptyString(input, "content"),
        (input) => requireEnum(input, "format", ARTIFACT_FORMATS),
      ]);
  }
}

export class InvalidKataOperationPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKataOperationPayloadError";
  }
}

export async function dispatchKataOperation(
  api: KataDomainApi,
  operation: KataOperationName,
  payload: unknown = {},
) {
  const validation = validateKataOperationPayload(operation, payload);
  if (!validation.ok) {
    throw new InvalidKataOperationPayloadError(validation.message ?? "Invalid operation payload.");
  }

  switch (operation) {
    case "project.getContext":
      return api.project.getContext();
    case "project.getSnapshot":
      return api.project.getSnapshot();
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
