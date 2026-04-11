import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS hook, can only be loaded through require
const afterSign = require('../afterSign.cjs') as (context: { electronPlatformName: string }) => Promise<void>

const REQUIRED_ENV = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'] as const

describe('electron-builder afterSign gate', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of REQUIRED_ENV) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
    originalEnv.KATA_SKIP_NOTARIZE = process.env.KATA_SKIP_NOTARIZE
    delete process.env.KATA_SKIP_NOTARIZE
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  test('is a no-op on non-darwin builds', async () => {
    await expect(afterSign({ electronPlatformName: 'linux' })).resolves.toBeUndefined()
    await expect(afterSign({ electronPlatformName: 'win32' })).resolves.toBeUndefined()
  })

  test('throws a descriptive error on darwin when any notarization env var is missing', async () => {
    await expect(afterSign({ electronPlatformName: 'darwin' })).rejects.toThrow(
      /APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID/,
    )

    process.env.APPLE_ID = 'user@example.com'
    process.env.APPLE_APP_SPECIFIC_PASSWORD = 'abcd-efgh-ijkl-mnop'
    await expect(afterSign({ electronPlatformName: 'darwin' })).rejects.toThrow(/APPLE_TEAM_ID/)
  })

  test('rejects whitespace-only credentials', async () => {
    process.env.APPLE_ID = 'user@example.com'
    process.env.APPLE_APP_SPECIFIC_PASSWORD = 'abcd-efgh-ijkl-mnop'
    process.env.APPLE_TEAM_ID = '   '
    await expect(afterSign({ electronPlatformName: 'darwin' })).rejects.toThrow(/APPLE_TEAM_ID/)
  })

  test('passes when all credentials are present', async () => {
    process.env.APPLE_ID = 'user@example.com'
    process.env.APPLE_APP_SPECIFIC_PASSWORD = 'abcd-efgh-ijkl-mnop'
    process.env.APPLE_TEAM_ID = 'TEAMID1234'
    await expect(afterSign({ electronPlatformName: 'darwin' })).resolves.toBeUndefined()
  })

  test('KATA_SKIP_NOTARIZE=1 prints a loud warning and allows the build through', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      process.env.KATA_SKIP_NOTARIZE = '1'
      await expect(afterSign({ electronPlatformName: 'darwin' })).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalled()
      const warnMessage = warnSpy.mock.calls[0]?.[0]
      expect(typeof warnMessage === 'string' && warnMessage).toMatch(/KATA_SKIP_NOTARIZE/)
      expect(typeof warnMessage === 'string' && warnMessage).toMatch(/NOT notarized/)
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('KATA_SKIP_NOTARIZE takes precedence over missing credentials', async () => {
    process.env.KATA_SKIP_NOTARIZE = '1'
    // Secrets intentionally absent — the escape hatch should still allow the build
    await expect(afterSign({ electronPlatformName: 'darwin' })).resolves.toBeUndefined()
  })

  test('KATA_SKIP_NOTARIZE values other than exactly "1" do not activate the escape hatch', async () => {
    process.env.KATA_SKIP_NOTARIZE = 'true'
    await expect(afterSign({ electronPlatformName: 'darwin' })).rejects.toThrow(/APPLE_ID/)
  })
})
