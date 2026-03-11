import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import createSlashCommand from "./create-slash-command.js";
import createExtension from "./create-extension.js";
import auditCommand from "./audit.js";
import gsdRun from "./gsd-run.js";

export default function slashCommands(pi: ExtensionAPI) {
  createSlashCommand(pi);
  createExtension(pi);
  auditCommand(pi);
  gsdRun(pi);
}
