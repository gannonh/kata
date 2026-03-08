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

export function getTopLevelSessions<T extends SessionMeta>(sessions: T[]): T[] {
  return sessions.filter(session => !(session.sessionKind === 'subagent' && session.parentSessionId))
}

export function projectSessionTree(
  visibleRoots: SessionMeta[],
  allSessions: SessionMeta[]
): SessionListItem[] {
  const visibleIds = new Set(visibleRoots.map(session => session.id))
  const childrenByParent = new Map<string, SessionMeta[]>()
  const topLevelSessions: SessionMeta[] = []

  for (const session of allSessions) {
    if (!session.parentSessionId) {
      topLevelSessions.push(session)
      continue
    }

    const siblings = childrenByParent.get(session.parentSessionId) ?? []
    siblings.push(session)
    childrenByParent.set(session.parentSessionId, siblings)
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
