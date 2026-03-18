import type { SessionConfig, SessionMetadata, StoredSession } from '@craft-agent/shared/sessions'

import type { Session } from '../shared/types'

const SESSION_HIERARCHY_KEYS = [
  'sessionKind',
  'parentSessionId',
  'orchestratorSessionId',
  'agentRole',
  'delegatedBySessionId',
  'delegatedToolUseId',
  'delegationLabel',
  'subagentStatus',
] as const satisfies ReadonlyArray<keyof SessionConfig>

type SessionHierarchyKey = typeof SESSION_HIERARCHY_KEYS[number]
export type SessionHierarchyMetadata = Pick<SessionConfig, SessionHierarchyKey>

export function pickSessionHierarchyMetadata(source: SessionHierarchyMetadata): SessionHierarchyMetadata {
  const picked = {} as SessionHierarchyMetadata
  for (const key of SESSION_HIERARCHY_KEYS) {
    ;(picked as Record<string, unknown>)[key] = source[key]
  }
  return picked
}

export function sessionMetadataToManagedHierarchy(
  metadata: Pick<SessionMetadata, SessionHierarchyKey>
): SessionHierarchyMetadata {
  return pickSessionHierarchyMetadata(metadata)
}

export function storedSessionToManagedHierarchy(
  session: Pick<StoredSession, SessionHierarchyKey>
): SessionHierarchyMetadata {
  return pickSessionHierarchyMetadata(session)
}

export function managedSessionToRendererHierarchy(
  managed: SessionHierarchyMetadata
): Pick<Session, SessionHierarchyKey> {
  return pickSessionHierarchyMetadata(managed)
}

export function managedSessionToStoredHierarchy(
  managed: SessionHierarchyMetadata
): Pick<StoredSession, SessionHierarchyKey> {
  return pickSessionHierarchyMetadata(managed)
}
