import { afterEach, describe, expect, test, vi } from 'vitest'

type LoggerLike = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

async function loadLoggerWithRequire(requireImpl: (specifier: string) => unknown): Promise<LoggerLike> {
  vi.resetModules()
  vi.doMock('node:module', () => ({
    createRequire: () => requireImpl,
  }))

  const module = await import('../logger')
  vi.doUnmock('node:module')
  return module.default as LoggerLike
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('node:module')
})

describe('logger', () => {
  test('default export is a Logger object with info/warn/error/debug methods', async () => {
    const candidate: LoggerLike = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }

    const logger = await loadLoggerWithRequire(() => candidate)

    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.debug).toBe('function')

    logger.info('hello')
    logger.warn('warn')
    logger.error('error')
    logger.debug('debug')

    expect(candidate.info).toHaveBeenCalledWith('hello')
    expect(candidate.warn).toHaveBeenCalledWith('warn')
    expect(candidate.error).toHaveBeenCalledWith('error')
    expect(candidate.debug).toHaveBeenCalledWith('debug')
  })

  test('fallback logger makes info/debug no-ops and delegates warn/error to console', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const logger = await loadLoggerWithRequire(() => {
      throw new Error('Cannot find module electron-log/main')
    })

    logger.info('silent-info')
    logger.debug('silent-debug')
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()

    logger.warn('warn-message', { code: 123 })
    logger.error('error-message', new Error('boom'))

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('warn-message', { code: 123 })

    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith('error-message', expect.any(Error))
  })

  test('falls back when electron-log import returns an invalid shape', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const logger = await loadLoggerWithRequire(() => ({ info: () => {} }))

    logger.warn('still-fallback')
    expect(warnSpy).toHaveBeenCalledWith('still-fallback')
  })
})
