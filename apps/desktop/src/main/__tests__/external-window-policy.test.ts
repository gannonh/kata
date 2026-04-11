import { describe, expect, test } from 'vitest'
import { evaluateExternalWindowRequest } from '../external-window-policy'

describe('evaluateExternalWindowRequest', () => {
  test('allows http and https URLs', () => {
    expect(evaluateExternalWindowRequest('https://github.com/gannonh/kata/pull/308')).toMatchObject({
      decision: 'allow',
      logPayload: {
        origin: 'https://github.com',
        pathname: '/gannonh/kata/pull/308',
      },
    })
    expect(evaluateExternalWindowRequest('http://localhost:3000/health')).toMatchObject({
      decision: 'allow',
    })
  })

  test('denies non-http(s) schemes even when they look legitimate', () => {
    const forbidden = [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'vscode://extension/foo',
      'ftp://mirror.example.com/file',
      'about:blank',
    ]

    for (const url of forbidden) {
      const result = evaluateExternalWindowRequest(url)
      expect(result.decision).toBe('deny')
      expect(result.logPayload.reason).toBe('scheme-not-allowed')
      expect(result.logPayload.protocol).toBeDefined()
    }
  })

  test('denies empty or unparseable URLs without throwing', () => {
    for (const url of ['', '   ', 'not a url', '://missing-scheme']) {
      const result = evaluateExternalWindowRequest(url)
      expect(result.decision).toBe('deny')
      expect(['empty-url', 'unparseable-url']).toContain(result.logPayload.reason)
    }
    expect(evaluateExternalWindowRequest(null).decision).toBe('deny')
    expect(evaluateExternalWindowRequest(undefined).decision).toBe('deny')
  })

  test('never surfaces query strings or fragments in the log payload', () => {
    // Regression: OAuth callback URLs carry tokens/codes in query strings;
    // leaking them into logs would defeat the point of session security.
    const url =
      'https://mcp.linear.app/oauth/callback?code=super-secret-token&state=abc#fragment-data'
    const result = evaluateExternalWindowRequest(url)
    expect(result.decision).toBe('allow')
    expect(result.logPayload.origin).toBe('https://mcp.linear.app')
    expect(result.logPayload.pathname).toBe('/oauth/callback')
    const serialized = JSON.stringify(result.logPayload)
    expect(serialized).not.toContain('super-secret-token')
    expect(serialized).not.toContain('state=abc')
    expect(serialized).not.toContain('fragment-data')
  })
})
