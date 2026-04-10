import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { loadWorkspacePreferences, resolveSymphonyLaunch } from '../symphony-config'

function createWorkspace(): { workspacePath: string; cleanup: () => void } {
  const workspacePath = mkdtempSync(path.join(tmpdir(), 'desktop-symphony-config-'))
  mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })

  return {
    workspacePath,
    cleanup: () => rmSync(workspacePath, { recursive: true, force: true }),
  }
}

function createExecutable(workspacePath: string, name = 'symphony'): string {
  const executablePath = path.join(workspacePath, name)
  writeFileSync(executablePath, '#!/usr/bin/env bash\nexit 0\n', 'utf8')
  chmodSync(executablePath, 0o755)
  return executablePath
}

describe('test environment isolation (R029)', () => {
  test('KATA_SYMPHONY_BIN_PATH is stripped from process.env by test-setup.ts', () => {
    // The Vitest setup file (src/test-setup.ts) deletes KATA_SYMPHONY_BIN_PATH
    // from process.env before any test file runs. This smoke test confirms the
    // stripping worked, even if the developer's shell had the var exported.
    expect(process.env.KATA_SYMPHONY_BIN_PATH).toBeUndefined()
  })
})

describe('resolveSymphonyLaunch', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
  })

  test('loadWorkspacePreferences returns null when preferences file is missing', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const loaded = await loadWorkspacePreferences(workspace.workspacePath)
    expect(loaded).toBeNull()
  })

  test('resolveSymphonyLaunch surfaces preferences read errors beyond ENOENT', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const preferencesPath = path.join(workspace.workspacePath, '.kata', 'preferences.md')
    mkdirSync(preferencesPath, { recursive: true })
    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029)
        KATA_SYMPHONY_URL: 'http://localhost:8080',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('CONFIG_INVALID')
    expect(result.error.details).toBe('preferences_read_failed')
  })

  test('loadWorkspacePreferences returns null without frontmatter/symphony block', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, '.kata', 'preferences.md'), 'plain text', 'utf8')
    expect(await loadWorkspacePreferences(workspace.workspacePath)).toBeNull()

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      ['---', 'theme: dark', '---'].join('\n'),
      'utf8',
    )

    expect(await loadWorkspacePreferences(workspace.workspacePath)).toBeNull()
  })

  test('loadWorkspacePreferences ignores comments, malformed lines, and dedented keys', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      [
        '---',
        'symphony:',
        '  # comment line',
        '  url: http://localhost:8080',
        '',
        '  malformed line',
        '  workflow_path: WORKFLOW.md',
        'theme: dark',
        '---',
      ].join('\n'),
      'utf8',
    )

    await expect(loadWorkspacePreferences(workspace.workspacePath)).resolves.toEqual({
      symphony: {
        url: 'http://localhost:8080',
        workflow_path: 'WORKFLOW.md',
      },
    })
  })

  test('resolves launch descriptor from preferences', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const workflowPath = path.join(workspace.workspacePath, 'workflow-test.md')
    writeFileSync(workflowPath, '# workflow\n', 'utf8')
    const executablePath = createExecutable(workspace.workspacePath, 'symphony-bin')

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      [
        '---',
        'symphony:',
        '  url: http://127.0.0.1:8080',
        `  workflow_path: ${workflowPath}`,
        '---',
      ].join('\n'),
      'utf8',
    )

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: executablePath,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.launch.command).toBe(executablePath)
    expect(result.launch.workflowPath).toBe(workflowPath)
    expect(result.launch.resolvedUrl).toBe('http://127.0.0.1:8080')
    expect(result.launch.args).toEqual([workflowPath, '--no-tui', '--port', '8080'])
  })

  test('normalizes backslash workflow paths when resolving preferences', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const workflowDir = path.join(workspace.workspacePath, 'nested')
    mkdirSync(workflowDir, { recursive: true })
    const workflowPath = path.join(workflowDir, 'WORKFLOW.md')
    writeFileSync(workflowPath, '# workflow\n', 'utf8')

    const executablePath = createExecutable(workspace.workspacePath, 'symphony-bin')

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      ['---', 'symphony:', '  url: http://127.0.0.1:8080', '  workflow_path: nested\\WORKFLOW.md', '---'].join(
        '\n',
      ),
      'utf8',
    )

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: executablePath,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.launch.workflowPath).toBe(workflowPath)
  })

  test('returns config error when URL is malformed', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      ['---', 'symphony:', '  url: not-a-url', '---'].join('\n'),
      'utf8',
    )

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
      // This test exercises config validation; binary resolution is not reached.
      env: process.env,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('CONFIG_INVALID')
  })

  test('returns workflow path missing when configured path does not exist', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      ['---', 'symphony:', '  url: http://localhost:8080', '  workflow_path: ./missing.md', '---'].join(
        '\n',
      ),
      'utf8',
    )

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
      // This test exercises workflow path validation; binary resolution is not reached.
      env: process.env,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('WORKFLOW_PATH_MISSING')
  })

  test('returns workflow path missing when configured workflow_path points to a directory', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const workflowDir = path.join(workspace.workspacePath, 'workflow-dir')
    mkdirSync(workflowDir, { recursive: true })

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      ['---', 'symphony:', '  url: http://localhost:8080', '  workflow_path: ./workflow-dir', '---'].join('\n'),
      'utf8',
    )

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
      // This test exercises workflow path validation; binary resolution is not reached.
      env: process.env,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('WORKFLOW_PATH_MISSING')
  })

  test('returns config invalid on unsupported protocol', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')
    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      ['---', 'symphony:', '  url: ws://localhost:8080', '---'].join('\n'),
      'utf8',
    )

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
      // This test exercises URL validation; binary resolution is not reached.
      env: process.env,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('CONFIG_INVALID')
    expect(result.error.details).toBe('unsupported_protocol')
  })

  test('uses env URL and default WORKFLOW path when preferences are missing', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const executablePath = createExecutable(workspace.workspacePath, 'symphony-from-env')
    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_URL: 'http://localhost:9090/',
        KATA_SYMPHONY_BIN_PATH: executablePath,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.launch.urlSource).toBe('env')
    expect(result.launch.workflowPathSource).toBe('default')
    expect(result.launch.args).toEqual([
      path.join(workspace.workspacePath, 'WORKFLOW.md'),
      '--no-tui',
      '--port',
      '9090',
    ])
  })

  test('returns workflow path missing when default WORKFLOW.md is a directory', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    mkdirSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), { recursive: true })

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029)
        KATA_SYMPHONY_URL: 'http://localhost:8080',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('WORKFLOW_PATH_MISSING')
  })

  test('returns config missing when no URL is configured', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029)
        KATA_SYMPHONY_URL: '',
        SYMPHONY_URL: '',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('CONFIG_MISSING')
  })

  test('returns binary not found when env binary path is invalid', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_URL: 'http://localhost:8080',
        KATA_SYMPHONY_BIN_PATH: './missing-binary',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('BINARY_NOT_FOUND')
  })

  test('resolves packaged binary path when running in packaged mode', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const resourcesPath = mkdtempSync(path.join(tmpdir(), 'desktop-symphony-resources-'))
    cleanups.push(() => rmSync(resourcesPath, { recursive: true, force: true }))

    const packagedBinary = createExecutable(resourcesPath, 'symphony')

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: true,
      resourcesPath,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
        // With no env override, the packaged binary should be discovered via resourcesPath.
        KATA_SYMPHONY_URL: 'http://localhost:8080',
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.launch.command).toBe(packagedBinary)
    expect(result.launch.source).toBe('bundled')
  })

  test('parses quoted preference values and strips inline comments', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')
    const executablePath = createExecutable(workspace.workspacePath, 'quoted-symphony-bin')

    writeFileSync(
      path.join(workspace.workspacePath, '.kata', 'preferences.md'),
      [
        '---',
        'symphony:',
        '  url: "http://localhost:8082" # inline comment',
        "  workflow_path: 'WORKFLOW.md'",
        '---',
      ].join('\n'),
      'utf8',
    )

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: executablePath,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.launch.resolvedUrl).toBe('http://localhost:8082')
  })

  test('falls back to SYMPHONY_URL when KATA_SYMPHONY_URL is missing', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')
    const executablePath = createExecutable(workspace.workspacePath, 'fallback-env-bin')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_URL: '',
        SYMPHONY_URL: 'http://localhost:8123',
        KATA_SYMPHONY_BIN_PATH: executablePath,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.launch.resolvedUrl).toBe('http://localhost:8123')
  })

  test('resolves binary from PATH discovery when env override is absent', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const binDir = mkdtempSync(path.join(tmpdir(), 'desktop-symphony-path-bin-'))
    cleanups.push(() => rmSync(binDir, { recursive: true, force: true }))
    const pathBinary = createExecutable(binDir, 'symphony')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_URL: 'http://localhost:8080',
        KATA_SYMPHONY_BIN_PATH: '',
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.launch.command).toBe(pathBinary)
    expect(result.launch.source).toBe('path')
  })

  test('returns binary not found when command cannot be resolved', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_URL: 'http://localhost:8080',
        PATH: '/definitely/missing/path',
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('BINARY_NOT_FOUND')
  })

  // --- R029 regression tests ---

  test('R029: KATA_SYMPHONY_BIN_PATH takes priority when explicitly set in env', async () => {
    // Regression guard: when a test explicitly provides KATA_SYMPHONY_BIN_PATH,
    // it must be used — proving the env var → bundled → PATH priority is preserved.
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')
    const explicitBinary = createExecutable(workspace.workspacePath, 'explicit-priority-bin')

    // Also place a binary on PATH to prove the env var wins
    const binDir = mkdtempSync(path.join(tmpdir(), 'desktop-symphony-r029-path-'))
    cleanups.push(() => rmSync(binDir, { recursive: true, force: true }))
    createExecutable(binDir, 'symphony')

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_URL: 'http://localhost:8080',
        KATA_SYMPHONY_BIN_PATH: explicitBinary,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.launch.command).toBe(explicitBinary)
    expect(result.launch.source).toBe('env')
  })

  test('R029: PATH discovery works when KATA_SYMPHONY_BIN_PATH is absent', async () => {
    // Regression guard: when no KATA_SYMPHONY_BIN_PATH is in the env object
    // (as guaranteed by test-setup.ts stripping it from process.env), the
    // binary is discovered via PATH. This proves no host leakage occurs.
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    writeFileSync(path.join(workspace.workspacePath, 'WORKFLOW.md'), '# workflow\n', 'utf8')

    const binDir = mkdtempSync(path.join(tmpdir(), 'desktop-symphony-r029-nodiscovery-'))
    cleanups.push(() => rmSync(binDir, { recursive: true, force: true }))
    const pathBinary = createExecutable(binDir, 'symphony')

    // Confirm the var is not in process.env (setup file guarantee)
    expect(process.env.KATA_SYMPHONY_BIN_PATH).toBeUndefined()

    const result = await resolveSymphonyLaunch({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_URL: 'http://localhost:8080',
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.launch.command).toBe(pathBinary)
    expect(result.launch.source).toBe('path')
  })
})
