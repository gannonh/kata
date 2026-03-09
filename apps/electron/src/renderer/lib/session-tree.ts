import type { SessionMeta } from '@/atoms/sessions'

export interface SessionListItem extends SessionMeta {
  depth: number
  rootSessionId: string
  rootLastMessageAt: number
  treeIndex: number
}

function sortByLastMessageAtDesc<T extends SessionMeta>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0))
}

export function resolveParentSessionId(session: SessionMeta): string | undefined {
  if (session.parentSessionId) {
    return session.parentSessionId
  }

  if (session.sessionKind !== 'subagent') {
    return undefined
  }

  // Child sessions can briefly arrive with partial hierarchy metadata while
  // their live session state is still converging. Fall back to the delegation
  // linkage so they stay nested under the orchestrator tree.
  if (session.delegatedBySessionId && session.delegatedBySessionId !== session.id) {
    return session.delegatedBySessionId
  }

  if (session.orchestratorSessionId && session.orchestratorSessionId !== session.id) {
    return session.orchestratorSessionId
  }

  return undefined
}

export function getTopLevelSessions<T extends SessionMeta>(sessions: T[]): T[] {
  return sessions.filter(session => !resolveParentSessionId(session))
}

export function projectSessionTree(
  visibleRoots: SessionMeta[],
  allSessions: SessionMeta[]
): SessionListItem[] {
  const visibleIds = new Set(visibleRoots.map(session => session.id))
  const sessionIds = new Set(allSessions.map(session => session.id))
  const childrenByParent = new Map<string, SessionMeta[]>()
  const topLevelSessions: SessionMeta[] = []

  for (const session of allSessions) {
    const parentSessionId = resolveParentSessionId(session)

    if (!parentSessionId || !sessionIds.has(parentSessionId)) {
      topLevelSessions.push(session)
      continue
    }

    const siblings = childrenByParent.get(parentSessionId) ?? []
    siblings.push(session)
    childrenByParent.set(parentSessionId, siblings)
  }

  const projected: SessionListItem[] = []
  let treeIndex = 0

  const buildBranch = (
    session: SessionMeta,
    depth: number,
    rootSessionId: string,
    rootLastMessageAt: number,
    ancestorVisible = false
  ): SessionListItem[] => {
    const sessionVisible = ancestorVisible || visibleIds.has(session.id)
    const visibleChildren = sortByLastMessageAtDesc(childrenByParent.get(session.id) ?? [])
      .flatMap(child => buildBranch(child, depth + 1, rootSessionId, rootLastMessageAt, sessionVisible))

    if (!sessionVisible && visibleChildren.length === 0) {
      return []
    }

    return [
      {
        ...session,
        depth,
        rootSessionId,
        rootLastMessageAt,
        treeIndex: treeIndex++,
      },
      ...visibleChildren,
    ]
  }

  for (const root of sortByLastMessageAtDesc(topLevelSessions)) {
    projected.push(...buildBranch(root, 0, root.id, root.lastMessageAt ?? 0))
  }

  return projected
}
