/**
 * Tests for git service
 *
 * These tests verify:
 * - isGitRepository correctly identifies git repos
 * - getGitStatus returns correct state for various scenarios
 * - Error handling and graceful degradation
 * - Detached HEAD state detection
 */
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

import { isGitRepository, getGitStatus } from '../git-service'
import type { GitState } from '../types'

// ============================================
// Test utilities
// ============================================

function createTempDir(prefix: string): string {
  const dir = join(tmpdir(), `kata-git-test-${prefix}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function initGitRepo(dir: string, options?: { initialCommit?: boolean; branch?: string }): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' })

  if (options?.branch) {
    execSync(`git checkout -b ${options.branch}`, { cwd: dir, stdio: 'pipe' })
  }

  if (options?.initialCommit) {
    writeFileSync(join(dir, 'README.md'), '# Test')
    execSync('git add .', { cwd: dir, stdio: 'pipe' })
    execSync('git commit -m "Initial commit"', { cwd: dir, stdio: 'pipe' })
  }
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================
// isGitRepository tests
// ============================================

describe('isGitRepository', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir) {
      cleanupDir(tempDir)
    }
  })

  it('should return true for a git repository', async () => {
    tempDir = createTempDir('git-repo')
    initGitRepo(tempDir)

    const result = await isGitRepository(tempDir)

    expect(result).toBe(true)
  })

  it('should return true for a subdirectory of a git repository', async () => {
    tempDir = createTempDir('git-repo-sub')
    initGitRepo(tempDir)
    const subDir = join(tempDir, 'subdir')
    mkdirSync(subDir)

    const result = await isGitRepository(subDir)

    expect(result).toBe(true)
  })

  it('should return false for a non-git directory', async () => {
    tempDir = createTempDir('non-git')

    const result = await isGitRepository(tempDir)

    expect(result).toBe(false)
  })

  it('should return false for a non-existent directory', async () => {
    const nonExistent = join(tmpdir(), `non-existent-${Date.now()}`)

    const result = await isGitRepository(nonExistent)

    expect(result).toBe(false)
  })
})

// ============================================
// getGitStatus tests
// ============================================

describe('getGitStatus', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir) {
      cleanupDir(tempDir)
    }
  })

  describe('non-git directories', () => {
    it('should return default state for non-git directory', async () => {
      tempDir = createTempDir('non-git-status')

      const result = await getGitStatus(tempDir)

      expect(result).toEqual({
        branch: null,
        isRepo: false,
        isDetached: false,
        detachedHead: null,
      })
    })

    it('should return default state for non-existent directory', async () => {
      const nonExistent = join(tmpdir(), `non-existent-${Date.now()}`)

      const result = await getGitStatus(nonExistent)

      expect(result).toEqual({
        branch: null,
        isRepo: false,
        isDetached: false,
        detachedHead: null,
      })
    })
  })

  describe('git repositories', () => {
    it('should return branch name for initialized repo with commits', async () => {
      tempDir = createTempDir('git-with-commits')
      initGitRepo(tempDir, { initialCommit: true })

      const result = await getGitStatus(tempDir)

      expect(result.isRepo).toBe(true)
      expect(result.isDetached).toBe(false)
      expect(result.detachedHead).toBeNull()
      // Branch is either 'main' or 'master' depending on git config
      expect(result.branch).toBeTruthy()
      expect(['main', 'master']).toContain(result.branch as string)
    })

    it('should return custom branch name', async () => {
      tempDir = createTempDir('git-custom-branch')
      initGitRepo(tempDir, { initialCommit: true, branch: 'feature/test-branch' })

      const result = await getGitStatus(tempDir)

      expect(result.isRepo).toBe(true)
      expect(result.branch).toBe('feature/test-branch')
      expect(result.isDetached).toBe(false)
    })

    it('should handle repo with no commits (orphan branch)', async () => {
      tempDir = createTempDir('git-no-commits')
      initGitRepo(tempDir)

      const result = await getGitStatus(tempDir)

      expect(result.isRepo).toBe(true)
      expect(result.isDetached).toBe(false)
      // Branch may be null or the default branch name on fresh repo
    })
  })

  describe('detached HEAD state', () => {
    it('should detect detached HEAD and return commit hash', async () => {
      tempDir = createTempDir('git-detached')
      initGitRepo(tempDir, { initialCommit: true })

      // Get the commit hash and checkout to detached HEAD
      const commitHash = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf8' }).trim()
      execSync(`git checkout ${commitHash}`, { cwd: tempDir, stdio: 'pipe' })

      const result = await getGitStatus(tempDir)

      expect(result.isRepo).toBe(true)
      expect(result.isDetached).toBe(true)
      // In detached HEAD, simple-git returns "HEAD" as current branch
      expect(result.branch).toBe('HEAD')
      expect(result.detachedHead).toBeTruthy()
      // Verify it's a short hash (typically 7-8 chars)
      expect(result.detachedHead!.length).toBeGreaterThanOrEqual(7)
      expect(result.detachedHead!.length).toBeLessThanOrEqual(12)
    })
  })
})

// ============================================
// GitState type tests
// ============================================

describe('GitState type', () => {
  it('should allow valid non-repo state', () => {
    const state: GitState = {
      branch: null,
      isRepo: false,
      isDetached: false,
      detachedHead: null,
    }

    expect(state.isRepo).toBe(false)
    expect(state.branch).toBeNull()
  })

  it('should allow valid repo state with branch', () => {
    const state: GitState = {
      branch: 'main',
      isRepo: true,
      isDetached: false,
      detachedHead: null,
    }

    expect(state.isRepo).toBe(true)
    expect(state.branch).toBe('main')
    expect(state.isDetached).toBe(false)
  })

  it('should allow valid detached HEAD state', () => {
    const state: GitState = {
      branch: null,
      isRepo: true,
      isDetached: true,
      detachedHead: 'abc1234',
    }

    expect(state.isRepo).toBe(true)
    expect(state.isDetached).toBe(true)
    expect(state.detachedHead).toBe('abc1234')
  })
})

// ============================================
// Error handling tests
// ============================================

describe('error handling', () => {
  it('should gracefully handle errors without crashing', async () => {
    // Test with an invalid path that might cause different errors
    const invalidPath = '/root/definitely-not-accessible-path-' + Date.now()

    const result = await getGitStatus(invalidPath)

    // Should return default state, not throw
    expect(result.isRepo).toBe(false)
    expect(result.branch).toBeNull()
  })
})
