export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function countTextLines(value: string): number {
  if (value.length === 0) {
    return 0
  }

  const normalized = value.replace(/\r\n/g, '\n')
  const lineCount = normalized.split('\n').length

  return normalized.endsWith('\n') ? Math.max(0, lineCount - 1) : lineCount
}
