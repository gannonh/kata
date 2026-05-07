import { KataDomainError } from "../../domain/errors.js";
import type { KataIssueStatus, KataSlice, KataTask } from "../../domain/types.js";

export type LinearStateKey = KataSlice["status"] | KataTask["status"] | KataIssueStatus;

export type LinearStateMapping = Record<
  "backlog" | "todo" | "in_progress" | "agent_review" | "human_review" | "merging" | "done",
  string
>;

export const DEFAULT_LINEAR_STATE_NAMES: LinearStateMapping = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  agent_review: "Agent Review",
  human_review: "Human Review",
  merging: "Merging",
  done: "Done",
};

export interface LinearTrackerConfig {
  kind: "linear";
  workspace: string;
  team: string;
  project: string;
  authEnv?: string;
  activeMilestoneId?: string;
  states: LinearStateMapping;
  labels: Record<string, string>;
}

const LINEAR_STATE_KEYS = Object.keys(DEFAULT_LINEAR_STATE_NAMES) as Array<keyof LinearStateMapping>;

export function cleanLinearString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  throw new KataDomainError("INVALID_CONFIG", `${fieldName} is required`);
}

export function optionalLinearString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function readLinearStateMapping(rawStates: unknown): LinearStateMapping {
  const states = { ...DEFAULT_LINEAR_STATE_NAMES };
  if (rawStates === null || typeof rawStates !== "object") return states;

  const stateRecord = rawStates as Record<string, unknown>;
  for (const key of LINEAR_STATE_KEYS) {
    if (Object.hasOwn(stateRecord, key)) {
      states[key] = cleanLinearString(stateRecord[key], `linear.states.${key}`);
    }
  }

  return states;
}

export function readLinearLabels(rawLabels: unknown): Record<string, string> {
  if (rawLabels === null || typeof rawLabels !== "object") return {};

  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawLabels as Record<string, unknown>)) {
    const label = optionalLinearString(value);
    if (label !== undefined) {
      labels[key] = label;
    }
  }

  return labels;
}

export function resolveLinearAuthToken(input: {
  authEnv?: string;
  env: Record<string, string | undefined>;
}): string | null {
  const candidateKeys = [input.authEnv, "LINEAR_API_KEY", "LINEAR_TOKEN"].filter(
    (key): key is string => key !== undefined && key.trim() !== "",
  );

  for (const key of candidateKeys) {
    const value = optionalLinearString(input.env[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return null;
}
