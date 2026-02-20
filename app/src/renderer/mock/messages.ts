import { type ChatMessage } from '../types/chat'

export const mockMessages: ChatMessage[] = [
  {
    id: 'assistant-1',
    role: 'assistant',
    content: [
      '## Session Kickoff',
      '',
      '- Goal: build desktop mock UI for phase 1',
      '- Focus: validate layout and interactions'
    ].join('\n')
  },
  {
    id: 'user-1',
    role: 'user',
    content: 'Start by showing me the current phase status from planning files.'
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    content: 'I can pull the phase state and summarize any blockers before we execute.'
  },
  {
    id: 'assistant-3',
    role: 'assistant',
    content: 'Collected state from planning artifacts and highlighted pending work.',
    toolCalls: [
      {
        id: 'tool-1',
        name: 'read_file',
        args: { path: '.planning/STATE.md' },
        output: 'Current phase: 2A complete. Next active phase: 3.'
      }
    ]
  },
  {
    id: 'user-2',
    role: 'user',
    content: 'Great. Can you list what belongs in the center panel wave?'
  },
  {
    id: 'assistant-4',
    role: 'assistant',
    content: [
      '### Wave 4 Center Panel',
      '',
      '- Message list with auto-scroll',
      '- User and assistant bubbles',
      '- Tool call trace blocks',
      '- Streaming status and input'
    ].join('\n')
  },
  {
    id: 'user-3',
    role: 'user',
    content: 'Make sure the mock chat feels realistic for demo purposes.'
  },
  {
    id: 'assistant-5',
    role: 'assistant',
    content: 'Understood. I will seed a realistic multi-turn transcript and simulate streamed responses.'
  },
  {
    id: 'assistant-6',
    role: 'assistant',
    content: 'I also verified the command surface for local app checks.',
    toolCalls: [
      {
        id: 'tool-2',
        name: 'exec_command',
        args: { cmd: 'npm run -w app test' },
        output: 'Tests scheduled after implementation.'
      }
    ]
  },
  {
    id: 'user-4',
    role: 'user',
    content: 'Proceed with Wave 4 implementation using strict TDD.'
  }
]
