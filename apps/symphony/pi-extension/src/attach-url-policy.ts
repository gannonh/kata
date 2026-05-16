import { SymphonyExtensionError } from "./errors.ts";
import type { OwnedProcessMetadata } from "./state.ts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function resolveAttachUrl(url: string | undefined, ownedProcess: OwnedProcessMetadata | undefined): string {
  const trimmedUrl = url?.trim();
  if (trimmedUrl) return trimmedUrl;
  if (ownedProcess?.baseUrl) return ownedProcess.baseUrl;
  throw new SymphonyExtensionError(
    "no_attachment",
    "No Symphony URL provided and no Pi-owned Symphony server is running. Use /symphony:start or /symphony:attach <url>.",
  );
}

export function assertLoopbackAttachUrl(url: string): void {
  const parsed = new URL(url.trim());
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if ((parsed.protocol === "http:" || parsed.protocol === "https:") && LOOPBACK_HOSTS.has(hostname)) {
    return;
  }

  throw new Error("Symphony attach URL must use http or https on a loopback host: 127.0.0.1, localhost, or ::1");
}
