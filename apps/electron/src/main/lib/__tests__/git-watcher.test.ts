/**
 * Integration tests for GitWatcher
 *
 * These tests verify:
 * - start() correctly identifies git repos vs non-git directories
 * - File watcher detects git operations (commits, staging)
 * - stop() cleans up resources and prevents further callbacks
 * - isRunning() reflects watcher lifecycle
 * - Worktree .git file resolution (gitdir pointer)
 * - Constructor accepts onError option
 * - Performance: start() completes quickly for repos with 1000+ files
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

import { GitWatcher } from '../git-watcher'

// ============================================
// Test utilities
// ============================================

function createTempDir(prefix: string): string {
  const dir = join(tmpdir(), `kata-gitwatcher-test-${prefix}-${Date.now()}`)
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================
// GitWatcher tests
// ============================================

describe('GitWatcher', () => {
  let tempDir: string
  let watcher: GitWatcher | null = null
  // Track extra directories for worktree tests
  const extraDirs: string[] = []

  afterEach(() => {
    // Always stop watcher to prevent leaked resources
    if (watcher) {
      watcher.stop()
      watcher = null
    }
    if (tempDir) {
      cleanupDir(tempDir)
    }
    for (const dir of extraDirs) {
      cleanupDir(dir)
    }
    extraDirs.length = 0
  })

  // ----------------------------------------
  // start() behavior
  // ----------------------------------------

  describe('start()', () => {
    it('returns true for a git repository', () => {
      tempDir = createTempDir('start-git')
      initGitRepo(tempDir)

      watcher = new GitWatcher(tempDir, () => {})
      const result = watcher.start()

      expect(result).toBe(true)
    })

    it('returns false for a non-git directory', () => {
      tempDir = createTempDir('start-nongit')

      watcher = new GitWatcher(tempDir, () => {})
      const result = watcher.start()

      expect(result).toBe(false)
    })

    it('returns false for a non-existent directory', () => {
      const nonExistent = join(tmpdir(), `kata-gitwatcher-nonexistent-${Date.now()}`)

      watcher = new GitWatcher(nonExistent, () => {})
      const result = watcher.start()

      expect(result).toBe(false)
    })
  })

  // ----------------------------------------
  // Change detection
  // ----------------------------------------

  describe('change detection', () => {
    it('detects git changes via callback', async () => {
      tempDir = createTempDir('detect-change')
      initGitRepo(tempDir, { initialCommit: true })

      let callCount = 0
      watcher = new GitWatcher(tempDir, () => { callCount++ }, { debounceMs: 50 })
      watcher.start()

      // Wait for chokidar to be ready
      await sleep(300)

      // Make a git change (commit modifies .git/index, .git/refs/heads/*, .git/HEAD)
      writeFileSync(join(tempDir, 'file.txt'), 'hello')
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
      execSync('git commit -m "test commit"', { cwd: tempDir, stdio: 'pipe' })

      // Wait for debounce + watcher propagation
      await sleep(500)

      expect(callCount).toBeGreaterThanOrEqual(1)
    })

    it('stop() prevents further callbacks', async () => {
      tempDir = createTempDir('stop-no-callback')
      initGitRepo(tempDir, { initialCommit: true })

      let callCount = 0
      watcher = new GitWatcher(tempDir, () => { callCount++ }, { debounceMs: 50 })
      watcher.start()

      // Wait for chokidar to be ready, then stop
      await sleep(300)
      watcher.stop()

      // Make a git change after stopping
      writeFileSync(join(tempDir, 'file.txt'), 'hello')
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
      execSync('git commit -m "test commit"', { cwd: tempDir, stdio: 'pipe' })

      // Wait to confirm no callbacks fire
      await sleep(300)

      expect(callCount).toBe(0)
    })
  })

  // ----------------------------------------
  // isRunning() lifecycle
  // ----------------------------------------

  describe('isRunning()', () => {
    it('returns correct state through lifecycle', () => {
      tempDir = createTempDir('isrunning')
      initGitRepo(tempDir)

      watcher = new GitWatcher(tempDir, () => {})

      // Before start
      expect(watcher.isRunning()).toBe(false)

      // After start
      watcher.start()
      expect(watcher.isRunning()).toBe(true)

      // After stop
      watcher.stop()
      expect(watcher.isRunning()).toBe(false)
    })
  })

  // ----------------------------------------
  // Worktree support
  // ----------------------------------------

  describe('worktree support', () => {
    it('handles worktree .git file', () => {
      tempDir = createTempDir('worktree-main')
      initGitRepo(tempDir, { initialCommit: true })

      const worktreeDir = join(tmpdir(), `kata-gitwatcher-test-worktree-${Date.now()}`)
      extraDirs.push(worktreeDir)

      try {
        execSync(`git worktree add "${worktreeDir}" -b feature-watcher-test`, {
          cwd: tempDir,
          stdio: 'pipe',
        })
      } catch {
        // git worktree requires git >= 2.5; skip if unavailable
        console.log('Skipping worktree test: git worktree not available')
        return
      }

      watcher = new GitWatcher(worktreeDir, () => {})
      const result = watcher.start()

      // resolveGitDir should follow the .git file's gitdir pointer
      expect(result).toBe(true)
    })
  })

  // ----------------------------------------
  // onError option
  // ----------------------------------------

  describe('onError option', () => {
    it('accepts onError callback without error', () => {
      tempDir = createTempDir('onerror')
      initGitRepo(tempDir)

      const errors: Error[] = []
      watcher = new GitWatcher(tempDir, () => {}, {
        onError: (err) => { errors.push(err) },
      })

      // Structural smoke test: constructor accepts the option,
      // start succeeds, and the watcher is functional.
      const result = watcher.start()
      expect(result).toBe(true)
    })
  })

  // ----------------------------------------
  // Performance
  // ----------------------------------------

  describe('performance', () => {
    it('starts within reasonable time for a repository with 1000+ files', () => {
      tempDir = createTempDir('perf-1k')
      initGitRepo(tempDir)

      // Generate 1000 files
      for (let i = 0; i < 1000; i++) {
        writeFileSync(join(tempDir, `file-${i}.txt`), `content ${i}`)
      }
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
      execSync('git commit -m "bulk commit"', { cwd: tempDir, stdio: 'pipe' })

      const startTime = performance.now()

      watcher = new GitWatcher(tempDir, () => {})
      const result = watcher.start()

      const elapsed = performance.now() - startTime

      expect(result).toBe(true)
      // GitWatcher watches selective .git paths, not the working tree,
      // so start() should be fast regardless of repo size.
      expect(elapsed).toBeLessThan(5000)
    })
  })

  // ----------------------------------------
  // getWorkspaceDir()
  // ----------------------------------------

  describe('getWorkspaceDir()', () => {
    it('returns the workspace directory', () => {
      tempDir = createTempDir('getdir')

      watcher = new GitWatcher(tempDir, () => {})

      expect(watcher.getWorkspaceDir()).toBe(tempDir)
    })
  })
})
