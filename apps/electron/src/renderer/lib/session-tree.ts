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
  const childrenByParent = new Map<string, SessionMeta[]>()

  for (const session of allSessions) {
    if (!session.parentSessionId) {
      continue
    }

    const siblings = childrenByParent.get(session.parentSessionId) ?? []
    siblings.push(session)
    childrenByParent.set(session.parentSessionId, siblings)
  }

  const projected: SessionListItem[] = []
  let treeIndex = 0

  for (const root of sortByLastMessageAtDesc(visibleRoots)) {
    const rootLastMessageAt = root.lastMessageAt ?? 0

    projected.push({
      ...root,
      depth: 0,
      rootSessionId: root.id,
      rootLastMessageAt,
      treeIndex: treeIndex++,
    })

    for (const child of sortByLastMessageAtDesc(childrenByParent.get(root.id) ?? [])) {
      projected.push({
        ...child,
        depth: 1,
        rootSessionId: root.id,
        rootLastMessageAt,
        treeIndex: treeIndex++,
      })
    }
  }

  return projected
}
