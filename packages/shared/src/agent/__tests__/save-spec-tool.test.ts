import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { createSaveSpecTool } from '../session-scoped-tools'

const TEST_SESSION_PATH = join(import.meta.dir, '__fixtures__', 'test-session')

beforeEach(() => {
  mkdirSync(TEST_SESSION_PATH, { recursive: true })
})

afterEach(() => {
  rmSync(TEST_SESSION_PATH, { recursive: true, force: true })
})

describe('createSaveSpecTool', () => {
  test('creates a tool with name save_spec', () => {
    const toolDef = createSaveSpecTool(TEST_SESSION_PATH)
    expect(toolDef.name).toBe('save_spec')
  })

  test('writes spec content to spec.md in session directory', async () => {
    const toolDef = createSaveSpecTool(TEST_SESSION_PATH)
    const specContent = '# My Spec\n\n## Goal\nBuild something great'

    // SdkMcpToolDefinition exposes .handler (not .execute)
    await toolDef.handler({ content: specContent }, {})

    const specPath = join(TEST_SESSION_PATH, 'spec.md')
    expect(existsSync(specPath)).toBe(true)
    expect(readFileSync(specPath, 'utf-8')).toBe(specContent)
  })

  test('overwrites existing spec on re-save', async () => {
    const toolDef = createSaveSpecTool(TEST_SESSION_PATH)

    await toolDef.handler({ content: 'Version 1' }, {})
    await toolDef.handler({ content: 'Version 2' }, {})

    const specPath = join(TEST_SESSION_PATH, 'spec.md')
    expect(readFileSync(specPath, 'utf-8')).toBe('Version 2')
  })
})
