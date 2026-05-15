export type SymphonyExtensionErrorKind =
  | "missing_binary"
  | "missing_workflow"
  | "invalid_binary"
  | "command_failed"
  | "start_timeout"
  | "attach_unreachable"
  | "non_symphony_response"
  | "invalid_json"
  | "api_error"
  | "no_attachment"
  | "not_owned";

export class SymphonyExtensionError extends Error {
  readonly kind: SymphonyExtensionErrorKind;
  readonly details: Record<string, unknown>;

  constructor(kind: SymphonyExtensionErrorKind, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "SymphonyExtensionError";
    this.kind = kind;
    this.details = details;
  }
}

export function formatError(error: unknown): string {
  if (error instanceof SymphonyExtensionError) {
    const detailText = Object.keys(error.details).length > 0 ? `\n${JSON.stringify(error.details, null, 2)}` : "";
    return `${error.message}${detailText}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
