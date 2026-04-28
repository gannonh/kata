/**
 * Linear Extension — Native Linear GraphQL client for Kata.
 *
 * Provides CRUD tools for Linear entities: teams, projects, milestones,
 * issues (with sub-issues), labels, documents, and workflow states.
 *
 * Auth: LINEAR_API_KEY env var (personal API key, no OAuth).
 * Tools only register when LINEAR_API_KEY is present — the extension
 * loads silently when unconfigured.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { LinearClient } from "./linear-client.js";
import { registerLinearTools } from "./linear-tools.js";

export { LinearClient } from "./linear-client.js";

export default function (pi: ExtensionAPI) {
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    // Silent — don't register tools, but don't error either.
    // The user can set LINEAR_API_KEY later via secure_env_collect.
    return;
  }

  const client = new LinearClient(apiKey);

  // Register all Linear CRUD tools
  registerLinearTools(pi, client);
}
