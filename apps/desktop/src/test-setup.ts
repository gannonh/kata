/**
 * Vitest global setup file — strips host-level Symphony env vars from process.env
 * before any test file executes.
 *
 * This prevents host-specific values (e.g. a developer's local KATA_SYMPHONY_BIN_PATH)
 * from leaking into tests via `...process.env` spreads, ensuring deterministic results
 * regardless of the developer's shell environment.
 *
 * Registered in vitest.config.ts → test.setupFiles.
 *
 * @see https://linear.app/kata-sh/issue/KAT-2476 (R029)
 */

const SYMPHONY_ENV_VARS_TO_STRIP = [
  'KATA_SYMPHONY_BIN_PATH',
  'KATA_SYMPHONY_URL',
  'SYMPHONY_URL',
] as const

for (const key of SYMPHONY_ENV_VARS_TO_STRIP) {
  if (key in process.env) {
    // eslint-disable-next-line no-console
    console.info(`[test-setup] stripping host env var: ${key}`)
    delete process.env[key]
  }
}
