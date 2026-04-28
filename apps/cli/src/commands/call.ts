import { readFile } from "node:fs/promises";

import { resolveBackend } from "../backends/resolve-backend.js";
import { dispatchKataOperation, isKataOperationName } from "../domain/operations.js";
import { createKataDomainApi } from "../domain/service.js";

export interface RunCallInput {
  operation: string;
  inputPath?: string;
  cwd: string;
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
    const raw = await readFile(input.inputPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  }

  const adapter = await resolveBackend({ workspacePath: input.cwd });
  const data = await dispatchKataOperation(createKataDomainApi(adapter), input.operation, payload);
  return JSON.stringify({ ok: true, data }, null, 2);
}
