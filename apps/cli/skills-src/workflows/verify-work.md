# Verify Work Workflow

Use this workflow to verify completed work and record UAT or verification artifacts. It adapts the legacy conversational UAT flow: test one behavior at a time, record evidence, and mark task verification state.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/UAT.md`
- `templates/verification-report.md`

## Stage 1: Load Verification Context

Read project context:

```bash
node ./scripts/kata-call.mjs project.getContext
```

If needed, list tasks for the slice under verification:

```json
{
  "sliceId": "S001"
}
```

```bash
node ./scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
```

List task artifacts:

```json
{
  "scopeType": "task",
  "scopeId": "T001"
}
```

```bash
node ./scripts/kata-call.mjs artifact.list --input /tmp/kata-artifact-list.json
```

Read existing verification artifact when present:

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "verification"
}
```

```bash
node ./scripts/kata-call.mjs artifact.read --input /tmp/kata-read-verification.json
```

## Stage 2: Run UAT

Test one user-visible behavior at a time. Ask the user to confirm actual behavior when manual observation is required. Do not interrogate; keep the user focused on the next concrete check.

## Stage 3: Write Verification Or UAT Artifact

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "uat",
  "title": "T001 UAT",
  "content": "# User Acceptance Test\n\n## Tests\n\n...",
  "format": "markdown"
}
```

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-uat.json
```

For automated verification evidence, use `artifactType: "verification"` instead.

## Stage 4: Update Verification State

If accepted:

```json
{
  "taskId": "T001",
  "status": "done",
  "verificationState": "verified"
}
```

```bash
node ./scripts/kata-call.mjs task.updateStatus --input /tmp/kata-task-verified.json
```

If failed, use `verificationState: "failed"` and summarize the blocking issue in the artifact.

## Completion

If the milestone appears fully verified, route to `kata-complete-milestone`. Otherwise, summarize remaining unverified tasks.

## Rules

- Evidence comes before claims.
- Record failures as durable artifacts when they affect the milestone.
- Do not close a milestone from this workflow.

