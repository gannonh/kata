/**
 * Kata Debug Logger
 *
 * Structured append-only debug log for auto-mode orchestration.
 * Activated by KATA_DEBUG=1 (or any truthy value).
 * Writes to .kata/debug.log in the project directory.
 *
 * All orchestration events — dispatch decisions, state transitions,
 * agent_end signals, model switches, errors — are captured here.
 * The activity JSONL captures what the LLM said; this captures
 * what the dispatch layer did.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

let logPath: string | null = null;
let enabled = false;

/**
 * Initialize the debug logger for a project directory.
 * Call once at auto-mode start. No-op if KATA_DEBUG is not set.
 */
export function initDebugLog(basePath: string): void {
  const envVal = process.env.KATA_DEBUG;
  enabled = !!envVal && envVal !== "0" && envVal !== "false";
  if (!enabled) {
    logPath = null;
    return;
  }

  const kataDir = join(basePath, ".kata");
  mkdirSync(kataDir, { recursive: true });
  logPath = join(kataDir, "debug.log");

  // Session separator
  const sep = `\n${"─".repeat(60)}\n`;
  const header = `${sep}[auto-start] ${iso()} pid=${process.pid}\n`;
  try {
    appendFileSync(logPath, header, "utf-8");
  } catch {
    // If we can't write, disable silently
    enabled = false;
    logPath = null;
  }
}

/**
 * Tear down the debug logger. Called on auto-mode stop.
 */
export function closeDebugLog(): void {
  if (enabled && logPath) {
    write("auto-stop", {});
  }
  logPath = null;
  // Don't reset `enabled` — let initDebugLog control that
}

/**
 * Log a structured event. No-op if debug logging is disabled.
 *
 * @param event - Short event name (e.g. "dispatch", "agent-end", "error")
 * @param data  - Key-value pairs to log
 */
export function dlog(
  event: string,
  data: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!enabled || !logPath) return;
  write(event, data);
}

/**
 * Check if debug logging is currently active.
 */
export function isDebugLogEnabled(): boolean {
  return enabled;
}

// ─── Internals ────────────────────────────────────────────────────────────

function iso(): string {
  return new Date().toISOString();
}

function write(
  event: string,
  data: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!logPath) return;

  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.includes(" ")) {
      parts.push(`${k}="${v}"`);
    } else {
      parts.push(`${k}=${v}`);
    }
  }

  const line = `${iso()} [${event}] ${parts.join(" ")}\n`;
  try {
    appendFileSync(logPath, line, "utf-8");
  } catch {
    // Never let logging break auto-mode
  }
}
