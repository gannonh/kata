import { describe, expect, test } from 'vitest'
import { PlanningToolDetector } from '../planning-tool-detector'
import type { PlanningArtifactEvent } from '../../shared/types'

describe('PlanningToolDetector', () => {
  test('emits planning artifact event for kata_write_document on tool_end', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-1',
      toolName: 'kata_write_document',
      args: {
        raw: {
          title: 'M001-ROADMAP',
          projectId: 'project-123',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-1',
      toolName: 'kata_write_document',
      isError: false,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      toolCallId: 'tool-1',
      toolName: 'kata_write_document',
      title: 'M001-ROADMAP',
      artifactKey: 'project:project-123:M001-ROADMAP',
      scope: 'project',
      action: 'updated',
      projectId: 'project-123',
      issueId: undefined,
    })
  })

  test('emits for kata_read_document and ignores failed, unrelated, or non-document planning tools', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-3',
      toolName: 'kata_read_document',
      args: {
        raw: {
          title: 'DECISIONS',
          issueId: 'issue-789',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-3',
      toolName: 'kata_read_document',
      isError: false,
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-4',
      toolName: 'kata_write_document',
      args: { raw: { title: 'SHOULD-NOT-EMIT' } },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-4',
      toolName: 'kata_write_document',
      isError: true,
      error: 'failed',
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-5',
      toolName: 'bash',
      isError: false,
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-6',
      toolName: 'kata_create_task',
      args: {
        raw: {
          title: 'Should not emit as document artifact',
          sliceIssueId: 'issue-should-not-fetch',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-6',
      toolName: 'kata_create_task',
      isError: false,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      toolName: 'kata_read_document',
      title: 'DECISIONS',
      artifactKey: 'issue:issue-789:DECISIONS',
      scope: 'issue',
      action: 'updated',
      issueId: 'issue-789',
    })
  })
})
