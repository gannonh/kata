import { describe, expect, test } from 'bun:test'
import type { CommandResult } from '@shared/types'
import { PiAgentBridge } from '../pi-agent-bridge'

async function waitFor(condition: () => boolean, timeoutMs = 1_500): Promise<void> {
  const startedAt = Date.now()

  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`)
    }

    await Bun.sleep(25)
  }
}

describe('PiAgentBridge', () => {
  test('marks bridge as crashed and allows restart attempts after spawn error', async () => {
    const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist')
    const statusHistory: string[] = []

    bridge.on('status', (status) => {
      statusHistory.push(status.state)
    })

    await bridge.start()
    await waitFor(() => statusHistory.includes('crashed'))

    expect(bridge.getState().running).toBe(false)
    expect(bridge.getState().status).toBe('crashed')

    const crashedCount = statusHistory.filter((state) => state === 'crashed').length

    await bridge.start()
    await waitFor(() => statusHistory.filter((state) => state === 'crashed').length > crashedCount)

    expect(bridge.getState().running).toBe(false)
    expect(bridge.getState().status).toBe('crashed')
  })

  test('coalesces concurrent start calls into a single spawn attempt', async () => {
    const bridge = new PiAgentBridge(process.cwd(), 'kata-command-that-does-not-exist')
    const statusHistory: string[] = []

    bridge.on('status', (status) => {
      statusHistory.push(status.state)
    })

    await Promise.all([bridge.start(), bridge.start(), bridge.start()])
    await waitFor(() => statusHistory.includes('crashed'))

    expect(statusHistory.filter((state) => state === 'crashed').length).toBe(1)
    expect(bridge.getState().running).toBe(false)
    expect(bridge.getState().status).toBe('crashed')
  })

  test('resolves oldest pending command when response id is omitted', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    let resolved: CommandResult | undefined
    bridge.pending.set('cmd-1', {
      command: 'abort',
      resolve: (result: CommandResult) => {
        resolved = result
      },
      reject: () => {},
    })

    bridge.resolvePending({
      type: 'response',
      command: 'abort',
      success: true,
      data: { ok: true },
    })

    expect(bridge.pending.size).toBe(0)
    expect(resolved?.id).toBe('cmd-1')
    expect(resolved?.command).toBe('abort')
    expect(resolved?.success).toBe(true)
    expect(resolved?.data).toEqual({ ok: true })
  })

  test('rejects oldest pending command when id is omitted and response is a failure', () => {
    const bridge = new PiAgentBridge(process.cwd()) as any

    let rejectedMessage: string | undefined
    bridge.pending.set('cmd-1', {
      command: 'shutdown',
      resolve: () => {},
      reject: (error: Error) => {
        rejectedMessage = error.message
      },
    })

    bridge.resolvePending({
      type: 'response',
      command: 'shutdown',
      success: false,
      error: 'shutdown not allowed',
    })

    expect(bridge.pending.size).toBe(0)
    expect(rejectedMessage).toBe('shutdown not allowed')
  })
})
