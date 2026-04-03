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
      const taskStatus = resolveTaskStatus(args, result)

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
          status: taskStatus,
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

    // CLI tool results wrap responses as { content: [{ type: "text", text: "..." }] }.
    // The text may contain a JSON-serialized object with the issue ID.
    const textContent = this.extractTextFromContent(result)
    if (textContent) {
      try {
        const parsed = JSON.parse(textContent)
        if (isRecord(parsed)) {
          return asString(parsed.id) ?? asString(parsed.issueId)
        }
      } catch {
        // Text content may contain the issue ID as a UUID pattern
        const uuidMatch = textContent.match(
          /\b(?:id|issueId|issue_id)["']?\s*[:=]\s*["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
        )
        if (uuidMatch?.[1]) {
          return uuidMatch[1]
        }
      }
    }

    return undefined
  }

  private extractTextFromContent(result: Record<string, unknown>): string | undefined {
    const content = result.content
    if (!Array.isArray(content)) {
      return undefined
    }

    for (const item of content) {
      if (isRecord(item) && item.type === 'text' && typeof item.text === 'string') {
        return item.text
      }
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
  const leadingPattern = new RegExp(`^\\[?(${prefix}\\d+)\\]?(?=\\b|[:\\-\\s])`, 'i')
  const leadingMatch = trimmed.match(leadingPattern)
  if (!leadingMatch?.[1]) {
    return undefined
  }

  return leadingMatch[1].toUpperCase()
}

function stripKataIdPrefix(rawTitle: string, kataId: string): string {
  const escapedKataId = kataId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return rawTitle
    .replace(new RegExp(`^\\[${escapedKataId}\\]\\s*`, 'i'), '')
    .replace(new RegExp(`^${escapedKataId}[:\\-\\s]+`, 'i'), '')
    .trim()
}

function resolveTaskStatus(
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): 'todo' | 'in_progress' | 'done' {
  const candidates: Array<string | undefined> = [
    asString(result.initialPhase),
    asString(result.phase),
    asString(result.status),
  ]

  const issuePayload = isRecord(result.issue) ? result.issue : undefined
  const taskPayload = isRecord(result.task) ? result.task : undefined
  const statePayload = isRecord(issuePayload?.state) ? issuePayload.state : undefined

  candidates.push(
    asString(issuePayload?.status),
    asString(issuePayload?.phase),
    asString(issuePayload?.state),
    asString(statePayload?.name),
    asString(statePayload?.type),
    asString(taskPayload?.status),
    asString(taskPayload?.phase),
    asString(args.initialPhase),
    asString(args.phase),
    asString(args.status),
  )

  for (const candidate of candidates) {
    const normalized = normalizePhase(candidate)
    if (!normalized) {
      continue
    }

    if (
      normalized === 'done' ||
      normalized === 'completed' ||
      normalized === 'complete' ||
      normalized === 'closed'
    ) {
      return 'done'
    }

    if (
      normalized === 'in_progress' ||
      normalized === 'progress' ||
      normalized === 'started' ||
      normalized === 'starting' ||
      normalized === 'executing' ||
      normalized === 'doing' ||
      normalized === 'active' ||
      normalized === 'in_review' ||
      normalized === 'review'
    ) {
      return 'in_progress'
    }
  }

  return 'todo'
}

function normalizePhase(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
