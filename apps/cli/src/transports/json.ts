interface JsonCommandRequest {
  operation: string;
  payload: Record<string, unknown>;
}

interface JsonApi {
  project?: {
    getContext?: (payload: Record<string, unknown>) => Promise<unknown>;
  };
  execution?: {
    getStatus?: (payload: Record<string, unknown>) => Promise<unknown>;
  };
}

export async function runJsonCommand(input: JsonCommandRequest, api: JsonApi) {
  if (input.operation === "project.getContext") {
    const data = await api.project?.getContext?.(input.payload);
    return JSON.stringify({ ok: true, data });
  }

  if (input.operation === "execution.getStatus") {
    const data = await api.execution?.getStatus?.(input.payload);
    return JSON.stringify({ ok: true, data });
  }

  return JSON.stringify({
    ok: false,
    error: { code: "UNKNOWN", message: `Unsupported operation: ${input.operation}` },
  });
}
