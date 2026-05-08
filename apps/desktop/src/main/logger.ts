import { createRequire } from 'node:module'

type Logger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

const noop = (..._args: unknown[]): void => {}

const fallbackLogger: Logger = {
  info: noop,
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  debug: noop,
}

let resolvedLogger: Logger = fallbackLogger

try {
  const require = createRequire(import.meta.url)
  const imported = require('electron-log/main') as { default?: Logger } | Logger
  const candidate = (imported as { default?: Logger }).default ?? (imported as Logger)

  if (
    candidate &&
    typeof candidate.info === 'function' &&
    typeof candidate.warn === 'function' &&
    typeof candidate.error === 'function' &&
    typeof candidate.debug === 'function'
  ) {
    resolvedLogger = candidate
  }
} catch {
  resolvedLogger = fallbackLogger
}

export default resolvedLogger
