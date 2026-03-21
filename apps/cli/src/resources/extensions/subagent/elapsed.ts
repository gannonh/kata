/**
 * Format elapsed milliseconds into a human-readable string.
 * <1s: "0.3s", seconds: "12.3s", ≥60s: "1m 23s"
 */
export function formatElapsed(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}
