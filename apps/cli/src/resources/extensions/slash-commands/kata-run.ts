import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export default function kataRun(pi: ExtensionAPI) {
  pi.registerCommand("kata-run", {
    description: "Read KATA-WORKFLOW.md and execute — lightweight protocol-driven workflow",
    async handler(args: string, ctx: ExtensionCommandContext) {
      const workflowPath = process.env.KATA_WORKFLOW_PATH ?? join(process.env.HOME ?? "~", ".kata-cli", "KATA-WORKFLOW.md");

      let workflow: string;
      try {
        workflow = readFileSync(workflowPath, "utf-8");
      } catch {
        ctx.ui.notify(`Cannot read ${workflowPath}`, "error");
        return;
      }

      const userNote = (typeof args === "string" ? args : "").trim();
      const noteSection = userNote
        ? `\n\n## User Note\n\n${userNote}\n`
        : "";

      pi.sendMessage(
        {
          customType: "kata-run",
          content: `Read the following workflow protocol and execute exactly.\n\n${workflow}${noteSection}`,
          display: false,
        },
        { triggerTurn: true },
      );
    },
  });
}
