import { readFile } from "node:fs/promises";

import { resolveBackend } from "../backends/resolve-backend.js";
import {
  dispatchKataOperation,
  isKataOperationName,
  validateKataOperationPayload,
  type KataOperationName,
} from "../domain/operations.js";
import { createKataDomainApi } from "../domain/service.js";

export interface RunCallInput {
  operation: string;
  inputPath?: string;
  cwd: string;
}

const PAYLOAD_REQUIRED_OPERATIONS = new Set<KataOperationName>([
  "project.upsert",
  "milestone.create",
  "milestone.complete",
  "slice.list",
  "slice.create",
  "slice.updateStatus",
  "task.list",
  "task.create",
  "task.updateStatus",
  "issue.create",
  "issue.get",
  "issue.updateStatus",
  "artifact.list",
  "artifact.read",
  "artifact.write",
]);

function invalidRequest(message: string) {
  return JSON.stringify({
    ok: false,
    error: { code: "INVALID_REQUEST", message },
  });
}

export async function runCall(input: RunCallInput): Promise<string> {
  if (!isKataOperationName(input.operation)) {
    return JSON.stringify({
      ok: false,
      error: { code: "UNKNOWN", message: `Unsupported operation: ${input.operation}` },
    });
  }

  let payload: Record<string, unknown> = {};
  if (input.inputPath) {
    let raw = "";
    try {
      raw = await readFile(input.inputPath, "utf8");
    } catch {
      return invalidRequest(`Unable to read input file: ${input.inputPath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return invalidRequest("Input file must contain valid JSON.");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return invalidRequest("Call input must be a JSON object.");
    }

    payload = parsed as Record<string, unknown>;
  } else if (PAYLOAD_REQUIRED_OPERATIONS.has(input.operation)) {
    return invalidRequest(`Operation requires an input file: ${input.operation}`);
  }

  const validation = validateKataOperationPayload(input.operation, payload);
  if (!validation.ok) {
    return invalidRequest(validation.message ?? "Invalid operation payload.");
  }

  const adapter = await resolveBackend({ workspacePath: input.cwd });
  const data = await dispatchKataOperation(createKataDomainApi(adapter), input.operation, payload);
  return JSON.stringify({ ok: true, data }, null, 2);
}
