import { readFile } from "node:fs/promises";
import path from "node:path";

import { readTrackerConfig } from "./read-tracker-config.js";
import { GithubProjectsV2Adapter } from "./github-projects-v2/adapter.js";
import { LinearKataAdapter } from "./linear/adapter.js";

export async function resolveBackend(input: {
  workspacePath: string;
  githubClients: ConstructorParameters<typeof GithubProjectsV2Adapter>[0];
  linearClients: ConstructorParameters<typeof LinearKataAdapter>[0];
}) {
  const preferencesPath = path.join(input.workspacePath, ".kata", "preferences.md");
  const preferencesContent = await readFile(preferencesPath, "utf8");
  const config = await readTrackerConfig({ preferencesContent });

  return config.kind === "github"
    ? new GithubProjectsV2Adapter(input.githubClients)
    : new LinearKataAdapter(input.linearClients);
}
