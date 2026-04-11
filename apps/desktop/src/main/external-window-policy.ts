/**
 * Pure helper that decides whether an external window request is allowed,
 * and what is safe to log about it.
 *
 * Security & log hygiene goals (PR #313 review — copilot + CodeRabbit):
 *   - Only `http:` and `https:` schemes are allowed. `file:`, `javascript:`,
 *     `data:`, custom protocol handlers, etc. must be denied even with
 *     sandbox/nodeIntegration off, because allowing them gives the renderer
 *     another side channel for local-file access or script injection.
 *   - Never log the raw URL. OAuth redirects and PR links routinely carry
 *     access tokens, refresh tokens, and session IDs in the query string;
 *     those MUST NOT land in logs. We log only origin + pathname.
 *   - Garbage URLs (unparseable, empty) deny instead of throwing, so a
 *     malformed renderer call can't crash the main process.
 */

export type ExternalWindowDecision = 'allow' | 'deny'

export interface ExternalWindowPolicyResult {
  decision: ExternalWindowDecision
  logPayload: {
    origin?: string
    pathname?: string
    protocol?: string
    reason?: string
  }
}

export function evaluateExternalWindowRequest(url: string | null | undefined): ExternalWindowPolicyResult {
  if (!url || typeof url !== 'string') {
    return { decision: 'deny', logPayload: { reason: 'empty-url' } }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { decision: 'deny', logPayload: { reason: 'unparseable-url' } }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      decision: 'deny',
      logPayload: {
        protocol: parsed.protocol,
        reason: 'scheme-not-allowed',
      },
    }
  }

  return {
    decision: 'allow',
    logPayload: {
      origin: parsed.origin,
      pathname: parsed.pathname,
    },
  }
}
