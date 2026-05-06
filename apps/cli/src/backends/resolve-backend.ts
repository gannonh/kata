import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { KataDomainError } from "../domain/errors.js";
import type { KataBackendAdapter } from "../domain/types.js";
import { GithubProjectsV2Adapter } from "./github-projects-v2/adapter.js";
import { createGithubClient } from "./github-projects-v2/client.js";
import { LinearKataAdapter } from "./linear/adapter.js";
import { createLinearClient } from "./linear/client.js";
import { resolveLinearAuthToken } from "./linear/config.js";
import { readTrackerConfig } from "./read-tracker-config.js";

const execFileAsync = promisify(execFile);

export function resolveGithubToken(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const value of [env.GITHUB_TOKEN, env.GH_TOKEN]) {
    const token = value?.trim();
    if (token) return token;
  }
  return null;
}

export async function resolveGithubTokenForRuntime(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const envToken = resolveGithubToken(env);
  if (envToken) return envToken;

  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], { env, timeout: 5000 });
    const token = stdout.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function resolveBackend(input: {
  workspacePath: string;
  env?: NodeJS.ProcessEnv;
  githubClients?: ReturnType<typeof createGithubClient>;
  linearClient?: ReturnType<typeof createLinearClient>;
}): Promise<KataBackendAdapter> {
  const preferencesPath = path.join(input.workspacePath, ".kata", "preferences.md");
  const preferencesContent = await readFile(preferencesPath, "utf8");
  const config = await readTrackerConfig({ preferencesContent });

  if (config.kind === "github") {
    const token = await resolveGithubTokenForRuntime(input.env);
    const client = input.githubClients ?? (token ? createGithubClient({ token }) : null);
    if (!client) {
      throw new KataDomainError(
        "UNAUTHORIZED",
        "GitHub mode requires GITHUB_TOKEN/GH_TOKEN or `gh auth login` access to the configured GitHub Project v2.",
      );
    }

    return new GithubProjectsV2Adapter({
      owner: config.repoOwner,
      repo: config.repoName,
      projectNumber: config.githubProjectNumber,
      workspacePath: input.workspacePath,
      client,
    });
  }

  const token = resolveLinearAuthToken({ authEnv: config.authEnv, env: input.env });
  const client = input.linearClient ?? (token ? createLinearClient({ token }) : null);
  if (!client) {
    throw new KataDomainError(
      "UNAUTHORIZED",
      "Linear mode requires LINEAR_API_KEY/LINEAR_TOKEN or the env var configured by linear.authEnv.",
    );
  }

  return new LinearKataAdapter({
    client,
    config,
    workspacePath: input.workspacePath,
  });
}
