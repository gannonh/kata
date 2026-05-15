import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSymphonyCommands, setSymphonyStatus } from "./commands.ts";
import { SymphonyRuntime } from "./runtime.ts";
import { registerSymphonyTools } from "./tools.ts";

export default function symphonyExtension(pi: ExtensionAPI): void {
  const runtime = new SymphonyRuntime();

  pi.on("session_start", async (_event, ctx) => {
    runtime.restore(ctx);
    setSymphonyStatus(ctx, runtime);
  });

  pi.on("session_shutdown", async () => {
    const hadOwnedProcess = runtime.state.stopOwnedOnShutdown && Boolean(runtime.state.ownedProcess);
    const ownedBaseUrl = runtime.state.stopOwnedOnShutdown ? runtime.state.ownedProcess?.baseUrl : undefined;
    try {
      await runtime.processManager.shutdown();
    } finally {
      runtime.clearAttachmentIfBaseUrl(ownedBaseUrl);
      if (hadOwnedProcess) runtime.persist(pi);
    }
  });

  registerSymphonyCommands(pi, runtime);
  registerSymphonyTools(pi, runtime);
}
