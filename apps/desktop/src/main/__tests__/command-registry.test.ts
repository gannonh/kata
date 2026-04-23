import { describe, expect, test } from 'vitest'
import { listBuiltinCommands } from '../command-registry'

describe('command-registry', () => {
  test('[R002] listBuiltinCommands returns the expected builtin slash command names', () => {
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

  test('[R002] listBuiltinCommands entries keep required shape and builtin category', () => {
    const commands = listBuiltinCommands()

    expect(commands).toHaveLength(10)

    for (const command of commands) {
      expect(command).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        category: 'builtin',
      })
      expect(command.description?.trim().length).toBeGreaterThan(0)
    }
  })

  test('[R002] listBuiltinCommands is deterministic and free of duplicate names', () => {
    const commands = listBuiltinCommands()
    const uniqueNames = new Set(commands.map((entry) => entry.name))

    expect(uniqueNames.size).toBe(commands.length)
  })

  test('listBuiltinCommands returns a defensive copy', () => {
    const first = listBuiltinCommands()
    const second = listBuiltinCommands()

    first[0]!.name = 'mutated'

    expect(second[0]?.name).toBe('kata')
  })
})
