import { describe, expect, test } from 'vitest'
import { PlanningToolDetector } from '../planning-tool-detector'
import type { PlanningArtifactEvent } from '../../shared/types'

describe('PlanningToolDetector', () => {
  test('emits document planning artifact event for kata_write_document on tool_end', () => {
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
      eventType: 'document',
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

  test('emits slice_created event with normalized slice data for kata_create_slice', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-slice-1',
      toolName: 'kata_create_slice',
      args: {
        raw: {
          kataId: 'S01',
          title: '[S01] Build planning pane slice view',
          description: 'Render slice description and task checklist.',
          projectId: 'project-123',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-slice-1',
      toolName: 'kata_create_slice',
      isError: false,
      result: {
        raw: {
          id: 'slice-issue-1',
        },
      },
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      eventType: 'slice_created',
      toolCallId: 'tool-slice-1',
      toolName: 'kata_create_slice',
      title: '[S01] Build planning pane slice view',
      artifactKey: 'issue:slice-issue-1:[S01] Build planning pane slice view',
      scope: 'issue',
      action: 'created',
      projectId: 'project-123',
      issueId: 'slice-issue-1',
      slice: {
        id: 'S01',
        title: 'Build planning pane slice view',
        description: 'Render slice description and task checklist.',
        issueId: 'slice-issue-1',
      },
    })
  })

  test('emits task_created event for kata_create_task using parent slice issue id', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-task-1',
      toolName: 'kata_create_task',
      args: {
        raw: {
          kataId: 'T01',
          title: '[T01] Render task checklist item',
          description: 'Include task id, title, status, and expandable details.',
          sliceIssueId: 'slice-issue-1',
          projectId: 'project-123',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-task-1',
      toolName: 'kata_create_task',
      isError: false,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      eventType: 'task_created',
      toolCallId: 'tool-task-1',
      toolName: 'kata_create_task',
      title: 'slice:slice-issue-1',
      artifactKey: 'issue:slice-issue-1:slice:slice-issue-1',
      scope: 'issue',
      action: 'updated',
      projectId: 'project-123',
      issueId: 'slice-issue-1',
      targetSliceIssueId: 'slice-issue-1',
      task: {
        id: 'T01',
        title: 'Render task checklist item',
        description: 'Include task id, title, status, and expandable details.',
        status: 'todo',
      },
    })
  })

  test('maps task status from create_task phase payloads', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-task-status-progress',
      toolName: 'kata_create_task',
      args: {
        raw: {
          kataId: 'T02',
          title: '[T02] In-progress task',
          description: 'task body',
          sliceIssueId: 'slice-issue-1',
          initialPhase: 'executing',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-task-status-progress',
      toolName: 'kata_create_task',
      isError: false,
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-task-status-done',
      toolName: 'kata_create_task',
      args: {
        raw: {
          kataId: 'T03',
          title: '[T03] Completed task',
          description: 'task body',
          sliceIssueId: 'slice-issue-1',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-task-status-done',
      toolName: 'kata_create_task',
      isError: false,
      result: {
        raw: {
          status: 'done',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-task-status-result-overrides-args',
      toolName: 'kata_create_task',
      args: {
        raw: {
          kataId: 'T04',
          title: '[T04] Result precedence task',
          description: 'task body',
          sliceIssueId: 'slice-issue-1',
          initialPhase: 'executing',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-task-status-result-overrides-args',
      toolName: 'kata_create_task',
      isError: false,
      result: {
        raw: {
          status: 'completed',
        },
      },
    })

    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({
      eventType: 'task_created',
      task: {
        id: 'T02',
        status: 'in_progress',
      },
    })
    expect(events[1]).toMatchObject({
      eventType: 'task_created',
      task: {
        id: 'T03',
        status: 'done',
      },
    })
    expect(events[2]).toMatchObject({
      eventType: 'task_created',
      task: {
        id: 'T04',
        status: 'done',
      },
    })
  })

  test('emits milestone_created roadmap refresh event for kata_create_milestone', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-milestone-1',
      toolName: 'kata_create_milestone',
      args: {
        raw: {
          kataId: 'M002',
          title: '[M002] Planning View',
          projectId: 'project-123',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-milestone-1',
      toolName: 'kata_create_milestone',
      isError: false,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      eventType: 'milestone_created',
      toolCallId: 'tool-milestone-1',
      toolName: 'kata_create_milestone',
      title: 'M002-ROADMAP',
      artifactKey: 'project:project-123:M002-ROADMAP',
      scope: 'project',
      action: 'updated',
      projectId: 'project-123',
    })
  })

  test('uses positional args fallback for document title extraction', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-read-args-array',
      toolName: 'kata_read_document',
      args: {
        raw: {
          args: ['REQUIREMENTS'],
          issueId: 'issue-321',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-read-args-array',
      toolName: 'kata_read_document',
      isError: false,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: 'document',
      title: 'REQUIREMENTS',
      artifactKey: 'issue:issue-321:REQUIREMENTS',
    })
  })

  test('extracts slice issue id from nested result.issue payload', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-slice-nested',
      toolName: 'kata_create_slice',
      args: {
        raw: {
          title: 'S02: Build nested issue extraction',
          description: 'Slice description from args.',
          projectId: 'project-777',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-slice-nested',
      toolName: 'kata_create_slice',
      isError: false,
      result: {
        raw: {
          issue: {
            id: 'slice-issue-nested',
          },
        },
      },
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: 'slice_created',
      scope: 'issue',
      issueId: 'slice-issue-nested',
      artifactKey: 'issue:slice-issue-nested:[S02] Build nested issue extraction',
    })
  })

  test('extracts issue id from data.issue and supports task id/title fallback parsing', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-slice-data',
      toolName: 'kata_create_slice',
      args: {
        raw: {
          title: 'S03 - Data issue extraction',
          description: 'Slice desc',
          projectId: 'project-888',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-slice-data',
      toolName: 'kata_create_slice',
      isError: false,
      result: {
        raw: {
          data: {
            issue: {
              id: 'slice-issue-data',
            },
          },
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-task-parent',
      toolName: 'kata_create_task',
      args: {
        raw: {
          title: 'T09 - ParentId fallback task',
          description: 'Task description',
          parentId: 'slice-issue-data',
          projectId: 'project-888',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-task-parent',
      toolName: 'kata_create_task',
      isError: false,
    })

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      eventType: 'slice_created',
      issueId: 'slice-issue-data',
    })
    expect(events[1]).toMatchObject({
      eventType: 'task_created',
      issueId: 'slice-issue-data',
      targetSliceIssueId: 'slice-issue-data',
      task: {
        id: 'T09',
        title: 'ParentId fallback task',
        status: 'todo',
      },
    })
  })

  test('falls back to project scope when create_slice result has no issue id', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'tool-slice-project-scope',
      toolName: 'kata_create_slice',
      args: {
        raw: {
          title: '[S12] Project scope slice',
          description: 'No issue id in args/result.',
          projectId: 'project-xyz',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'tool-slice-project-scope',
      toolName: 'kata_create_slice',
      isError: false,
      result: {
        raw: {
          created: true,
        },
      },
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: 'slice_created',
      scope: 'project',
      issueId: undefined,
      artifactKey: 'project:project-xyz:[S12] Project scope slice',
    })
  })

  test('ignores malformed planning payloads and non-tool events', () => {
    const detector = new PlanningToolDetector()
    const events: PlanningArtifactEvent[] = []

    detector.on('artifact', (event) => {
      events.push(event)
    })

    detector.handleChatEvent({
      type: 'turn_start',
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'bad-task',
      toolName: 'kata_create_task',
      args: {
        raw: {
          title: 'Task without id token',
          sliceIssueId: 'slice-issue-1',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'bad-task-mid-string-id',
      toolName: 'kata_create_task',
      args: {
        raw: {
          title: 'Retry T2 implementation details',
          sliceIssueId: 'slice-issue-1',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'bad-task',
      toolName: 'kata_create_task',
      isError: false,
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'bad-task-mid-string-id',
      toolName: 'kata_create_task',
      isError: false,
    })

    detector.handleChatEvent({
      type: 'tool_start',
      toolCallId: 'bad-milestone',
      toolName: 'kata_create_milestone',
      args: {
        raw: {
          title: 'Milestone without id',
          projectId: 'project-1',
        },
      },
    })

    detector.handleChatEvent({
      type: 'tool_end',
      toolCallId: 'bad-milestone',
      toolName: 'kata_create_milestone',
      isError: false,
    })

    expect(events).toHaveLength(0)
  })

  test('emits for kata_read_document and ignores failed or unrelated tools', () => {
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

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: 'document',
      toolName: 'kata_read_document',
      title: 'DECISIONS',
      artifactKey: 'issue:issue-789:DECISIONS',
      scope: 'issue',
      action: 'updated',
      issueId: 'issue-789',
    })
  })
})
