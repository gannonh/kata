import log from './logger'
import type { SlashCommandEntry } from '../shared/types'

/**
 * Static Desktop fallback for built-in slash commands.
 *
 * Revisability (D002): this can be replaced by a dynamic CLI RPC source once
 * command discovery is exposed from the running Kata subprocess.
 */
export const BUILTIN_COMMANDS: ReadonlyArray<SlashCommandEntry> = [
  { name: 'kata', description: 'Kata workflow command surface', category: 'builtin' },
  { name: 'symphony', description: 'Symphony operator controls', category: 'builtin' },
  { name: 'gh', description: 'GitHub helpers', category: 'builtin' },
  { name: 'bg', description: 'Background process controls', category: 'builtin' },
  { name: 'mcp', description: 'MCP server and tool gateway', category: 'builtin' },
  { name: 'create-extension', description: 'Scaffold a new extension', category: 'builtin' },
  {
    name: 'create-slash-command',
    description: 'Scaffold a slash command extension',
    category: 'builtin',
  },
  { name: 'audit', description: 'Inspect slash command quality', category: 'builtin' },
  { name: 'subagent', description: 'Run a delegated subagent', category: 'builtin' },
  { name: 'skill', description: 'Execute installed skills', category: 'builtin' },
]

export function listBuiltinCommands(): SlashCommandEntry[] {
  const commands = BUILTIN_COMMANDS.map((entry) => ({ ...entry }))
  log.debug('[command-registry] listed builtin commands', { count: commands.length })
  return commands
}
