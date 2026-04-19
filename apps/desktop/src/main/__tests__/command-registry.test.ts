import { describe, expect, test } from 'vitest'
import { listBuiltinCommands } from '../command-registry'

describe('command-registry', () => {
  test('listBuiltinCommands returns the expected command names', () => {
    const commands = listBuiltinCommands()

    expect(commands.map((entry) => entry.name)).toEqual([
      'kata',
      'symphony',
      'gh',
      'bg',
      'mcp',
      'create-extension',
      'create-slash-command',
      'audit',
      'subagent',
      'skill',
    ])
  })

  test('listBuiltinCommands returns entries with required shape and builtin category', () => {
    const commands = listBuiltinCommands()

    expect(commands).toHaveLength(10)

    for (const command of commands) {
      expect(command).toMatchObject({
        name: expect.any(String),
        category: 'builtin',
      })
    }
  })

  test('listBuiltinCommands returns a defensive copy', () => {
    const first = listBuiltinCommands()
    const second = listBuiltinCommands()

    first[0]!.name = 'mutated'

    expect(second[0]?.name).toBe('kata')
  })
})
