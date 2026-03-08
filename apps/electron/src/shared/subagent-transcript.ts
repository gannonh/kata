import type { Message } from './types'

function summarizeMessageContent(message: Message): string | undefined {
  const content = message.toolResult ?? message.content
  const normalized = content.trim().replace(/\s+/g, ' ')
  if (!normalized) return undefined
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized
}

export function projectSubagentTranscript(
  messages: Message[],
  delegatedToolUseId?: string
): Message[] {
  if (!delegatedToolUseId) return []

  const delegatedTreeToolIds = new Set<string>([delegatedToolUseId])
  const projected: Message[] = []

  for (const message of messages) {
    if (message.role === 'tool') {
      const isRootTask = message.toolUseId === delegatedToolUseId
      const isChildTool = !!message.parentToolUseId && delegatedTreeToolIds.has(message.parentToolUseId)
      if (isRootTask || isChildTool) {
        projected.push(message)
        if (message.toolUseId) delegatedTreeToolIds.add(message.toolUseId)
      }
      continue
    }

    if (message.parentToolUseId && delegatedTreeToolIds.has(message.parentToolUseId)) {
      projected.push(message)
    }
  }

  return projected
}

export function mergeSubagentTranscript(
  projectedMessages: Message[],
  childMessages: Message[]
): Message[] {
  const merged = [...projectedMessages, ...childMessages]
  const seen = new Set<string>()

  return merged
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((message) => {
      if (seen.has(message.id)) return false
      seen.add(message.id)
      return true
    })
}

export function buildSubagentContinuationContext({
  agentRole,
  delegationLabel,
  transcript,
}: {
  agentRole?: string
  delegationLabel?: string
  transcript: Message[]
}): string {
  const activityLines = transcript
    .map((message) => {
      if (message.role === 'tool') {
        const toolName = message.toolDisplayName ?? message.toolName ?? 'Tool'
        const summary = summarizeMessageContent(message)
        return summary ? `- ${toolName}: ${summary}` : `- ${toolName}`
      }

      if (message.role === 'assistant') {
        const summary = summarizeMessageContent(message)
        return summary ? `- Assistant: ${summary}` : undefined
      }

      return undefined
    })
    .filter((line): line is string => !!line)
    .slice(-8)

  const sections = [
    '<subagent_context>',
    'You are continuing an existing delegated sub-agent chat.',
    `Sub-agent type: ${agentRole?.trim() || 'general-purpose'}`,
    delegationLabel ? `Delegated task: ${delegationLabel}` : undefined,
    activityLines.length > 0
      ? `Completed sub-agent activity:\n${activityLines.join('\n')}`
      : undefined,
    'Continue as this same sub-agent. Do not say you are starting fresh or that you have not done this work.',
    '</subagent_context>',
  ].filter((line): line is string => !!line)

  return sections.join('\n')
}
