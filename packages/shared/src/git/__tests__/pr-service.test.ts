/**
 * Tests for PR service
 *
 * These tests verify:
 * - getPrStatus returns PrInfo when gh CLI returns valid JSON
 * - getPrStatus returns null when gh CLI not installed (ENOENT)
 * - getPrStatus returns null when no PR exists for branch
 * - getPrStatus returns null when gh CLI not authenticated
 * - getPrStatus returns null silently for non-git directories
 * - Unexpected errors are logged and return null
 */
import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test'

import type { PrInfo } from '../types'

// ============================================
// Mock setup
// ============================================

// Mock result storage - updated by tests before each call
let mockExecResult: { stdout?: string; error?: Error & { code?: string; stderr?: string } } = {}

// Mock the child_process module before importing getPrStatus
mock.module('node:child_process', () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: object,
    callback: (error: Error | null, result: { stdout: string; stderr: string }) => void
  ) => {
    if (mockExecResult.error) {
      callback(mockExecResult.error, { stdout: '', stderr: mockExecResult.error.stderr || '' })
    } else {
      callback(null, { stdout: mockExecResult.stdout || '', stderr: '' })
    }
  },
}))

// Import after mocking
const { getPrStatus } = await import('../pr-service')

// ============================================
// Test utilities
// ============================================

function createValidPrInfo(): PrInfo {
  return {
    number: 42,
    title: 'Add feature X',
    state: 'OPEN',
    isDraft: false,
    url: 'https://github.com/org/repo/pull/42',
  }
}

function createError(code: string, stderr: string): Error & { code: string; stderr: string } {
  const error = new Error('Command failed') as Error & { code: string; stderr: string }
  error.code = code
  error.stderr = stderr
  return error
}

// ============================================
// getPrStatus tests
// ============================================

describe('getPrStatus', () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockExecResult = {}
  })

  describe('success path', () => {
    it('should return PrInfo when gh CLI returns valid JSON', async () => {
      const expectedPrInfo = createValidPrInfo()
      mockExecResult = { stdout: JSON.stringify(expectedPrInfo) }

      const result = await getPrStatus('/some/repo/path')

      expect(result).toEqual(expectedPrInfo)
    })

    it('should parse all PrInfo fields correctly', async () => {
      const prInfo: PrInfo = {
        number: 123,
        title: 'Fix bug in authentication',
        state: 'MERGED',
        isDraft: true,
        url: 'https://github.com/example/project/pull/123',
      }
      mockExecResult = { stdout: JSON.stringify(prInfo) }

      const result = await getPrStatus('/path/to/repo')

      expect(result).not.toBeNull()
      expect(result!.number).toBe(123)
      expect(result!.title).toBe('Fix bug in authentication')
      expect(result!.state).toBe('MERGED')
      expect(result!.isDraft).toBe(true)
      expect(result!.url).toBe('https://github.com/example/project/pull/123')
    })

    it('should handle CLOSED state', async () => {
      const prInfo: PrInfo = {
        number: 99,
        title: 'Rejected feature',
        state: 'CLOSED',
        isDraft: false,
        url: 'https://github.com/org/repo/pull/99',
      }
      mockExecResult = { stdout: JSON.stringify(prInfo) }

      const result = await getPrStatus('/repo')

      expect(result).not.toBeNull()
      expect(result!.state).toBe('CLOSED')
    })
  })

  describe('ENOENT (gh not installed)', () => {
    it('should return null when gh CLI is not installed', async () => {
      mockExecResult = { error: createError('ENOENT', '') }

      const result = await getPrStatus('/some/path')

      expect(result).toBeNull()
    })

    it('should not throw when gh CLI is not found', async () => {
      mockExecResult = { error: createError('ENOENT', 'spawn gh ENOENT') }

      // Should not throw
      const result = await getPrStatus('/some/path')
      expect(result).toBeNull()
    })
  })

  describe('no PR found', () => {
    it('should return null when no pull requests found for branch', async () => {
      mockExecResult = {
        error: createError('1', 'no pull requests found for branch "feature-x"'),
      }

      const result = await getPrStatus('/repo/path')

      expect(result).toBeNull()
    })

    it('should return null when could not resolve to PullRequest', async () => {
      mockExecResult = {
        error: createError('1', 'Could not resolve to a PullRequest with the number 999'),
      }

      const result = await getPrStatus('/repo/path')

      expect(result).toBeNull()
    })
  })

  describe('not authenticated', () => {
    it('should return null when gh is not logged in', async () => {
      mockExecResult = {
        error: createError('1', 'You are not logged into any GitHub hosts. Run gh auth login to authenticate.'),
      }

      const result = await getPrStatus('/repo/path')

      expect(result).toBeNull()
    })

    it('should return null when authentication required message appears', async () => {
      mockExecResult = {
        error: createError('1', 'authentication required for this operation'),
      }

      const result = await getPrStatus('/repo/path')

      expect(result).toBeNull()
    })
  })

  describe('not a git repository', () => {
    it('should return null silently for non-git directory', async () => {
      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})
      mockExecResult = {
        error: createError('1', 'failed to run git: fatal: not a git repository (or any of the parent directories): .git\n'),
      }

      const result = await getPrStatus('/tmp/not-a-repo')

      expect(result).toBeNull()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('unexpected errors', () => {
    let consoleErrorSpy: ReturnType<typeof spyOn>

    beforeEach(() => {
      consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    it('should return null and log error for unexpected errors', async () => {
      mockExecResult = {
        error: createError('UNKNOWN', 'Something completely unexpected happened'),
      }

      const result = await getPrStatus('/repo/path')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[PrService] Unexpected error')
    })

    it('should include dirPath in error log', async () => {
      mockExecResult = {
        error: createError('ETIMEOUT', 'Connection timed out'),
      }

      await getPrStatus('/specific/repo/path')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const loggedObject = consoleErrorSpy.mock.calls[0][1]
      expect(loggedObject.dirPath).toBe('/specific/repo/path')
    })

    it('should truncate long stderr in error log', async () => {
      const longStderr = 'x'.repeat(300)
      mockExecResult = {
        error: createError('UNKNOWN', longStderr),
      }

      await getPrStatus('/repo')

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const loggedObject = consoleErrorSpy.mock.calls[0][1]
      // stderr should be truncated to 200 chars
      expect(loggedObject.stderr.length).toBe(200)
    })
  })
})
