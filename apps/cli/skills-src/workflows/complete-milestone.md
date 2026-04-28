# Complete Milestone Workflow

Use this workflow to complete the active milestone after verified work is accepted. It adapts the legacy completion flow: check readiness, preserve summary/retrospective/archive artifacts, then transition the backend milestone lifecycle.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/milestone-archive.md`
- `templates/retrospective.md`

## Stage 1: Load Active Milestone

```bash
node ./scripts/kata-call.mjs milestone.getActive
```

If no active milestone exists, stop and report that there is nothing to complete.

## Stage 2: Read Completion Evidence

List milestone artifacts:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001"
}
```

```bash
node ./scripts/kata-call.mjs artifact.list --input /tmp/kata-milestone-artifacts.json
```

Review requirements, roadmap, summaries, UAT, and verification artifacts. Surface incomplete or failed work before asking to close the milestone.

## Stage 3: Write Summary Artifact

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

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-milestone-summary.json
```

## Stage 4: Write Retrospective Artifact

Use `templates/retrospective.md`.

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "retrospective",
  "title": "M001 Retrospective",
  "content": "# Retrospective: M001\n\n...",
  "format": "markdown"
}
```

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-retrospective.json
```

## Stage 5: Complete Milestone

```json
{
  "milestoneId": "M001",
  "summary": "Delivered the todo app MVP and verified task creation, completion, editing, and deletion."
}
```

```bash
node ./scripts/kata-call.mjs milestone.complete --input /tmp/kata-milestone-complete.json
```

## Completion

Summarize the milestone outcome, known gaps, and candidates for the next milestone.

End with:

```text
Next up: run `kata-new-milestone` to start the next cycle.
```

## Rules

- Do not complete a milestone with unverified required tasks unless the user explicitly accepts the risk.
- Preserve follow-up work in artifact content or backend task state.
- Keep lifecycle transitions in the CLI backend contract.

