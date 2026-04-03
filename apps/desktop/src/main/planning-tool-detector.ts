import { EventEmitter } from 'node:events'
import log from './logger'
import {
  buildPlanningArtifactKey,
  type ChatEvent,
  type PlanningArtifactEvent,
  type PlanningArtifactScope,
  type ToolArgs,
  type ToolResult,
} from '../shared/types'

interface PendingToolCall {
  toolName: string
  args: ToolArgs
}

interface PlanningToolDetectorEvents {
  artifact: (event: PlanningArtifactEvent) => void
}

const PLANNING_TOOL_NAMES = new Set([
  'kata_write_document',
  'kata_read_document',
  'kata_create_slice',
  'kata_create_task',
  'kata_create_milestone',
])

export class PlanningToolDetector extends EventEmitter {
  private readonly pendingToolCalls = new Map<string, PendingToolCall>()

  override on<K extends keyof PlanningToolDetectorEvents>(
    event: K,
    listener: PlanningToolDetectorEvents[K],
  ): this {
    return super.on(event, listener)
  }

  override emit<K extends keyof PlanningToolDetectorEvents>(
    event: K,
    ...args: Parameters<PlanningToolDetectorEvents[K]>
  ): boolean {
    return super.emit(event, ...args)
  }

  public handleChatEvent(event: ChatEvent): void {
    if (event.type === 'tool_start') {
      this.pendingToolCalls.set(event.toolCallId, {
        toolName: event.toolName,
        args: event.args,
      })
      return
    }

    if (event.type !== 'tool_end') {
      return
    }

    const pending = this.pendingToolCalls.get(event.toolCallId)
    this.pendingToolCalls.delete(event.toolCallId)

    if (!PLANNING_TOOL_NAMES.has(event.toolName) || event.isError) {
      return
    }

    const artifactEvent = this.toPlanningArtifactEvent({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      toolArgs: pending?.args,
      toolResult: event.result,
    })

    if (!artifactEvent) {
      return
    }

    log.info('[planning-tool-detector] planning:tool-detected', {
      toolName: artifactEvent.toolName,
      eventType: artifactEvent.eventType,
      documentTitle: artifactEvent.title,
      scope: artifactEvent.scope,
      action: artifactEvent.action,
      projectId: artifactEvent.projectId,
      issueId: artifactEvent.issueId,
      targetSliceIssueId: artifactEvent.targetSliceIssueId,
    })

    this.emit('artifact', artifactEvent)
  }

  private toPlanningArtifactEvent({
    toolCallId,
    toolName,
    toolArgs,
    toolResult,
  }: {
    toolCallId: string
    toolName: string
    toolArgs: ToolArgs | undefined
    toolResult: ToolResult | undefined
  }): PlanningArtifactEvent | null {
    const args = this.extractRawArgs(toolArgs)
    const result = this.extractRawResult(toolResult)

    const projectId = asString(args.projectId)

    if (toolName === 'kata_write_document' || toolName === 'kata_read_document') {
      const title = this.extractDocumentTitle(args)
      if (!title) {
        return null
      }

      const issueId = this.extractIssueId(args)
      const scope = issueId ? 'issue' : 'project'

      return {
        eventType: 'document',
        toolCallId,
        toolName,
        title,
        artifactKey: buildPlanningArtifactKey({
          title,
          scope,
          projectId,
          issueId,
        }),
        scope,
        action: 'updated',
        projectId,
        issueId,
      }
    }

    if (toolName === 'kata_create_slice') {
      const rawTitle = asString(args.title)
      if (!rawTitle) {
        return null
      }

      const sliceId = asString(args.kataId) ?? extractKataId(rawTitle, 'S')
      if (!sliceId) {
        return null
      }

      const normalizedSliceTitle = stripKataIdPrefix(rawTitle, sliceId)
      const displayTitle = `[${sliceId}] ${normalizedSliceTitle || rawTitle}`
      const description = asString(args.description) ?? ''

      const sliceIssueId =
        this.extractIssueId(result) ?? this.extractIssueId(args) ?? this.extractIssueFromCreateResult(result)

      const scope: PlanningArtifactScope = sliceIssueId ? 'issue' : 'project'

      return {
        eventType: 'slice_created',
        toolCallId,
        toolName,
        title: displayTitle,
        artifactKey: buildPlanningArtifactKey({
          title: displayTitle,
          scope,
          projectId,
          issueId: sliceIssueId,
        }),
        scope,
        action: 'created',
        projectId,
        issueId: sliceIssueId,
        slice: {
          id: sliceId,
          title: normalizedSliceTitle || rawTitle,
          description,
          issueId: sliceIssueId,
        },
      }
    }

    if (toolName === 'kata_create_task') {
      const rawTitle = asString(args.title)
      if (!rawTitle) {
        return null
      }

      const taskId = asString(args.kataId) ?? extractKataId(rawTitle, 'T')
      if (!taskId) {
        return null
      }

      const sliceIssueId = this.extractIssueId(args)
      if (!sliceIssueId) {
        return null
      }

      const taskTitle = stripKataIdPrefix(rawTitle, taskId) || rawTitle
      const description = asString(args.description) ?? ''

      return {
        eventType: 'task_created',
        toolCallId,
        toolName,
        title: `slice:${sliceIssueId}`,
        artifactKey: buildPlanningArtifactKey({
          title: `slice:${sliceIssueId}`,
          scope: 'issue',
          issueId: sliceIssueId,
          projectId,
        }),
        scope: 'issue',
        action: 'updated',
        projectId,
        issueId: sliceIssueId,
        targetSliceIssueId: sliceIssueId,
        task: {
          id: taskId,
          title: taskTitle,
          description,
          status: 'todo',
        },
      }
    }

    if (toolName === 'kata_create_milestone') {
      const milestoneId = asString(args.kataId) ?? extractKataId(asString(args.title), 'M')
      if (!milestoneId) {
        return null
      }

      const roadmapTitle = `${milestoneId}-ROADMAP`

      return {
        eventType: 'milestone_created',
        toolCallId,
        toolName,
        title: roadmapTitle,
        artifactKey: buildPlanningArtifactKey({
          title: roadmapTitle,
          scope: 'project',
          projectId,
        }),
        scope: 'project',
        action: 'updated',
        projectId,
      }
    }

    return null
  }

  private extractRawArgs(toolArgs: ToolArgs | undefined): Record<string, unknown> {
    if (!toolArgs) {
      return {}
    }

    if ('raw' in toolArgs && isRecord(toolArgs.raw)) {
      return toolArgs.raw
    }

    if (isRecord(toolArgs)) {
      return toolArgs
    }

    return {}
  }

  private extractRawResult(toolResult: ToolResult | undefined): Record<string, unknown> {
    if (!toolResult) {
      return {}
    }

    if ('raw' in toolResult && isRecord(toolResult.raw)) {
      return toolResult.raw
    }

    if (isRecord(toolResult)) {
      return toolResult
    }

    return {}
  }

  private extractDocumentTitle(args: Record<string, unknown>): string | null {
    const directTitle = asString(args.title)
    if (directTitle) {
      return directTitle
    }

    if (Array.isArray(args.args) && typeof args.args[0] === 'string') {
      return args.args[0]
    }

    return null
  }

  private extractIssueId(args: Record<string, unknown>): string | undefined {
    const issueId = asString(args.issueId)
    if (issueId) {
      return issueId
    }

    const sliceIssueId = asString(args.sliceIssueId)
    if (sliceIssueId) {
      return sliceIssueId
    }

    const parentId = asString(args.parentId)
    if (parentId) {
      return parentId
    }

    return undefined
  }

  private extractIssueFromCreateResult(result: Record<string, unknown>): string | undefined {
    const directIssueId = asString(result.id) ?? asString(result.issueId)
    if (directIssueId) {
      return directIssueId
    }

    if (isRecord(result.issue)) {
      return asString(result.issue.id)
    }

    if (isRecord(result.sliceIssue)) {
      return asString(result.sliceIssue.id)
    }

    if (isRecord(result.data) && isRecord(result.data.issue)) {
      return asString(result.data.issue.id)
    }

    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function extractKataId(rawValue: string | undefined, prefix: 'M' | 'S' | 'T'): string | undefined {
  if (!rawValue) {
    return undefined
  }

  const trimmed = rawValue.trim()
  const pattern = new RegExp(`${prefix}\\d+`, 'i')
  const match = trimmed.match(pattern)
  if (!match) {
    return undefined
  }

  return match[0].toUpperCase()
}

function stripKataIdPrefix(rawTitle: string, kataId: string): string {
  const escapedKataId = kataId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return rawTitle
    .replace(new RegExp(`^\\[${escapedKataId}\\]\\s*`, 'i'), '')
    .replace(new RegExp(`^${escapedKataId}[:\\-\\s]+`, 'i'), '')
    .trim()
}
