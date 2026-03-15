/**
 * Backend factory — returns FileBackend or LinearBackend based on preferences.
 *
 * Separate file to avoid circular imports: backend.ts defines the interface,
 * this file imports both implementations.
 */

import type { KataBackend } from "./backend.js";
import {
  isLinearMode,
  loadEffectiveLinearProjectConfig,
  resolveConfiguredLinearTeamId,
} from "./linear-config.js";
import { LinearClient } from "../linear/linear-client.js";
import { ensureKataLabels } from "../linear/linear-entities.js";
import { FileBackend } from "./file-backend.js";
import { LinearBackend } from "./linear-backend.js";

/**
 * Create the appropriate backend for the current workflow mode.
 *
 * Async because LinearBackend config resolution requires API calls
 * (team ID resolution, label set lookup).
 *
 * Called once at the start of auto-mode or step-mode.
 */
export async function createBackend(basePath: string): Promise<KataBackend> {
  if (!isLinearMode()) {
    return new FileBackend(basePath);
  }

  const config = loadEffectiveLinearProjectConfig();
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is not set. Set it in your environment to use Linear mode.");
  }

  const { projectId } = config.linear;
  if (!projectId) {
    throw new Error("Linear project not configured. Set linear.projectId in .kata/preferences.md.");
  }

  const client = new LinearClient(apiKey);
  const teamResolution = await resolveConfiguredLinearTeamId(client);
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
}
