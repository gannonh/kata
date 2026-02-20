export type ChatRole = 'user' | 'assistant'

export type ToolCallRecord = {
  id: string
  name: string
  args: Record<string, unknown>
  output: string
}

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  toolCalls?: ToolCallRecord[]
}
