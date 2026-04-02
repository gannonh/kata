import { EventEmitter } from 'node:events'
import log from './logger'
import {
  type ChatEvent,
  type PlanningArtifactAction,
  type PlanningArtifactEvent,
  type PlanningArtifactScope,
  type ToolArgs,
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
  'kata_create_milestone',
  'kata_create_slice',
  'kata_create_task',
  'kata_read_document',
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

    const artifactEvent = this.toPlanningArtifactEvent(
      event.toolCallId,
      event.toolName,
      pending?.args,
    )

    if (!artifactEvent) {
      return
    }

    log.info('[planning-tool-detector] planning:tool-detected', {
      toolName: artifactEvent.toolName,
      documentTitle: artifactEvent.title,
      scope: artifactEvent.scope,
      action: artifactEvent.action,
      projectId: artifactEvent.projectId,
      issueId: artifactEvent.issueId,
    })

    this.emit('artifact', artifactEvent)
  }

  private toPlanningArtifactEvent(
    toolCallId: string,
    toolName: string,
    toolArgs: ToolArgs | undefined,
  ): PlanningArtifactEvent | null {
    const args = this.extractRawArgs(toolArgs)
    const title = this.extractTitle(toolName, args)

    if (!title) {
      return null
    }

    const issueId = this.extractIssueId(args)
    const projectId = asString(args.projectId)

    return {
      toolCallId,
      toolName,
      title,
      scope: this.extractScope(args),
      action: this.extractAction(toolName),
      projectId,
      issueId,
    }
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

  private extractTitle(toolName: string, args: Record<string, unknown>): string | null {
    const directTitle = asString(args.title)

    if (toolName === 'kata_write_document' || toolName === 'kata_read_document') {
      if (directTitle) {
        return directTitle
      }

      if (Array.isArray(args.args) && typeof args.args[0] === 'string') {
        return args.args[0]
      }

      return null
    }

    const kataId = asString(args.kataId)

    if (kataId && directTitle) {
      return `[${kataId}] ${directTitle}`
    }

    return directTitle ?? kataId ?? null
  }

  private extractScope(args: Record<string, unknown>): PlanningArtifactScope {
    return this.extractIssueId(args) ? 'issue' : 'project'
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

  private extractAction(toolName: string): PlanningArtifactAction {
    switch (toolName) {
      case 'kata_create_milestone':
      case 'kata_create_slice':
      case 'kata_create_task':
        return 'created'
      default:
        return 'updated'
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
