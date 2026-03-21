/**
 * Format elapsed milliseconds into a human-readable string.
 * <1s: "0.3s", seconds: "12.3s", ≥60s: "1m 23s"
 */
export function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = ms / 1000;
  const rounded = Math.round(totalSeconds * 10) / 10;
  if (rounded < 60) {
    return `${rounded.toFixed(1)}s`;
  }
  const totalWholeSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(totalWholeSeconds / 60);
  const seconds = totalWholeSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
