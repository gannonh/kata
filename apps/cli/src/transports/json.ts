import {
  KATA_OPERATION_NAMES,
  dispatchKataOperation,
  isKataOperationName,
  type KataDomainApi,
} from "../domain/operations.js";

type JsonPayload = Record<string, unknown>;

interface JsonCommandRequest {
  operation: string;
  payload?: JsonPayload;
}

export const SUPPORTED_JSON_OPERATIONS = KATA_OPERATION_NAMES;

export function isSupportedJsonOperation(operation: string) {
  return isKataOperationName(operation);
}

export async function runJsonCommand(input: JsonCommandRequest, api: KataDomainApi) {
  if (!isKataOperationName(input.operation)) {
    return JSON.stringify({
      ok: false,
      error: { code: "UNKNOWN", message: `Unsupported operation: ${input.operation}` },
    });
  }

  const data = await dispatchKataOperation(api, input.operation, input.payload ?? {});
  return JSON.stringify({ ok: true, data });
}
