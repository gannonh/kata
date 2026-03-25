/* eslint-disable no-console */
/**
 * Output formatters for the kata-context CLI.
 *
 * Three modes:
 * - JSON: structured data to stdout (for programmatic consumption)
 * - Quiet: minimal one-per-line output (for scripting)
 * - Human: formatted tables, headers, key-value pairs (default)
 */

import type { SemanticRunDiagnostics } from "./types.js";
import { semanticHintOrDefault } from "./semantic/hints.js";

// ── Types ──

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

// ── JSON output ──

/**
 * Write structured data as pretty-printed JSON to stdout.
 */
export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// ── Quiet output ──

/**
 * Write one item per line to stdout with no decoration.
 */
export function outputQuiet(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

// ── Human-readable formatting helpers ──

/**
 * Format a section header with underline.
 */
export function formatHeader(text: string): string {
  return `\n${text}\n${"─".repeat(text.length)}`;
}

/**
 * Format key-value pairs as aligned output.
 *
 * Example:
 *   Symbols:  42
 *   Edges:    18
 *   Files:    5
 */
export function formatKeyValue(pairs: Array<[string, string | number]>): string {
  if (pairs.length === 0) return "";
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  return pairs
    .map(([key, value]) => `  ${key.padEnd(maxKeyLen)}  ${value}`)
    .join("\n");
}

/**
 * Format a simple table with headers and rows.
 *
 * Columns are auto-sized to fit the widest value.
 * All content is left-aligned.
 */
export function formatTable(
  headers: string[],
  rows: string[][],
): string {
  if (rows.length === 0) return "  (no results)";

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce(
      (max, row) => Math.max(max, (row[i] ?? "").length),
      0,
    );
    return Math.max(h.length, maxData);
  });

  // Build header line
  const headerLine = headers
    .map((h, i) => h.padEnd(colWidths[i]!))
    .join("  ");

  // Build separator
  const separator = colWidths.map((w) => "─".repeat(w)).join("──");

  // Build data rows
  const dataLines = rows.map((row) =>
    headers.map((_, i) => (row[i] ?? "").padEnd(colWidths[i]!)).join("  "),
  );

  return ["  " + headerLine, "  " + separator, ...dataLines.map((l) => "  " + l)].join(
    "\n",
  );
}

// ── Semantic diagnostics formatters ──

export function formatSemanticDiagnosticHint(errorCode?: string): string {
  return semanticHintOrDefault(errorCode);
}

export function formatSemanticDiagnostics(
  semantic: SemanticRunDiagnostics | undefined,
): string {
  if (!semantic) {
    return [
      formatHeader("Semantic Diagnostics"),
      "  Semantic stage did not run in this index pass.",
    ].join("\n");
  }

  const lines: string[] = [];
  lines.push(formatHeader("Semantic Diagnostics"));
  lines.push(
    formatKeyValue([
      ["Status", semantic.status],
      ["Phase", semantic.phase],
      ["Provider", semantic.provider],
      ["Retryable", semantic.retryable ? "yes" : "no"],
      ["Timestamp", semantic.timestamp],
      ["Error code", semantic.errorCode ?? "(none)"],
    ]),
  );

  if (semantic.hint) {
    lines.push(`  Hint: ${semantic.hint}`);
  }

  if (semantic.message) {
    lines.push(`  Message: ${semantic.message}`);
  }

  return lines.join("\n");
}

// ── Dispatcher ──

/**
 * Output data based on the active output mode.
 *
 * @param data - The structured data (used for JSON mode)
 * @param quietLines - Lines to print in quiet mode
 * @param humanFn - Function that returns human-readable output string
 * @param options - Which output mode is active
 */
export function output(
  data: unknown,
  quietLines: string[],
  humanFn: () => string,
  options: OutputOptions,
): void {
  if (options.json) {
    outputJson(data);
  } else if (options.quiet) {
    outputQuiet(quietLines);
  } else {
    console.log(humanFn());
  }
}
