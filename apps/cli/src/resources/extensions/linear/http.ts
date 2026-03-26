/**
 * HTTP utilities for the Linear GraphQL client.
 *
 * Error classification, fetch with retry, and rate limit extraction —
 * adapted from search-the-web/http.ts for Linear's GraphQL error format.
 *
 * Linear's API returns errors in the response body as:
 *   { "errors": [{ "message": "...", "extensions": { "code": "..." } }] }
 * even when the HTTP status is 200. This module handles both HTTP-level
 * and GraphQL-level errors.
 */

// =============================================================================
// Error Types
// =============================================================================

/** Structured error for HTTP-level failures. */
export class LinearHttpError extends Error {
  readonly statusCode: number;
  readonly response?: Response;

  constructor(message: string, statusCode: number, response?: Response) {
    super(message);
    this.name = "LinearHttpError";
    this.statusCode = statusCode;
    this.response = response;
    Object.setPrototypeOf(this, LinearHttpError.prototype);
  }
}

/** Structured error for GraphQL-level failures (HTTP 200 but errors in body). */
export class LinearGraphQLError extends Error {
  readonly errors: Array<{ message: string; extensions?: Record<string, unknown> }>;

  constructor(
    message: string,
    errors: Array<{ message: string; extensions?: Record<string, unknown> }>,
  ) {
    super(message);
    this.name = "LinearGraphQLError";
    this.errors = errors;
    Object.setPrototypeOf(this, LinearGraphQLError.prototype);
  }
}

/** Categorized error types for agent-friendly error handling. */
export type LinearErrorKind =
  | "auth_error"        // 401/403 — bad or missing API key
  | "rate_limited"      // 429 — too many requests
  | "network_error"     // DNS, timeout, connection refused
  | "server_error"      // 5xx
  | "invalid_request"   // 400, bad params
  | "not_found"         // 404 or GraphQL "not found" errors
  | "graphql_error"     // GraphQL-level errors in response body
  | "unknown";

export interface ClassifiedError {
  kind: LinearErrorKind;
  message: string;
  retryAfterMs?: number;
}

export function classifyLinearError(err: unknown): ClassifiedError {
  if (err instanceof LinearHttpError) {
    const code = err.statusCode;
    if (code === 401 || code === 403) {
      return {
        kind: "auth_error",
        message: `HTTP ${code}: Invalid or missing Linear API key. Use secure_env_collect to set LINEAR_API_KEY.`,
      };
    }
    if (code === 429) {
      let retryAfterMs: number | undefined;
      const retryAfter = err.response?.headers.get("Retry-After");
      if (retryAfter) {
        const seconds = parseFloat(retryAfter);
        if (!isNaN(seconds)) retryAfterMs = seconds * 1000;
      }
      return {
        kind: "rate_limited",
        message: `Rate limited (HTTP 429). ${retryAfterMs ? `Retry after ${Math.ceil(retryAfterMs / 1000)}s.` : "Wait before retrying."}`,
        retryAfterMs,
      };
    }
    if (code === 400) {
      const msg = err.message.toLowerCase();
      if (msg.includes("rate limit") || msg.includes("ratelimited")) {
        return {
          kind: "rate_limited",
          message: `Rate limited (HTTP 400 from Linear ratelimit proxy): ${err.message}`,
        };
      }
      return { kind: "invalid_request", message: `Bad request (HTTP 400): ${err.message}` };
    }
    if (code === 404) {
      return { kind: "not_found", message: `Not found (HTTP 404)` };
    }
    if (code >= 500) {
      return { kind: "server_error", message: `Server error (HTTP ${code}): ${err.message}` };
    }
    return { kind: "unknown", message: `HTTP ${code}: ${err.message}` };
  }

  if (err instanceof LinearGraphQLError) {
    const first = err.errors[0];
    const firstMsg = first?.message ?? err.message;
    const extensions = (first?.extensions ?? {}) as Record<string, unknown>;

    const extCode = String(extensions.code ?? "").toUpperCase();
    const extType = String(extensions.type ?? "").toLowerCase();
    const extStatus = Number(extensions.statusCode ?? NaN);
    const lowerMsg = firstMsg.toLowerCase();

    if (
      extCode === "RATELIMITED" ||
      extType === "ratelimited" ||
      extStatus === 429 ||
      lowerMsg.includes("rate limit")
    ) {
      // Linear's documented rate-limit info is in HTTP headers (X-RateLimit-Requests-Reset),
      // not in a GraphQL extensions.meta.rateLimitResult field. Try the undocumented path
      // defensively, but fall back to a sensible default (5 seconds) when unavailable.
      const meta = (extensions.meta ?? {}) as Record<string, unknown>;
      const rateLimitResult = (meta.rateLimitResult ?? {}) as Record<string, unknown>;
      const duration = Number(rateLimitResult.duration ?? NaN);
      const DEFAULT_RATE_LIMIT_RETRY_MS = 5_000;
      const retryAfterMs = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_RATE_LIMIT_RETRY_MS;

      return {
        kind: "rate_limited",
        message: `Rate limited: ${firstMsg}`,
        retryAfterMs,
      };
    }

    // Check for common GraphQL error patterns
    if (lowerMsg.includes("not found") || lowerMsg.includes("does not exist")) {
      return { kind: "not_found", message: firstMsg };
    }
    if (lowerMsg.includes("authentication") || lowerMsg.includes("unauthorized")) {
      return { kind: "auth_error", message: `Authentication error: ${firstMsg}. Use secure_env_collect to set LINEAR_API_KEY.` };
    }
    return { kind: "graphql_error", message: firstMsg };
  }

  if (err instanceof TypeError && (err as TypeError).message.includes("fetch")) {
    return { kind: "network_error", message: `Network error: ${(err as Error).message}` };
  }

  const msg = (err as Error)?.message ?? String(err);
  if (msg.includes("abort") || msg.includes("timeout")) {
    return { kind: "network_error", message: "Request timed out" };
  }
  return { kind: "unknown", message: msg };
}

// =============================================================================
// Rate Limit Info
// =============================================================================

export interface RateLimitInfo {
  remaining?: number;
  limit?: number;
  reset?: number; // epoch milliseconds (UTC) — matches Linear's header format
}

/** Extract rate limit headers from a Linear API response. */
export function extractRateLimitInfo(response: Response): RateLimitInfo | undefined {
  const remaining =
    response.headers.get("x-ratelimit-requests-remaining") ??
    response.headers.get("x-ratelimit-remaining");
  const limit =
    response.headers.get("x-ratelimit-requests-limit") ??
    response.headers.get("x-ratelimit-limit");
  const reset =
    response.headers.get("x-ratelimit-requests-reset") ??
    response.headers.get("x-ratelimit-reset");

  if (!remaining && !limit) return undefined;

  // Linear's X-RateLimit-Requests-Reset is a UTC epoch in milliseconds.
  // Store as-is so callers can compute `reset - Date.now()` for wait time.
  const rawReset = reset ? parseInt(reset, 10) : undefined;

  return {
    remaining: remaining ? parseInt(remaining, 10) : undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    reset: rawReset,
  };
}

// =============================================================================
// Retry Logic
// =============================================================================

function isRetryable(error: unknown): boolean {
  if (error instanceof LinearHttpError) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  if (error instanceof LinearGraphQLError) {
    // GraphQL-level rate-limit or server errors should be retried.
    // classifyLinearError() identifies these via extensions.code / message patterns.
    const classified = classifyLinearError(error);
    return classified.kind === "rate_limited" || classified.kind === "server_error";
  }
  if (error instanceof TypeError) return (error as TypeError).message.includes("fetch");
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry and full-jitter exponential backoff.
 *
 * - maxRetries: additional attempts after the first (total = maxRetries + 1)
 * - Respects Retry-After header on 429 responses
 * - Each attempt uses a 30-second AbortSignal timeout
 * - Non-retryable errors thrown immediately
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 30_000);

    const callerSignal = options.signal as AbortSignal | undefined;
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(url, { ...options, signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Linear sometimes encodes GraphQL errors (including ratelimit) in a
        // non-200 response body. Parse and preserve those details when possible.
        let parsed: unknown;
        try {
          parsed = await response.clone().json();
        } catch {
          parsed = undefined;
        }

        const errors =
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { errors?: unknown }).errors)
            ? ((parsed as { errors: Array<{ message?: string; extensions?: Record<string, unknown> }> }).errors)
                .filter((e) => e && typeof e.message === "string")
                .map((e) => ({ message: e.message as string, extensions: e.extensions }))
            : [];

        if (errors.length > 0) {
          throw new LinearGraphQLError(errors[0].message, errors);
        }

        throw new LinearHttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response,
        );
      }
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      // Distinguish caller-initiated cancellation (non-retryable) from
      // our own timeout abort (retryable). AbortError from fetch is a
      // DOMException with name "AbortError".
      const isAbortError = (err as { name?: string }).name === "AbortError";
      if (isAbortError) {
        // Caller explicitly cancelled — don't retry
        if (callerSignal?.aborted) throw err;
        // Our timeout fired — treat as retryable (fall through)
      } else if (!isRetryable(err)) {
        throw err;
      }

      if (attempt < maxRetries) {
        let delayMs: number;
        if (err instanceof LinearHttpError && err.statusCode === 429 && err.response) {
          const retryAfter = err.response.headers.get("Retry-After");
          if (retryAfter) {
            const seconds = parseFloat(retryAfter);
            delayMs = isNaN(seconds) ? 1000 : seconds * 1000;
          } else {
            delayMs = Math.random() * Math.min(32_000, 1_000 * 2 ** attempt);
          }
        } else {
          delayMs = Math.random() * Math.min(32_000, 1_000 * 2 ** attempt);
        }
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}
