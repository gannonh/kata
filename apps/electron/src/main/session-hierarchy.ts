import type { SessionKind, SubagentStatus } from '@craft-agent/core/types'
import type { SessionMetadata, StoredSession } from '@craft-agent/shared/sessions'

import type { Session } from '../shared/types'

export interface SessionHierarchyMetadata {
  sessionKind?: SessionKind
  parentSessionId?: string
  orchestratorSessionId?: string
  agentRole?: string
  delegatedBySessionId?: string
  delegationLabel?: string
  subagentStatus?: SubagentStatus
}

export function pickSessionHierarchyMetadata(source: SessionHierarchyMetadata): SessionHierarchyMetadata {
  return {
    sessionKind: source.sessionKind,
    parentSessionId: source.parentSessionId,
    orchestratorSessionId: source.orchestratorSessionId,
    agentRole: source.agentRole,
    delegatedBySessionId: source.delegatedBySessionId,
    delegationLabel: source.delegationLabel,
    subagentStatus: source.subagentStatus,
  }
}

export function sessionMetadataToManagedHierarchy(
  metadata: Pick<SessionMetadata, keyof SessionHierarchyMetadata>
): SessionHierarchyMetadata {
  return pickSessionHierarchyMetadata(metadata)
}

export function storedSessionToManagedHierarchy(
  session: Pick<StoredSession, keyof SessionHierarchyMetadata>
): SessionHierarchyMetadata {
  return pickSessionHierarchyMetadata(session)
}

export function managedSessionToRendererHierarchy(
  managed: SessionHierarchyMetadata
): Pick<Session, keyof SessionHierarchyMetadata> {
  return pickSessionHierarchyMetadata(managed)
}

export function managedSessionToStoredHierarchy(
  managed: SessionHierarchyMetadata
): Pick<StoredSession, keyof SessionHierarchyMetadata> {
  return pickSessionHierarchyMetadata(managed)
}
