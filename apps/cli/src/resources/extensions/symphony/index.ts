import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createSymphonyClient } from "./client.js";
import { registerSymphonyCommand } from "./command.js";
import { registerSymphonyTools } from "./tools.js";

export default function (pi: ExtensionAPI): void {
  const client = createSymphonyClient();

  registerSymphonyCommand(pi, client);
  registerSymphonyTools(pi, client);
}
