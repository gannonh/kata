import { expect, test } from 'bun:test'

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
  delegationLabel: 'Explore workspace sources',
  subagentStatus: 'running' as const,
}

test('Electron session hierarchy projections preserve orchestrator metadata end-to-end', () => {
  const managedFromMetadata = sessionMetadataToManagedHierarchy(hierarchy)
  const rendererHierarchy = managedSessionToRendererHierarchy(managedFromMetadata)
  const storedHierarchy = managedSessionToStoredHierarchy(managedFromMetadata)
  const managedFromStored = storedSessionToManagedHierarchy(storedHierarchy)

  expect(managedFromMetadata).toEqual(hierarchy)
  expect(rendererHierarchy).toEqual(hierarchy)
  expect(storedHierarchy).toEqual(hierarchy)
  expect(managedFromStored).toEqual(hierarchy)
})
