type JsonPayload = Record<string, unknown>;

interface JsonCommandRequest {
  operation: string;
  payload?: JsonPayload;
}

interface JsonApi {
  project?: {
    getContext?: (payload: any) => Promise<unknown>;
  };
  milestone?: {
    getActive?: (payload: any) => Promise<unknown>;
  };
  slice?: {
    list?: (payload: any) => Promise<unknown>;
  };
  task?: {
    list?: (payload: any) => Promise<unknown>;
  };
  artifact?: {
    list?: (payload: any) => Promise<unknown>;
    read?: (payload: any) => Promise<unknown>;
    write?: (payload: any) => Promise<unknown>;
  };
  execution?: {
    getStatus?: (payload: any) => Promise<unknown>;
  };
}

export const SUPPORTED_JSON_OPERATIONS = [
  "project.getContext",
  "milestone.getActive",
  "slice.list",
  "task.list",
  "artifact.list",
  "artifact.read",
  "artifact.write",
  "execution.getStatus",
] as const;

export function isSupportedJsonOperation(operation: string): operation is (typeof SUPPORTED_JSON_OPERATIONS)[number] {
  return SUPPORTED_JSON_OPERATIONS.includes(operation as (typeof SUPPORTED_JSON_OPERATIONS)[number]);
}

function notImplemented(operation: string) {
  return JSON.stringify({
    ok: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: `Supported operation is not implemented by this API: ${operation}`,
    },
  });
}

export async function runJsonCommand(input: JsonCommandRequest, api: JsonApi) {
  const payload = input.payload ?? {};

  if (input.operation === "project.getContext") {
    const handler = api.project?.getContext;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "milestone.getActive") {
    const handler = api.milestone?.getActive;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "slice.list") {
    const handler = api.slice?.list;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "task.list") {
    const handler = api.task?.list;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "artifact.list") {
    const handler = api.artifact?.list;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "artifact.read") {
    const handler = api.artifact?.read;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "artifact.write") {
    const handler = api.artifact?.write;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "execution.getStatus") {
    const handler = api.execution?.getStatus;
    if (!handler) return notImplemented(input.operation);
    const data = await handler(payload);
    return JSON.stringify({ ok: true, data });
  }

  return JSON.stringify({
    ok: false,
    error: { code: "UNKNOWN", message: `Unsupported operation: ${input.operation}` },
  });
}
