import { SymphonyExtensionError } from "./errors.ts";
import type { SymphonyRuntime } from "./runtime.ts";

export async function cleanupAbortedStart(runtime: SymphonyRuntime, baseUrl: string): Promise<void> {
  try {
    await runtime.processManager.stopOwned();
  } catch (error) {
    if (!(error instanceof SymphonyExtensionError && error.kind === "not_owned")) throw error;
  }
  runtime.clearAttachmentIfBaseUrl(baseUrl);
}
