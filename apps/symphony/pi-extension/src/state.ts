export const STATE_ENTRY_TYPE = "symphony-extension-state";

export interface OwnedProcessMetadata {
  pid: number;
  command: string;
  cwd: string;
  baseUrl?: string;
  startedAt: string;
}

export interface LastKnownSymphonyState {
  baseUrl: string;
  trackerProjectUrl?: string;
  runningCount: number;
  retryCount: number;
  blockedCount: number;
  completedCount: number;
  pollingChecking: boolean;
  nextPollInMs: number;
  updatedAt: string;
}

export interface ExtensionState {
  binaryPath?: string;
  attachedBaseUrl?: string;
  ownedProcess?: OwnedProcessMetadata;
  console: {
    showDetails: boolean;
  };
  stopOwnedOnShutdown: boolean;
  lastKnownState?: LastKnownSymphonyState;
}

export function createDefaultState(): ExtensionState {
  return {
    console: { showDetails: true },
    stopOwnedOnShutdown: true,
  };
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("URL must not be empty");
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must use http or https");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

export function restoreStateFromEntries(entries: Array<{ type?: string; customType?: string; data?: unknown }>): ExtensionState {
  let state = createDefaultState();
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) continue;
    if (!isRecord(entry.data)) continue;
    state = restoreStateFromSnapshot(entry.data);
  }
  return state;
}

function restoreStateFromSnapshot(data: Record<string, unknown>): ExtensionState {
  const state = createDefaultState();
  if (typeof data.binaryPath === "string") state.binaryPath = data.binaryPath;
  if (isValidBaseUrl(data.attachedBaseUrl)) state.attachedBaseUrl = normalizeBaseUrl(data.attachedBaseUrl);
  if (typeof data.stopOwnedOnShutdown === "boolean") state.stopOwnedOnShutdown = data.stopOwnedOnShutdown;
  if (isRecord(data.console) && typeof data.console.showDetails === "boolean") {
    state.console.showDetails = data.console.showDetails;
  } else if (isRecord(data.dashboard) && typeof data.dashboard.showDetails === "boolean") {
    state.console.showDetails = data.dashboard.showDetails;
  }
  if (isOwnedProcessMetadata(data.ownedProcess)) {
    state.ownedProcess = {
      ...data.ownedProcess,
      baseUrl: data.ownedProcess.baseUrl ? normalizeBaseUrl(data.ownedProcess.baseUrl) : undefined,
    };
  }
  if (isLastKnownSymphonyState(data.lastKnownState)) {
    state.lastKnownState = {
      ...data.lastKnownState,
      baseUrl: normalizeBaseUrl(data.lastKnownState.baseUrl),
    };
  }
  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOwnedProcessMetadata(value: unknown): value is OwnedProcessMetadata {
  return (
    isRecord(value) &&
    isPositiveInteger(value.pid) &&
    typeof value.command === "string" &&
    typeof value.cwd === "string" &&
    (value.baseUrl === undefined || isValidBaseUrl(value.baseUrl)) &&
    typeof value.startedAt === "string"
  );
}

function isLastKnownSymphonyState(value: unknown): value is LastKnownSymphonyState {
  return (
    isRecord(value) &&
    isValidBaseUrl(value.baseUrl) &&
    (value.trackerProjectUrl === undefined || typeof value.trackerProjectUrl === "string") &&
    isFiniteNumber(value.runningCount) &&
    isFiniteNumber(value.retryCount) &&
    isFiniteNumber(value.blockedCount) &&
    isFiniteNumber(value.completedCount) &&
    typeof value.pollingChecking === "boolean" &&
    isFiniteNumber(value.nextPollInMs) &&
    typeof value.updatedAt === "string"
  );
}

function isValidBaseUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    normalizeBaseUrl(value);
    return true;
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function snapshotStateForPersistence(state: ExtensionState): ExtensionState {
  return {
    binaryPath: state.binaryPath,
    attachedBaseUrl: state.attachedBaseUrl,
    ownedProcess: state.ownedProcess,
    console: { ...state.console },
    stopOwnedOnShutdown: state.stopOwnedOnShutdown,
    lastKnownState: state.lastKnownState,
  };
}
