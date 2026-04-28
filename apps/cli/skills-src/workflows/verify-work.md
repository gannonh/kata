# Verify Work Workflow

Use this workflow to verify completed work and record durable verification evidence: test one behavior at a time, record evidence, and mark task verification state.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/verification-report.md`
- `templates/UAT.md` when the task explicitly requires user acceptance testing

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

## Stage 2: Gather Verification Evidence

Use the slice/task plan to determine the evidence type. Do not infer that verification is user-facing from the skill name.

For non-user-facing work, evidence can include CLI output, test results, backend state, artifact reads/writes, logs, or code review notes.

For user-facing work, evidence can include UI behavior, screenshots, walkthrough notes, or manual acceptance checks.

Ask the user to confirm actual behavior only when the plan calls for manual observation or user acceptance testing. Do not interrogate; keep the user focused on the next concrete check.

## Stage 3: Write Verification Artifact

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "verification",
  "title": "T001 Verification",
  "content": "# Verification\n\n## Evidence\n\n...",
  "format": "markdown"
}
```

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-verification.json
```

Use `artifactType: "uat"` only when the plan explicitly calls for user acceptance testing.

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
