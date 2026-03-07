/**
 * JSON-Lines IPC Protocol
 *
 * Line-delimited JSON parser and formatter for stdin/stdout communication
 * between the Electron main process and the daemon subprocess.
 */

/**
 * Create a streaming line parser that buffers input and calls `onLine`
 * for each complete newline-terminated line. Handles partial chunks,
 * multi-line chunks, and empty lines.
 */
export function createLineParser(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) {
        onLine(line);
      }
    }
  };
}

/**
 * Format a message as a newline-terminated JSON string for IPC transmission.
 */
export function formatMessage(msg: unknown): string {
  return JSON.stringify(msg) + '\n';
}
