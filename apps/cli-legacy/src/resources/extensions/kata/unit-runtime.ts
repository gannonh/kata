import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { kataRoot } from "./paths.ts";

export type UnitRuntimePhase =
  | "dispatched"
  | "wrapup-warning-sent"
  | "timeout"
  | "recovered"
  | "finalized"
  | "paused"
  | "skipped";

export interface AutoUnitRuntimeRecord {
  version: 1;
  unitType: string;
  unitId: string;
  startedAt: number;
  updatedAt: number;
  phase: UnitRuntimePhase;
  wrapupWarningSent: boolean;
  timeoutAt: number | null;
  lastProgressAt: number;
  progressCount: number;
  lastProgressKind: string;
  recovery?: unknown;
  recoveryAttempts?: number;
  lastRecoveryReason?: "idle" | "hard";
}

function runtimeDir(basePath: string): string {
  return join(kataRoot(basePath), "runtime", "units");
}

function runtimePath(basePath: string, unitType: string, unitId: string): string {
  return join(runtimeDir(basePath), `${unitType}-${unitId.replace(/[\/]/g, "-")}.json`);
}

export function writeUnitRuntimeRecord(
  basePath: string,
  unitType: string,
  unitId: string,
  startedAt: number,
  updates: Partial<AutoUnitRuntimeRecord> = {},
): AutoUnitRuntimeRecord {
  const dir = runtimeDir(basePath);
  mkdirSync(dir, { recursive: true });
  const path = runtimePath(basePath, unitType, unitId);
  const prev = readUnitRuntimeRecord(basePath, unitType, unitId);
  const next: AutoUnitRuntimeRecord = {
    version: 1,
    unitType,
    unitId,
    startedAt,
    updatedAt: Date.now(),
    phase: updates.phase ?? prev?.phase ?? "dispatched",
    wrapupWarningSent: updates.wrapupWarningSent ?? prev?.wrapupWarningSent ?? false,
    timeoutAt: updates.timeoutAt ?? prev?.timeoutAt ?? null,
    lastProgressAt: updates.lastProgressAt ?? prev?.lastProgressAt ?? Date.now(),
    progressCount: updates.progressCount ?? prev?.progressCount ?? 0,
    lastProgressKind: updates.lastProgressKind ?? prev?.lastProgressKind ?? "dispatch",
    recovery: updates.recovery ?? prev?.recovery,
    recoveryAttempts: updates.recoveryAttempts ?? prev?.recoveryAttempts ?? 0,
    lastRecoveryReason: updates.lastRecoveryReason ?? prev?.lastRecoveryReason,
  };
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
}

export function readUnitRuntimeRecord(basePath: string, unitType: string, unitId: string): AutoUnitRuntimeRecord | null {
  const path = runtimePath(basePath, unitType, unitId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as AutoUnitRuntimeRecord;
  } catch {
    return null;
  }
}

export function clearUnitRuntimeRecord(basePath: string, unitType: string, unitId: string): void {
  const path = runtimePath(basePath, unitType, unitId);
  if (existsSync(path)) unlinkSync(path);
}
