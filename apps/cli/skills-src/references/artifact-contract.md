# Artifact Contract

Artifacts are durable workflow documents stored through `artifact.write`.

## Common Payload Shape

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT",
  "artifactType": "project-brief",
  "title": "PROJECT",
  "content": "# Project\n\n...",
  "format": "markdown"
}
```

## Scope Rules

- Project artifacts use `scopeType: "project"` and `scopeId: "PROJECT"`.
- Milestone artifacts use `scopeType: "milestone"` and the milestone ID returned by `milestone.create` or `milestone.getActive`.
- Slice artifacts use `scopeType: "slice"` and the slice ID returned by `slice.create`.
- Task artifacts use `scopeType: "task"` and the task ID returned by `task.create`.

## Project Artifacts

### Project Brief

Use for durable project context.

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT",
  "artifactType": "project-brief",
  "title": "PROJECT",
  "content": "# Project\n\n## Core Value\n\n...\n",
  "format": "markdown"
}
```

Required sections:

- Project name
- Core value
- Target users
- Constraints
- Key decisions
- Active assumptions
- Out of scope

### Project Requirements

Use for durable project-level requirements hypotheses gathered before the first milestone.

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT",
  "artifactType": "requirements",
  "title": "PROJECT Requirements",
  "content": "# Requirements\n\n## Active\n\n- [ ] **REQ-01**: ...\n",
  "format": "markdown"
}
```

## Milestone Artifacts

### Milestone Requirements

Use for scoped requirements for a milestone.

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements",
  "title": "M001 Requirements",
  "content": "# Requirements\n\n## v1\n\n- [ ] **TODO-01**: User can create a task.\n",
  "format": "markdown"
}
```

Requirements must be specific, user-centric, atomic, and testable.

### Milestone Roadmap

Use for the phase/slice structure derived from milestone requirements.

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "roadmap",
  "title": "M001 Roadmap",
  "content": "# Roadmap\n\n## Phase 1: Foundation\n\n...",
  "format": "markdown"
}
```

Every active requirement should map to exactly one phase/slice unless the workflow explicitly records a split.

### Milestone Summary

Use when completing or reporting on a milestone.

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "summary",
  "title": "M001 Summary",
  "content": "# Summary\n\n...",
  "format": "markdown"
}
```

### Retrospective

Use when closing a milestone.

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "retrospective",
  "title": "M001 Retrospective",
  "content": "# Retrospective\n\n...",
  "format": "markdown"
}
```

## Slice Artifacts

### Phase Context

Use for discussion, assumptions, decisions, and research that inform planning.

```json
{
  "scopeType": "slice",
  "scopeId": "S001",
  "artifactType": "phase-context",
  "title": "S001 Phase Context",
  "content": "# Phase Context\n\n...",
  "format": "markdown"
}
```

### Plan

Use for execution-ready task plans.

```json
{
  "scopeType": "slice",
  "scopeId": "S001",
  "artifactType": "plan",
  "title": "S001 Plan",
  "content": "# Plan\n\n...",
  "format": "markdown"
}
```

## Task Artifacts

### Verification

Use for proof that a task satisfies requirements.

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "verification",
  "title": "T001 Verification",
  "content": "# Verification\n\n...",
  "format": "markdown"
}
```

### UAT

Use for conversational user acceptance testing.

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "uat",
  "title": "T001 UAT",
  "content": "# UAT\n\n...",
  "format": "markdown"
}
```

## Update Rules

- Prefer rewriting the full artifact content with the latest durable version.
- Keep historical context in the artifact body when it matters for future decisions.
- Do not create duplicate artifacts for the same scope and artifact type unless the workflow explicitly requires an archive.
- If the backend returns `ok: false`, do not proceed as if the artifact was persisted.
