import { readFile } from "node:fs/promises";

import { createKataDomainApi } from "./domain/service.js";
import { resolveBackend } from "./backends/resolve-backend.js";
import { detectHarness } from "./commands/setup.js";
import { renderDoctorReport } from "./commands/doctor.js";
import { runJsonCommand } from "./transports/json.js";

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;

  if (command === "setup") {
    const harness = detectHarness(process.env);
    process.stdout.write(`${JSON.stringify({ ok: true, harness })}\n`);
    return;
  }

  if (command === "doctor") {
    const report = renderDoctorReport({
      packageVersion: "0.0.0-dev",
      backendConfigStatus: "ok",
      backendConfigMessage: "Config parsing available",
      harness: detectHarness(process.env),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  if (command === "json") {
    const request = JSON.parse(await readFile(rest[0]!, "utf8"));
    const adapter = await resolveBackend({
      workspacePath: process.cwd(),
      githubClients: { fetchProjectSnapshot: async () => ({ columns: [] }) },
      linearClients: {
        fetchActiveMilestoneSnapshot: async () => ({ columns: [] }),
        fetchDocumentByTitle: async () => null,
      },
    });
    const api = createKataDomainApi(adapter);
    process.stdout.write(`${await runJsonCommand(request, api)}\n`);
    return;
  }

  process.stdout.write([
    "Usage:",
    "  kata setup",
    "  kata doctor",
    "  kata json <request.json>",
  ].join("\n") + "\n");
}

void main();
