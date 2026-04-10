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
    expect(supervisor.getStatus().managedProcessRunning).toBe(false)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
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

  test('supports mocked ready mode for deterministic e2e seams', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
        // Mock mode bypasses binary resolution entirely.
        KATA_DESKTOP_SYMPHONY_MOCK: 'ready',
        KATA_SYMPHONY_URL: 'http://127.0.0.1:7000',
      },
    })

    const started = await supervisor.start()
    expect(started.success).toBe(true)
    expect(supervisor.getStatus().phase).toBe('ready')
    expect(supervisor.getStatus().pid).toBe(4242)

    const stopped = await supervisor.stop('mock_stop')
    expect(stopped.success).toBe(true)
    expect(supervisor.getStatus().phase).toBe('stopped')
  })

  test('supports assembled mocked scenario mode with runtime checkpoints', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
        // Mock mode bypasses binary resolution entirely.
        KATA_DESKTOP_SYMPHONY_MOCK: 'assembled_healthy',
      },
    })

    const started = await supervisor.start()
    expect(started.success).toBe(true)
    expect(supervisor.getStatus().launch?.command).toBe('mock-symphony-assembled')
    expect(supervisor.getStatus().diagnostics.stdout[0]).toContain('checkpoint:runtime-ready:assembled_healthy')
  })

  test('supports mocked config and readiness failure modes', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const configErrorSupervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
        // Mock mode bypasses binary resolution entirely.
        KATA_DESKTOP_SYMPHONY_MOCK: 'config_error',
      },
    })

    const configResult = await configErrorSupervisor.start()
    expect(configResult.success).toBe(false)
    expect(configResult.error?.code).toBe('CONFIG_MISSING')
    expect(configErrorSupervisor.getStatus().phase).toBe('config_error')

    const readinessErrorSupervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
        // Mock mode bypasses binary resolution entirely.
        KATA_DESKTOP_SYMPHONY_MOCK: 'readiness_error',
      },
    })

    const readinessResult = await readinessErrorSupervisor.start()
    expect(readinessResult.success).toBe(false)
    expect(readinessResult.error?.code).toBe('READINESS_FAILED')
    expect(readinessErrorSupervisor.getStatus().phase).toBe('failed')
  })

  test('captures unexpected process exits as failures', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()
    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: vi.fn(() => child as any) as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
    })

    await supervisor.start()
    child.emit('exit', 9, null)

    expect(supervisor.getStatus().phase).toBe('failed')
    expect(supervisor.getStatus().lastError?.code).toBe('PROCESS_EXITED')
  })

  test('returns process exit error when child exits before readiness succeeds', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()
    const fetchImpl = vi.fn(async () => {
      child.emit('exit', 2, null)
      child.exitCode = 2
      return { ok: false } as Response
    })

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: vi.fn(() => child as any) as any,
      fetchImpl: fetchImpl as any,
      readinessTimeoutMs: 1_000,
      readinessIntervalMs: 200,
    })

    const result = await supervisor.start()

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('PROCESS_EXITED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('resets runtime state when workspace path changes', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_DESKTOP_SYMPHONY_MOCK: 'ready',
      },
    })

    await supervisor.start()

    const nextWorkspace = mkdtempSync(path.join(tmpdir(), 'desktop-symphony-next-workspace-'))
    cleanups.push(() => rmSync(nextWorkspace, { recursive: true, force: true }))

    await supervisor.setWorkspacePath(nextWorkspace)

    expect(supervisor.getStatus().phase).toBe('stopped')
    expect(supervisor.getStatus().url).toBeNull()
    expect(supervisor.getStatus().managedProcessRunning).toBe(false)
  })

  test('captures diagnostics from stdout and stderr streams', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: vi.fn(() => child as any) as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
    })

    await supervisor.start()
    child.stdout.emit('data', 'line one\nline two\n')
    child.stderr.emit('data', 'warn one\n')

    expect(supervisor.getStatus().diagnostics.stdout).toContain('line one')
    expect(supervisor.getStatus().diagnostics.stdout).toContain('line two')
    expect(supervisor.getStatus().diagnostics.stderr).toContain('warn one')
  })

  test('handles spawn implementation failures', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: vi.fn(() => {
        throw new Error('spawn exploded')
      }) as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
    })

    const result = await supervisor.start()
    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('SPAWN_FAILED')
    expect(supervisor.getStatus().phase).toBe('failed')
  })

  test('returns stop timeout when process ignores signals', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()
    child.kill = vi.fn(() => true)

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: vi.fn(() => child as any) as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
      stopTimeoutMs: 20,
    })

    await supervisor.start()
    const stopped = await supervisor.stop('timeout_case')

    expect(stopped.success).toBe(false)
    expect(stopped.error?.code).toBe('STOP_TIMEOUT')
    expect(supervisor.getStatus().phase).toBe('failed')
  })

  test('treats SIGKILL exit as successful stop after graceful timeout', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()
    child.kill = vi.fn((signal?: string) => {
      if (signal === 'SIGKILL') {
        child.exitCode = 0
        child.emit('exit', 0, 'SIGKILL')
        child.emit('close', 0, 'SIGKILL')
      }
      return true
    })

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: vi.fn(() => child as any) as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
      stopTimeoutMs: 20,
    })

    await supervisor.start()
    const stopped = await supervisor.stop('force_kill')

    expect(stopped.success).toBe(true)
    expect(supervisor.getStatus().phase).toBe('stopped')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  test('returns immediately when start is called while already ready', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const spawnImpl = vi.fn(() => createMockChild() as any)
    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: spawnImpl as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
    })

    await supervisor.start()
    const secondStart = await supervisor.start()

    expect(secondStart.success).toBe(true)
    expect(spawnImpl).toHaveBeenCalledTimes(1)
  })

  test('stop succeeds when no child process is running', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      // KATA_SYMPHONY_BIN_PATH absent — stripped by test-setup.ts (R029).
      // stop() doesn't need binary resolution; this just confirms idle stop works.
      env: process.env,
    })

    const result = await supervisor.stop('idle_stop')
    expect(result.success).toBe(true)
    expect(supervisor.getStatus().phase).toBe('stopped')
  })

  test('marks runtime failed when child emits process error', async () => {
    const workspace = createWorkspace()
    cleanups.push(workspace.cleanup)

    const child = createMockChild()
    const supervisor = new SymphonySupervisor({
      workspacePath: workspace.workspacePath,
      appIsPackaged: false,
      env: {
        ...process.env,
        KATA_SYMPHONY_BIN_PATH: workspace.executablePath,
      },
      spawnImpl: vi.fn(() => child as any) as any,
      fetchImpl: vi.fn(async () => ({ ok: true } as Response)) as any,
    })

    await supervisor.start()
    child.emit('error', new Error('child failure'))

    expect(supervisor.getStatus().phase).toBe('failed')
    expect(supervisor.getStatus().lastError?.code).toBe('SPAWN_FAILED')
  })
})
