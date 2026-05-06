import { KataDomainError } from "../../domain/errors.js";
import type { KataIssueStatus, KataSlice, KataTask } from "../../domain/types.js";

export type LinearStateKey = KataSlice["status"] | KataTask["status"] | KataIssueStatus;

export type LinearStateMapping = Record<LinearStateKey, string>;

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

export function cleanLinearString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  throw new KataDomainError("INVALID_CONFIG", `${fieldName} is required`);
}

export function optionalLinearString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function readLinearStateMapping(rawStates: Record<string, unknown>): LinearStateMapping {
  const states = { ...DEFAULT_LINEAR_STATE_NAMES };
  for (const key of Object.keys(DEFAULT_LINEAR_STATE_NAMES) as Array<keyof LinearStateMapping>) {
    if (rawStates[key] === undefined) continue;
    states[key] = cleanLinearString(rawStates[key], `linear.states.${key}`);
  }
  return states;
}

export function readLinearLabels(rawLabels: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(rawLabels)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
      .map(([key, value]) => [key, value.trim()]),
  );
}

export function resolveLinearAuthToken(input: {
  authEnv?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): string | null {
  const env = input.env ?? process.env;

  if (input.authEnv) {
    const configured = env[input.authEnv]?.trim();
    if (!configured) {
      throw new KataDomainError("INVALID_CONFIG", `Linear auth env var ${input.authEnv} is configured but not set.`);
    }
    return configured;
  }

  const candidates = [env.LINEAR_API_KEY, env.LINEAR_TOKEN];
  for (const value of candidates) {
    const token = value?.trim();
    if (token) return token;
  }
  return null;
}
