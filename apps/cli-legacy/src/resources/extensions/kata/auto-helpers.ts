/**
 * Pure helper functions extracted from auto.ts for testability.
 * These have no side effects and no heavy imports.
 */

import { resolveModelForUnit } from "./preferences.js";

// ─── Model switching ──────────────────────────────────────────────────────────

export interface ModelSwitchResult {
  /** What to do: "switch" = found in registry, "not-found" = preferred but missing, "none" = no preference */
  action: "switch" | "not-found" | "none";
  /** The model ID from preferences (if any) */
  preferredModelId?: string;
  /** Available model IDs (for "not-found" messages) */
  availableModels: string[];
  /** Status bar label to set */
  statusLabel?: string;
}

/**
 * Pure function: given a unit type, the available model IDs, and the current
 * model ID, compute what model-switch action to take.
 */
export function resolveModelSwitch(
  unitType: string,
  availableModelIds: string[],
  currentModelId: string | undefined,
): ModelSwitchResult {
  const preferredModelId = resolveModelForUnit(unitType);
  if (!preferredModelId) {
    return { action: "none", availableModels: availableModelIds };
  }
  const found = availableModelIds.includes(preferredModelId);
  const statusLabel =
    preferredModelId === currentModelId
      ? `auto · ${preferredModelId}`
      : "auto";

  if (found) {
    return {
      action: "switch",
      preferredModelId,
      availableModels: availableModelIds,
      statusLabel,
    };
  }
  return {
    action: "not-found",
    preferredModelId,
    availableModels: availableModelIds,
    statusLabel,
  };
}

// ─── Supervisor timeouts ──────────────────────────────────────────────────────

/**
 * Pure function: compute timeout milliseconds from supervisor config.
 */
export function computeSupervisorTimeouts(config: {
  soft_timeout_minutes: number;
  idle_timeout_minutes: number;
  hard_timeout_minutes: number;
}): { softMs: number; idleMs: number; hardMs: number } {
  return {
    softMs: config.soft_timeout_minutes * 60 * 1000,
    idleMs: config.idle_timeout_minutes * 60 * 1000,
    hardMs: config.hard_timeout_minutes * 60 * 1000,
  };
}
