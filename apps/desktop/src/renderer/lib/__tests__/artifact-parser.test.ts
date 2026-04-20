import { describe, expect, test } from 'vitest'
import {
  detectArtifactType,
  parseContext,
  parseDecisions,
  parseRequirements,
  parseRoadmap,
} from '../artifact-parser'

const ROADMAP_SAMPLE = `# M002: Planning View

**Vision:** When a user runs /kata plan in the Desktop chat, the right pane comes alive.

## Success Criteria

* ROADMAP renders with slice cards showing checkboxes, colored risk badges, dependency tags, and demo lines
* REQUIREMENTS renders as a structured table with status badges

## Slices

- [ ] **S01: Artifact Detection and Linear API Bridge** \`risk:high\` \`depends:[]\`

  > After this: the pane detects planning tool calls and fetches docs from Linear.
- [x] **S02: Rich Structured Rendering for Planning Artifacts** \`risk:medium\` \`depends:[S01]\`

  > After this: ROADMAP, REQUIREMENTS, DECISIONS, and CONTEXT have rich structured renderers.
- [ ] **S03: Auto-Switch, Navigation, and Integration Polish** \`risk:low\` \`depends:[S01,S02]\`

  > After this: right pane auto-switching and smooth updates are complete.

## Boundary Map

### S01 → S02, S03

Produces:

* PlanningPane shell
* planningArtifactsAtom + activePlanningArtifactAtom
`

const REQUIREMENTS_SAMPLE = `# Requirements

## Active

### R009 — Live rendering of planning artifacts in right pane

* Class: primary-user-loop
* Status: active
* Description: During /kata plan sessions, the right pane renders ROADMAP, REQUIREMENTS, DECISIONS, CONTEXT as structured docs.
* Primary owning slice: M002/S01
* Validation: unmapped

### R010 — Contextual right-pane switching

* Class: primary-user-loop
* Status: active
* Description: Right pane switches between planning and kanban contexts.
* Primary owning slice: M003/S01
* Validation: unmapped

## Validated

### R001 — pi-coding-agent as agent runtime

* Class: core-capability
* Status: validated
* Description: Desktop runs pi-coding-agent via kata --mode rpc.
* Primary owning slice: M001/S01
* Validation: e2e

## Deferred

### R021 — Standalone local-only task tracker

* Class: core-capability
* Status: deferred
* Description: Built-in local backend for teams without Linear/GitHub.
* Primary owning slice: none
* Validation: unmapped

## Out of Scope

### R022 — Legacy daemon integrations

* Class: anti-feature
* Status: out-of-scope
* Description: Legacy daemon channels are intentionally excluded.
* Primary owning slice: none
* Validation: n/a
`

const DECISIONS_SAMPLE = `# Decisions Register

| \\# | When | Scope | Decision | Choice | Rationale | Revisable? |
| -- | -- | -- | -- | -- | -- | -- |
| D008 | M002 | arch | Planning artifact detection | Intercept tool calls from RPC event stream | Event-driven and deterministic | Yes — add polling fallback if tool names change |
| D009 | M002 | arch | Planning artifact rendering | Rich structured components, not raw markdown | Artifacts are easier to scan and action | No |
| D010 | M002 | arch | Right pane auto-switch | Auto-switch with manual override | Reduces friction while preserving control | Yes - if auto-switch is disruptive |
`

const CONTEXT_SAMPLE = `# M002: Planning View — Context

## Project Description

Add a right-pane planning artifact viewer to Kata Desktop.

## Why This Milestone

Planning is a core Kata workflow and should be visible live in the app.

## Integration Points

### CLI subprocess RPC events

Detect kata_write_document and related tools.

### Linear API

Read document content for rendering.
`

describe('artifact-parser', () => {
  test('detectArtifactType matches known artifact titles', () => {
    expect(detectArtifactType('M002-ROADMAP')).toBe('roadmap')
    expect(detectArtifactType('REQUIREMENTS')).toBe('requirements')
    expect(detectArtifactType('DECISIONS')).toBe('decisions')
    expect(detectArtifactType('KATA-DOC: DECISIONS')).toBe('decisions')
    expect(detectArtifactType('M002-CONTEXT')).toBe('context')
    expect(detectArtifactType('[S01] Slice and Task Detection')).toBe('slice')
    expect(detectArtifactType('SLICE: Legacy slice artifact')).toBe('slice')
    expect(detectArtifactType('PROJECT')).toBeNull()
  })

  test('parseRoadmap parses real roadmap markdown patterns', () => {
    const parsed = parseRoadmap(ROADMAP_SAMPLE)

    expect(parsed).not.toBeNull()
    expect(parsed?.vision).toContain('right pane comes alive')
    expect(parsed?.successCriteria).toHaveLength(2)
    expect(parsed?.slices).toHaveLength(3)

    expect(parsed?.slices[0]).toEqual({
      id: 'S01',
      title: 'Artifact Detection and Linear API Bridge',
      risk: 'high',
      depends: [],
      demo: 'After this: the pane detects planning tool calls and fetches docs from Linear.',
      done: false,
    })

    expect(parsed?.slices[1]?.done).toBe(true)
    expect(parsed?.slices[1]?.depends).toEqual(['S01'])
    expect(parsed?.slices[2]?.depends).toEqual(['S01', 'S02'])
    expect(parsed?.boundaryMap[0]?.heading).toBe('S01 → S02, S03')
    expect(parsed?.boundaryMap[0]?.content).toContain('PlanningPane shell')
  })

  test('parseRequirements groups requirements by section headings', () => {
    const parsed = parseRequirements(REQUIREMENTS_SAMPLE)

    expect(parsed).not.toBeNull()
    expect(parsed?.active).toHaveLength(2)
    expect(parsed?.validated).toHaveLength(1)
    expect(parsed?.deferred).toHaveLength(1)
    expect(parsed?.outOfScope).toHaveLength(1)

    expect(parsed?.active[0]).toMatchObject({
      id: 'R009',
      class: 'primary-user-loop',
      status: 'active',
      owner: 'M002/S01',
    })

    expect(parsed?.outOfScope[0]).toMatchObject({
      id: 'R022',
      status: 'out-of-scope',
      validation: 'n/a',
    })
  })

  test('parseDecisions parses markdown table rows and revisability', () => {
    const parsed = parseDecisions(DECISIONS_SAMPLE)

    expect(parsed).not.toBeNull()
    expect(parsed?.rows).toHaveLength(3)

    expect(parsed?.rows[0]).toMatchObject({
      id: 'D008',
      when: 'M002',
      scope: 'arch',
      revisable: true,
      revisableCondition: 'add polling fallback if tool names change',
    })

    expect(parsed?.rows[1]).toMatchObject({
      id: 'D009',
      revisable: false,
      revisableCondition: null,
    })

    expect(parsed?.rows[2]).toMatchObject({
      id: 'D010',
      revisable: true,
      revisableCondition: 'if auto-switch is disruptive',
    })
  })

  test('parseContext returns section objects for ## and ### headings', () => {
    const parsed = parseContext(CONTEXT_SAMPLE)

    expect(parsed).not.toBeNull()
    expect(parsed?.sections.map((section) => section.heading)).toEqual([
      'Project Description',
      'Why This Milestone',
      'Integration Points',
      'CLI subprocess RPC events',
      'Linear API',
    ])
    expect(parsed?.sections[0]).toMatchObject({ level: 2 })
    expect(parsed?.sections[3]).toMatchObject({ level: 3 })
  })

  test('all parsers fail safely on malformed markdown', () => {
    const malformed = 'just some notes without artifact structure'

    expect(parseRoadmap(malformed)).toBeNull()
    expect(parseRequirements(malformed)).toBeNull()
    expect(parseDecisions(malformed)).toBeNull()
    expect(parseContext(malformed)).toBeNull()
  })
})
