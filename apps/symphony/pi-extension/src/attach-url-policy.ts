const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function assertLoopbackAttachUrl(url: string): void {
  const parsed = new URL(url.trim());
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if ((parsed.protocol === "http:" || parsed.protocol === "https:") && LOOPBACK_HOSTS.has(hostname)) {
    return;
  }

  throw new Error("Symphony attach URL must use http or https on a loopback host: 127.0.0.1, localhost, or ::1");
}
