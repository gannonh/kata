/**
 * Backend factory — creates the LinearBackend.
 *
 * Separate file to avoid circular imports: backend.ts defines the interface,
 * this file imports the implementation.
 */

import type { KataBackend } from "./backend.js";
import {
  loadEffectiveLinearProjectConfig,
  resolveConfiguredLinearProjectId,
  resolveConfiguredLinearTeamId,
} from "./linear-config.js";
import { loadEffectiveKataPreferences } from "./preferences.js";
import { LinearClient } from "../linear/linear-client.js";
import { ensureKataLabels } from "../linear/linear-entities.js";
import { LinearBackend } from "./linear-backend.js";

/**
 * Create the Linear backend.
 *
 * Async because LinearBackend config resolution requires API calls
 * (team ID resolution, label set lookup).
 *
 * Called once at the start of auto-mode or step-mode.
 */
export async function createBackend(basePath: string): Promise<KataBackend> {
  const loadedPreferences = loadEffectiveKataPreferences(basePath);
  const config = loadEffectiveLinearProjectConfig(loadedPreferences);
  const apiKey = process.env.KATA_LINEAR_API_KEY ?? process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is not set. Set it in your environment to use Linear mode (KATA_LINEAR_API_KEY or LINEAR_API_KEY).");
  }

  const client = new LinearClient(apiKey);

  // Resolve projectId slug → UUID if needed (filter expressions require UUIDs).
  const projectResolution = await resolveConfiguredLinearProjectId(client, loadedPreferences);
  if (!projectResolution.projectId) {
    throw new Error(projectResolution.error ?? "Linear project not configured. Set linear.projectSlug in .kata/preferences.md.");
  }
  const projectId = projectResolution.projectId;

  // Retry API calls up to 3 times with backoff — Linear API can be transiently unavailable.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const teamResolution = await resolveConfiguredLinearTeamId(
        client,
        loadedPreferences,
      );
      if (!teamResolution.teamId) {
        throw new Error(teamResolution.error ?? "Linear team could not be resolved. Check linear.teamId or linear.teamKey in preferences.");
      }

      const labelSet = await ensureKataLabels(client, teamResolution.teamId);

      return new LinearBackend(basePath, {
        apiKey,
        projectId,
        teamId: teamResolution.teamId,
        sliceLabelId: labelSet.slice.id,
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Don't retry config errors — they won't resolve on retry.
      // Rate-limit errors ARE retriable (backoff handles the wait).
      if (msg.includes("not set") || msg.includes("not configured") || msg.includes("could not be resolved")) {
        throw err;
      }
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("LinearBackend initialization failed after retries");
}
