import { describe, expect, test } from 'vitest'
import type { ToolCallView } from '@/atoms/chat'
import type { SubagentArgs, SubagentResult } from '@shared/types'
import {
  buildSubagentViewModel,
  formatResultStatusLabel,
  formatStatusLabel,
  getModeBadgeClass,
  getStatusBadgeClass,
  truncateTask,
} from '../SubagentCard'

// ── Helper factories ──────────────────────────────────────────────────────────

function makeToolCallView(overrides: Partial<ToolCallView> = {}): ToolCallView {
  return {
    id: 'tool-1',
    name: 'subagent',
    args: { mode: 'single', agent: 'scout', task: 'Find the auth module' } satisfies SubagentArgs,
    status: 'running',
    ...overrides,
  }
}

function makeSubagentResult(overrides: Partial<SubagentResult> = {}): SubagentResult {
  return {
    mode: 'single',
    results: [{ agent: 'scout', task: 'Find the auth module', exitCode: 0 }],
    ...overrides,
  }
}

// ── truncateTask ──────────────────────────────────────────────────────────────

describe('truncateTask', () => {
  test('returns short text unchanged', () => {
    expect(truncateTask('hello')).toBe('hello')
  })

  test('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(100)
    const result = truncateTask(long, 60)
    expect(result.length).toBe(61) // 60 chars + ellipsis
    expect(result).toMatch(/…$/)
  })

  test('returns text of exactly maxLen unchanged', () => {
    const exact = 'x'.repeat(60)
    expect(truncateTask(exact, 60)).toBe(exact)
  })
})

// ── getStatusBadgeClass ───────────────────────────────────────────────────────

describe('getStatusBadgeClass', () => {
  test('returns amber classes for running', () => {
    expect(getStatusBadgeClass('running')).toContain('amber')
  })

  test('returns emerald classes for done', () => {
    expect(getStatusBadgeClass('done')).toContain('emerald')
  })

  test('returns red classes for error', () => {
    expect(getStatusBadgeClass('error')).toContain('red')
  })
})

// ── getModeBadgeClass ─────────────────────────────────────────────────────────

describe('getModeBadgeClass', () => {
  test('returns muted styling', () => {
    expect(getModeBadgeClass()).toContain('muted')
  })
})

// ── formatStatusLabel ─────────────────────────────────────────────────────────

describe('formatStatusLabel', () => {
  test('running shows agent name', () => {
    expect(formatStatusLabel('running', 'scout')).toBe('Running scout…')
  })

  test('done shows Done', () => {
    expect(formatStatusLabel('done', 'scout')).toBe('Done')
  })

  test('error shows Error', () => {
    expect(formatStatusLabel('error', 'worker')).toBe('Error')
  })
})

// ── formatResultStatusLabel ───────────────────────────────────────────────────

describe('formatResultStatusLabel', () => {
  test('error with message shows exit code and message', () => {
    const label = formatResultStatusLabel({
      agent: 'worker',
      task: 'Deploy',
      taskExcerpt: 'Deploy',
      exitCode: 1,
      errorMessage: 'Permission denied',
      status: 'error',
    })
    expect(label).toBe('exit 1: Permission denied')
  })

  test('error without message shows just exit code', () => {
    const label = formatResultStatusLabel({
      agent: 'worker',
      task: 'Deploy',
      taskExcerpt: 'Deploy',
      exitCode: 1,
      status: 'error',
    })
    expect(label).toBe('exit 1')
  })

  test('running shows running label', () => {
    const label = formatResultStatusLabel({
      agent: 'scout',
      task: 'Find files',
      taskExcerpt: 'Find files',
      exitCode: -1,
      status: 'running',
    })
    expect(label).toBe('running…')
  })

  test('done shows done label', () => {
    const label = formatResultStatusLabel({
      agent: 'scout',
      task: 'Find files',
      taskExcerpt: 'Find files',
      exitCode: 0,
      status: 'done',
    })
    expect(label).toBe('done')
  })
})

// ── buildSubagentViewModel ────────────────────────────────────────────────────

describe('buildSubagentViewModel', () => {
  test('single-mode running → shows agent name, task, running status', () => {
    const tool = makeToolCallView({ status: 'running' })
    const view = buildSubagentViewModel(tool)

    expect(view.agentName).toBe('scout')
    expect(view.task).toBe('Find the auth module')
    expect(view.mode).toBe('single')
    expect(view.status).toBe('running')
    expect(view.results).toHaveLength(0)
  })

  test('single-mode done → shows green status with result', () => {
    const tool = makeToolCallView({
      status: 'done',
      result: makeSubagentResult(),
    })
    const view = buildSubagentViewModel(tool)

    expect(view.agentName).toBe('scout')
    expect(view.task).toBe('Find the auth module')
    expect(view.mode).toBe('single')
    expect(view.status).toBe('done')
    expect(view.results).toHaveLength(1)
    expect(view.results[0]!.status).toBe('done')
    expect(view.results[0]!.exitCode).toBe(0)
  })

  test('single-mode error → shows red status with error details', () => {
    const tool = makeToolCallView({
      status: 'error',
      result: makeSubagentResult({
        results: [
          {
            agent: 'worker',
            task: 'Deploy the app',
            exitCode: 1,
            errorMessage: 'Permission denied',
          },
        ],
      }),
    })
    const view = buildSubagentViewModel(tool)

    expect(view.status).toBe('error')
    expect(view.results).toHaveLength(1)
    expect(view.results[0]!.status).toBe('error')
    expect(view.results[0]!.exitCode).toBe(1)
    expect(view.results[0]!.errorMessage).toBe('Permission denied')
  })

  test('parallel-mode with mixed results → both rows visible', () => {
    const tool = makeToolCallView({
      status: 'done',
      args: {
        mode: 'parallel',
        tasks: [
          { agent: 'scout', task: 'Find files' },
          { agent: 'worker', task: 'Fix bug' },
        ],
      } satisfies SubagentArgs,
      result: makeSubagentResult({
        mode: 'parallel',
        results: [
          { agent: 'scout', task: 'Find files', exitCode: 0 },
          { agent: 'worker', task: 'Fix bug', exitCode: 1, errorMessage: 'Build failed' },
        ],
      }),
    })
    const view = buildSubagentViewModel(tool)

    expect(view.mode).toBe('parallel')
    expect(view.results).toHaveLength(2)
    expect(view.results[0]).toMatchObject({ agent: 'scout', status: 'done' })
    expect(view.results[1]).toMatchObject({ agent: 'worker', status: 'error', errorMessage: 'Build failed' })
  })

  test('chain-mode with step indicators', () => {
    const tool = makeToolCallView({
      status: 'done',
      args: {
        mode: 'chain',
        chain: [
          { agent: 'scout', task: 'Find context' },
          { agent: 'worker', task: 'Implement fix' },
        ],
      } satisfies SubagentArgs,
      result: makeSubagentResult({
        mode: 'chain',
        results: [
          { agent: 'scout', task: 'Find context', exitCode: 0, step: 1 },
          { agent: 'worker', task: 'Implement fix', exitCode: 0, step: 2 },
        ],
      }),
    })
    const view = buildSubagentViewModel(tool)

    expect(view.mode).toBe('chain')
    expect(view.results).toHaveLength(2)
    expect(view.results[0]!.step).toBe(1)
    expect(view.results[1]!.step).toBe(2)
  })

  test('no subagent args → graceful fallback to defaults', () => {
    const tool: ToolCallView = {
      id: 'tool-x',
      name: 'subagent',
      args: { raw: { some: 'unknown data' } },
      status: 'running',
    }
    const view = buildSubagentViewModel(tool)

    expect(view.agentName).toBe('subagent')
    expect(view.task).toBe('')
    expect(view.mode).toBe('single')
    expect(view.status).toBe('running')
    expect(view.results).toHaveLength(0)
  })

  test('running parallel with partial results → in-progress items visible', () => {
    const tool = makeToolCallView({
      status: 'running',
      args: {
        mode: 'parallel',
        tasks: [
          { agent: 'scout', task: 'Task A' },
          { agent: 'worker', task: 'Task B' },
        ],
      } satisfies SubagentArgs,
      result: makeSubagentResult({
        mode: 'parallel',
        results: [
          { agent: 'scout', task: 'Task A', exitCode: 0 },
        ],
      }),
    })
    const view = buildSubagentViewModel(tool)

    expect(view.status).toBe('running')
    expect(view.mode).toBe('parallel')
    expect(view.results).toHaveLength(1)
    expect(view.results[0]).toMatchObject({ agent: 'scout', status: 'done' })
  })

  test('exitCode -1 when toolStatus done → maps to done (not error)', () => {
    // Regression guard: exitCode -1 is the "not yet available" sentinel.
    // When the outer tool is done, an unresolved exit code should be 'done', not 'error'.
    const tool = makeToolCallView({
      status: 'done',
      result: makeSubagentResult({
        mode: 'parallel',
        results: [
          { agent: 'scout', task: 'Find files', exitCode: -1 },
        ],
      }),
    })
    const view = buildSubagentViewModel(tool)

    expect(view.results).toHaveLength(1)
    expect(view.results[0]!.status).toBe('done')
  })

  test('exitCode -1 when toolStatus running → maps to running', () => {
    const tool = makeToolCallView({
      status: 'running',
      result: makeSubagentResult({
        mode: 'parallel',
        results: [
          { agent: 'worker', task: 'Running task', exitCode: -1 },
        ],
      }),
    })
    const view = buildSubagentViewModel(tool)

    expect(view.results).toHaveLength(1)
    expect(view.results[0]!.status).toBe('running')
  })

  test('result mode takes priority over args mode', () => {
    const tool = makeToolCallView({
      status: 'done',
      args: { mode: 'single', agent: 'scout', task: 'test' } satisfies SubagentArgs,
      result: makeSubagentResult({
        mode: 'parallel',
        results: [
          { agent: 'scout', task: 'test', exitCode: 0 },
          { agent: 'worker', task: 'test2', exitCode: 0 },
        ],
      }),
    })
    const view = buildSubagentViewModel(tool)

    // Result mode takes priority
    expect(view.mode).toBe('parallel')
  })
})
