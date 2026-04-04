import { EventEmitter } from 'node:events'
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SymphonySupervisor } from '../symphony-supervisor'

function createWorkspace(): { workspacePath: string; executablePath: string; cleanup: () => void } {
  const workspacePath = mkdtempSync(path.join(tmpdir(), 'desktop-symphony-supervisor-'))
  mkdirSync(path.join(workspacePath, '.kata'), { recursive: true })

  const workflowPath = path.join(workspacePath, 'WORKFLOW.md')
  writeFileSync(workflowPath, '# workflow\n', 'utf8')

  const executablePath = path.join(workspacePath, 'symphony-bin')
  writeFileSync(executablePath, '#!/usr/bin/env bash\nexit 0\n', 'utf8')
  chmodSync(executablePath, 0o755)

  writeFileSync(
    path.join(workspacePath, '.kata', 'preferences.md'),
    ['---', 'symphony:', '  url: http://127.0.0.1:8080', '  workflow_path: ./WORKFLOW.md', '---'].join(
      '\n',
    ),
    'utf8',
  )

  return {
    workspacePath,
    executablePath,
    cleanup: () => rmSync(workspacePath, { recursive: true, force: true }),
  }
}

function createMockChild(pid = 4321) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    pid: number
    exitCode: number | null
    kill: ReturnType<typeof vi.fn>
  }

  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = pid
  child.exitCode = null
  child.kill = vi.fn((signal?: string) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      child.exitCode = 0
      child.emit('exit', 0, signal ?? null)
      child.emit('close', 0, signal ?? null)
    }
    return true
  })

  return child
}

describe('SymphonySupervisor', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const cleanup of cleanups.splice(0)) {
      cleanup()
    }
  })

  test('moves to ready state when process starts and readiness probe succeeds', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()
    const spawnImpl = vi.fn(() => child as any)
    const fetchImpl = vi.fn(async () => ({ ok: true } as Response))

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: spawnImpl as any,
      fetchImpl: fetchImpl as any,
      readinessTimeoutMs: 1_000,
      readinessIntervalMs: 10,
    })

    const result = await supervisor.start()

    expect(result.success).toBe(true)
    expect(supervisor.getStatus().phase).toBe('ready')
    expect(supervisor.getStatus().managedProcessRunning).toBe(true)
    expect(spawnImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalled()
  })

  test('returns readiness failure when API never becomes healthy', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()
    const spawnImpl = vi.fn(() => child as any)
    const fetchImpl = vi.fn(async () => ({ ok: false } as Response))

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: spawnImpl as any,
      fetchImpl: fetchImpl as any,
      readinessTimeoutMs: 40,
      readinessIntervalMs: 10,
    })

    const result = await supervisor.start()

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('READINESS_FAILED')
    expect(supervisor.getStatus().phase).toBe('failed')
  })

  test('supports stop and restart with lifecycle updates', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const childFactory = vi
      .fn()
      .mockImplementationOnce(() => createMockChild(1001) as any)
      .mockImplementationOnce(() => createMockChild(1002) as any)

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: childFactory as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
      readinessTimeoutMs: 200,
      readinessIntervalMs: 5,
    })

    await supervisor.start()

    const restartResult = await supervisor.restart('test_restart')
    expect(restartResult.success).toBe(true)
    expect(supervisor.getStatus().phase).toBe('ready')
    expect(supervisor.getStatus().restartCount).toBe(1)

    const stopResult = await supervisor.stop('test_stop')
    expect(stopResult.success).toBe(true)
    expect(supervisor.getStatus().phase).toBe('stopped')
    expect(supervisor.getStatus().managedProcessRunning).toBe(false)
  })
})
