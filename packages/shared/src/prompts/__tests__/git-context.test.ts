import { describe, test, expect } from 'bun:test'
import { formatGitContext } from '../system'

describe('formatGitContext', () => {
  test('returns empty string for null gitState', () => {
    expect(formatGitContext(null, null)).toBe('')
  })

  test('returns empty string for undefined gitState', () => {
    expect(formatGitContext(undefined, undefined)).toBe('')
  })

  test('returns empty string for non-repo directory', () => {
    const result = formatGitContext(
      { isRepo: false, branch: null, isDetached: false, detachedHead: null },
      null
    )
    expect(result).toBe('')
  })

  test('returns branch context for git repo without PR', () => {
    const result = formatGitContext(
      { isRepo: true, branch: 'feature/user-auth', isDetached: false, detachedHead: null },
      null
    )
    expect(result).toContain('<git_context>')
    expect(result).toContain('</git_context>')
    expect(result).toContain('Current branch: feature/user-auth')
    expect(result).not.toContain('PR #')
  })

  test('returns branch + PR context', () => {
    const result = formatGitContext(
      { isRepo: true, branch: 'feature/user-auth', isDetached: false, detachedHead: null },
      { number: 42, title: 'Fix user auth', state: 'OPEN', isDraft: false, url: 'https://github.com/org/repo/pull/42' }
    )
    expect(result).toContain('Current branch: feature/user-auth')
    expect(result).toContain('PR #42: Fix user auth (OPEN)')
    expect(result).not.toContain('Draft')
  })

  test('handles draft PR', () => {
    const result = formatGitContext(
      { isRepo: true, branch: 'feature/wip', isDetached: false, detachedHead: null },
      { number: 99, title: 'Work in progress', state: 'OPEN', isDraft: true, url: 'https://github.com/org/repo/pull/99' }
    )
    expect(result).toContain('PR #99: Work in progress (OPEN, Draft)')
  })

  test('handles detached HEAD', () => {
    const result = formatGitContext(
      { isRepo: true, branch: null, isDetached: true, detachedHead: 'abc1234' },
      null
    )
    expect(result).toContain('Detached HEAD: abc1234')
    expect(result).not.toContain('Current branch')
  })

  test('handles MERGED PR state', () => {
    const result = formatGitContext(
      { isRepo: true, branch: 'feature/done', isDetached: false, detachedHead: null },
      { number: 10, title: 'Completed feature', state: 'MERGED', isDraft: false, url: 'https://github.com/org/repo/pull/10' }
    )
    expect(result).toContain('PR #10: Completed feature (MERGED)')
  })

  test('handles CLOSED PR state', () => {
    const result = formatGitContext(
      { isRepo: true, branch: 'feature/abandoned', isDetached: false, detachedHead: null },
      { number: 5, title: 'Old feature', state: 'CLOSED', isDraft: false, url: 'https://github.com/org/repo/pull/5' }
    )
    expect(result).toContain('PR #5: Old feature (CLOSED)')
  })

  test('output is concise (under 300 chars with PR)', () => {
    const result = formatGitContext(
      { isRepo: true, branch: 'feature/user-auth', isDetached: false, detachedHead: null },
      { number: 42, title: 'Fix user auth', state: 'OPEN', isDraft: true, url: 'https://github.com/org/repo/pull/42' }
    )
    expect(result.length).toBeLessThan(300)
  })
})
