/**
 * Kata header rendering — shared between index.ts (session_start) and
 * commands.ts (post-onboarding clear).
 *
 * Separated to avoid a circular dependency between index.ts and commands.ts.
 */

import { Text } from "@mariozechner/pi-tui";

// ── ASCII logo ────────────────────────────────────────────────────────────
const KATA_LOGO_LINES = [
  "  ██╗  ██╗ █████╗ ████████╗ █████╗ ",
  "  ██║ ██╔╝██╔══██╗╚══██╔══╝██╔══██╗",
  "  █████╔╝ ███████║   ██║   ███████║",
  "  ██╔═██╗ ██╔══██║   ██║   ██╔══██║",
  "  ██║  ██╗██║  ██║   ██║   ██║  ██║",
  "  ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝",
];

interface HeaderCtx {
  ui: {
    theme: any;
    setHeader: (factory: (ui: any, theme: any) => any) => void;
  };
}

let _headerCtx: HeaderCtx | null = null;

/** Store the context for future header re-renders. Called once from session_start. */
export function setHeaderCtx(ctx: HeaderCtx): void {
  _headerCtx = ctx;
}

/** Clear the stored context. Useful for testing or session teardown to prevent stale references. */
export function resetHeaderCtx(): void {
  _headerCtx = null;
}

/** Render (or re-render) the Kata header. Pass `showHint: true` to include the getting-started line. */
export function renderHeader(showHint: boolean): void {
  if (!_headerCtx) return;
  const theme = _headerCtx.ui.theme;
  const version = process.env.KATA_VERSION || "0.0.0";

  const logoText = KATA_LOGO_LINES.map((line: string) =>
    theme.fg("accent", line),
  ).join("\n");
  const titleLine = `  ${theme.bold("Kata CLI")} ${theme.fg("dim", `v${version}`)}`;
  const hintLine = showHint
    ? `\n\n  ${theme.fg("dim", "Run")} ${theme.fg("accent", "/kata")} ${theme.fg("dim", "to get started.")}`
    : "";

  const headerContent = `\n${logoText}\n${titleLine}${hintLine}`;
  _headerCtx.ui.setHeader((_ui: any, _theme: any) => new Text(headerContent, 1, 0));
}

/**
 * Re-render the header without the getting-started hint.
 * Call after onboarding completes to remove the stale message.
 */
export function clearHeaderHint(): void {
  renderHeader(false);
}
