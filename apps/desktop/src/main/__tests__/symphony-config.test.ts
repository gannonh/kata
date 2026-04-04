import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { resolveSymphonyLaunch } from '../symphony-config'

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

describe('resolveSymphonyLaunch', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
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
      env: process.env,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('CONFIG_INVALID')
    expect(result.error.details).toBe('unsupported_protocol')
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
})
