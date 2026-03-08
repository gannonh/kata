import { expect, test } from 'bun:test'

import type { SessionMetadata, StoredSession } from '@craft-agent/shared/sessions'

import type { Session } from '../../shared/types'
import {
  managedSessionToRendererHierarchy,
  managedSessionToStoredHierarchy,
  sessionMetadataToManagedHierarchy,
  storedSessionToManagedHierarchy,
} from '../session-hierarchy'

const hierarchy = {
  sessionKind: 'subagent' as const,
  parentSessionId: '260308-root',
  orchestratorSessionId: '260308-root',
  agentRole: 'Explore',
  delegatedBySessionId: '260308-root',
  delegatedToolUseId: 'toolu-task-a',
  delegationLabel: 'Explore workspace sources',
  subagentStatus: 'running' as const,
}

test('Electron session hierarchy projections preserve orchestrator metadata across metadata renderer and storage surfaces', () => {
  const metadata: Pick<SessionMetadata, keyof typeof hierarchy> = { ...hierarchy }
  const managedFromMetadata = sessionMetadataToManagedHierarchy(metadata)
  const rendererHierarchy = managedSessionToRendererHierarchy(managedFromMetadata)
  const storedHierarchy = managedSessionToStoredHierarchy(managedFromMetadata)
  const storedSession: Pick<StoredSession, keyof typeof hierarchy> = { ...storedHierarchy }
  const managedFromStored = storedSessionToManagedHierarchy(storedSession)
  const rendererSession: Pick<Session, keyof typeof hierarchy> = { ...rendererHierarchy }

  expect(managedFromMetadata).toEqual(hierarchy)
  expect(rendererSession).toEqual(hierarchy)
  expect(storedSession).toEqual(hierarchy)
  expect(managedFromStored).toEqual(hierarchy)
})
