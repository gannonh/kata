import { SymphonyError, type SymphonyConnectionConfig, type SymphonyEventFilter } from "./types.js";

export function buildSymphonyEventsUrl(
  connection: SymphonyConnectionConfig,
  filter: SymphonyEventFilter,
): string {
  const base = new URL("/api/v1/events", ensureTrailingSlash(connection.url));

  const issue = toQueryValue(filter.issue);
  const type = toQueryValue(filter.type);
  const severity = toQueryValue(filter.severity);

  if (issue) base.searchParams.set("issue", issue);
  if (type) base.searchParams.set("type", type);
  if (severity) base.searchParams.set("severity", severity);

  if (base.protocol === "http:") {
    base.protocol = "ws:";
  } else if (base.protocol === "https:") {
    base.protocol = "wss:";
  } else {
    throw new SymphonyError(
      `Unsupported Symphony protocol for WebSocket stream: ${base.protocol}`,
      {
        code: "connection_failed",
        origin: connection.origin,
        endpoint: connection.url,
        reason: "unsupported_protocol",
      },
    );
  }

  return base.toString();
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function toQueryValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => String(entry).trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized.join(",") : null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
