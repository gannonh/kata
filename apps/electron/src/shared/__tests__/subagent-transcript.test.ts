import { expect, test } from 'bun:test'

import type { Message } from '../types'
import {
  buildSubagentContinuationContext,
  projectSubagentTranscript,
  mergeSubagentTranscript,
} from '../subagent-transcript'

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? 'msg-1',
    role: overrides.role ?? 'tool',
    content: overrides.content ?? '',
    timestamp: overrides.timestamp ?? 1,
    ...overrides,
  }
}

test('projectSubagentTranscript returns only the delegated task subtree', () => {
  const messages: Message[] = [
    createMessage({ id: 'user-1', role: 'user', content: 'Launch two sub-agents', timestamp: 1 }),
    createMessage({
      id: 'task-1',
      role: 'tool',
      toolName: 'Task',
      toolUseId: 'toolu-task-a',
      toolStatus: 'completed',
      content: 'Inspect workspace files',
      timestamp: 2,
    }),
    createMessage({
      id: 'bash-1',
      role: 'tool',
      toolName: 'Terminal',
      toolUseId: 'toolu-bash-a',
      parentToolUseId: 'toolu-task-a',
      toolStatus: 'completed',
      content: 'ls -la\nfoobar.txt',
      timestamp: 3,
    }),
    createMessage({
      id: 'read-1',
      role: 'tool',
      toolName: 'Read',
      toolUseId: 'toolu-read-a',
      parentToolUseId: 'toolu-task-a',
      toolStatus: 'completed',
      content: 'Found foobar in workspace',
      timestamp: 4,
    }),
    createMessage({
      id: 'task-2',
      role: 'tool',
      toolName: 'Task',
      toolUseId: 'toolu-task-b',
      toolStatus: 'completed',
      content: 'Summarize existing files',
      timestamp: 5,
    }),
  ]

  expect(projectSubagentTranscript(messages, 'toolu-task-a').map(message => message.id)).toEqual([
    'task-1',
    'bash-1',
    'read-1',
  ])
})

test('mergeSubagentTranscript appends direct child follow-up messages after projected history', () => {
  const projected = [
    createMessage({
      id: 'task-1',
      role: 'tool',
      toolName: 'Task',
      toolUseId: 'toolu-task-a',
      toolStatus: 'completed',
      content: 'Inspect workspace files',
      timestamp: 1,
    }),
  ]
  const childMessages = [
    createMessage({ id: 'user-2', role: 'user', content: 'What did you find?', timestamp: 10 }),
    createMessage({ id: 'assistant-2', role: 'assistant', content: 'I found foobar.', timestamp: 11 }),
  ]

  expect(mergeSubagentTranscript(projected, childMessages).map(message => message.id)).toEqual([
    'task-1',
    'user-2',
    'assistant-2',
  ])
})

test('buildSubagentContinuationContext carries role, task, and findings into follow-ups', () => {
  const transcript = [
    createMessage({
      id: 'task-1',
      role: 'tool',
      toolName: 'Task',
      toolUseId: 'toolu-task-a',
      toolStatus: 'completed',
      content: 'Inspect workspace files',
      timestamp: 1,
    }),
    createMessage({
      id: 'bash-1',
      role: 'tool',
      toolName: 'Terminal',
      toolUseId: 'toolu-bash-a',
      parentToolUseId: 'toolu-task-a',
      toolStatus: 'completed',
      content: 'ls -la\nfoobar.txt',
      timestamp: 2,
    }),
    createMessage({
      id: 'assistant-1',
      role: 'assistant',
      content: 'I inspected the workspace and found foobar.txt.',
      timestamp: 3,
    }),
  ]

  const prompt = buildSubagentContinuationContext({
    agentRole: 'general-purpose',
    delegationLabel: 'Inspect workspace files',
    transcript,
  })

  expect(prompt).toContain('Sub-agent type: general-purpose')
  expect(prompt).toContain('Delegated task: Inspect workspace files')
  expect(prompt).toContain('foobar.txt')
  expect(prompt).toContain('Do not say you are starting fresh')
})
