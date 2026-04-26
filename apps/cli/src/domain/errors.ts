export type KataDomainErrorCode =
  | "INVALID_CONFIG"
  | "NOT_FOUND"
  | "NOT_SUPPORTED"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "NETWORK"
  | "UNKNOWN";

export class KataDomainError extends Error {
  readonly code: KataDomainErrorCode;

  constructor(code: KataDomainErrorCode, message: string) {
    super(message);
    this.name = "KataDomainError";
    this.code = code;
  }
}
