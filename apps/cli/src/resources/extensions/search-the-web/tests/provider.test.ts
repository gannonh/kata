import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { resolveSearchProvider, getTavilyApiKey, getBraveApiKey, braveHeaders } from '../provider.js'

describe('provider', () => {
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = {
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      BRAVE_API_KEY: process.env.BRAVE_API_KEY,
      SEARCH_PROVIDER: process.env.SEARCH_PROVIDER,
    }
    delete process.env.TAVILY_API_KEY
    delete process.env.BRAVE_API_KEY
    delete process.env.SEARCH_PROVIDER
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  describe('resolveSearchProvider', () => {
    test('auto with both keys prefers tavily', () => {
      process.env.TAVILY_API_KEY = 'tk'
      process.env.BRAVE_API_KEY = 'bk'
      expect(resolveSearchProvider()).toBe('tavily')
    })

    test('auto with only brave key returns brave', () => {
      process.env.BRAVE_API_KEY = 'bk'
      expect(resolveSearchProvider()).toBe('brave')
    })

    test('auto with only tavily key returns tavily', () => {
      process.env.TAVILY_API_KEY = 'tk'
      expect(resolveSearchProvider()).toBe('tavily')
    })

    test('no keys returns null', () => {
      expect(resolveSearchProvider()).toBeNull()
    })

    test('SEARCH_PROVIDER=brave overrides auto preference', () => {
      process.env.TAVILY_API_KEY = 'tk'
      process.env.BRAVE_API_KEY = 'bk'
      process.env.SEARCH_PROVIDER = 'brave'
      expect(resolveSearchProvider()).toBe('brave')
    })

    test('SEARCH_PROVIDER=tavily with missing tavily key falls back to brave', () => {
      process.env.BRAVE_API_KEY = 'bk'
      process.env.SEARCH_PROVIDER = 'tavily'
      expect(resolveSearchProvider()).toBe('brave')
    })

    test('override parameter takes priority over env', () => {
      process.env.TAVILY_API_KEY = 'tk'
      process.env.BRAVE_API_KEY = 'bk'
      process.env.SEARCH_PROVIDER = 'tavily'
      expect(resolveSearchProvider('brave')).toBe('brave')
    })

    test('invalid override falls back to auto', () => {
      process.env.TAVILY_API_KEY = 'tk'
      expect(resolveSearchProvider('invalid')).toBe('tavily')
    })

    test('brave preference with missing brave key falls back to tavily', () => {
      process.env.TAVILY_API_KEY = 'tk'
      expect(resolveSearchProvider('brave')).toBe('tavily')
    })
  })

  describe('getTavilyApiKey', () => {
    test('returns key when set', () => {
      process.env.TAVILY_API_KEY = 'my-key'
      expect(getTavilyApiKey()).toBe('my-key')
    })
    test('returns empty string when unset', () => {
      expect(getTavilyApiKey()).toBe('')
    })
  })

  describe('getBraveApiKey', () => {
    test('returns key when set', () => {
      process.env.BRAVE_API_KEY = 'bk'
      expect(getBraveApiKey()).toBe('bk')
    })
    test('returns empty string when unset', () => {
      expect(getBraveApiKey()).toBe('')
    })
  })

  describe('braveHeaders', () => {
    test('includes subscription token from env', () => {
      process.env.BRAVE_API_KEY = 'test-token'
      const h = braveHeaders()
      expect(h['X-Subscription-Token']).toBe('test-token')
      expect(h['Accept']).toBe('application/json')
    })
  })
})
