# Workflow Reference

# Execute Issue Workflow

Execute one standalone Kata issue by dispatching a fresh subagent per plan task, with two-stage review after each: spec compliance review first, then code quality review.

This workflow executes issue plans created by `kata-plan-issue`. The design and plan are retrieved from the backend issue body, not from a local markdown file.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/implementer-prompt.md`
- `templates/spec-reviewer-prompt.md`
- `templates/code-quality-reviewer-prompt.md`

## Why Subagents

Delegate tasks to specialized agents with isolated context. Precisely craft their instructions and context so they stay focused and succeed at their task. They should not inherit your session history; construct exactly what they need. This preserves your context for coordination work.

Core principle: fresh subagent per task plus two-stage review, spec then quality, yields higher quality and faster iteration.

## When to Use

Use this workflow when:

- The user wants to execute a standalone Kata issue or one-off backlog plan.
- The work is represented by a backend `Issue` created by `kata-plan-issue`.
- The issue body contains an approved `# Design` and `# Plan`.
- Plan tasks are mostly independent enough to execute one at a time with fresh subagents.
- The user wants to stay in this session while the controller coordinates implementation and review.

Do not use this workflow for milestone slices or tasks. Use `kata-execute-phase` for milestone/slice/task execution.

## Stage 1: Readiness and Project Context

Check backend readiness:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs health.check
```

Read project context:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

If either command returns `ok: false`, stop and fix setup before execution. If the project context backend is not `github`, stop and report that standalone issue workflows require a backend with `issue.listOpen`, `issue.get`, and `issue.updateStatus` support. Do not inspect helper scripts unless the helper command itself fails.

## Stage 2: Select the Issue

### No Issue Context Provided

If the user invokes this skill without an issue reference, list open standalone issues only:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.listOpen
```

The list operation returns summaries only: issue IDs, numbers, titles, links, and status. Do not retrieve full issue bodies while listing open issues.

Present a concise list with links and ask the user to choose:

```text
Open standalone Kata issues

1. I002 / #462 — Add slice dependency sequencing for GitHub-backed Kata execution
   https://github.com/gannonh/kata/issues/462

2. I003 / #463 — Add first-class Kata UAT workflow skill
   https://github.com/gannonh/kata/issues/463

CHECKPOINT: Which issue should I execute?
```

Stop and wait for the user to choose.

### Issue Context Provided

If the user provides an issue reference, such as a Kata issue ID, GitHub issue number, or partial title:

1. Run `issue.listOpen` to keep initial context small.
2. Match the provided context against the summaries.
3. If no match is found, show the open issue list and ask the user to choose.
4. If multiple matches are found, show the matching issues and ask the user to choose.
5. If exactly one match is found, retrieve it with `issue.get`.

Create `/tmp/kata-issue-get.json`:

```json
{
  "issueRef": "I002"
}
```

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.get --input /tmp/kata-issue-get.json
```

Present a summary with link for confirmation:

```text
Selected issue

I002 / #462
Add slice dependency sequencing for GitHub-backed Kata execution
https://github.com/gannonh/kata/issues/462

Summary
- Design: slice-level dependency sequencing across CLI and Symphony GitHub Projects v2.
- Plan: update CLI dependency metadata, GitHub Project field persistence, snapshot/execution selection, and Symphony blocker loading.
- Status: backlog

CHECKPOINT: Execute this issue with subagent-driven development?
```

Stop and wait for confirmation. Do not mark the issue in progress before confirmation.

## Stage 3: Read Issue Plan

After confirmation, parse the retrieved issue body.

Required sections:

- `# Design`
- `# Plan`

If either section is missing or ambiguous, stop and explain the problem. Route back to `kata-plan-issue` to repair the issue instead of guessing.

Extract all plan tasks with their full text. Preserve surrounding context from the design and plan, including goals, non-goals, acceptance criteria, execution notes, and verification commands. Create an internal task list for coordination.

Then mark the issue in progress:

```json
{
  "issueId": "I002",
  "status": "in_progress"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.updateStatus --input /tmp/kata-issue-updateStatus.json
```

## Stage 4: Execute Each Task

For each task, follow this loop exactly.

### 1. Dispatch Implementer Subagent

Use `templates/implementer-prompt.md` to dispatch a fresh implementer subagent.

Provide the implementer:

- selected issue ID, number, title, and URL,
- the approved design section,
- the full current task text,
- relevant plan context and acceptance criteria,
- specific files already known to be relevant,
- expected validation commands,
- instruction to ask questions before implementation if context is missing,
- instruction to commit task-scoped repository changes when code changed.

Do not make the implementer read the full issue or plan file. Provide the exact task text and context.

### 2. Handle Implementer Status

Implementer subagents report one of four statuses. Handle each appropriately.

**DONE:** Proceed to spec compliance review.

**DONE_WITH_CONCERNS:** The implementer completed the work but flagged doubts. Read the concerns before proceeding. If concerns are about correctness or scope, address them before review. If they are observations, note them and proceed to review.

**NEEDS_CONTEXT:** The implementer needs information that was not provided. Provide the missing context and re-dispatch.

**BLOCKED:** The implementer cannot complete the task. Assess the blocker:

1. If it is a context problem, provide more context and re-dispatch with the same model.
2. If the task requires more reasoning, re-dispatch with a more capable model.
3. If the task is too large, break it into smaller pieces.
4. If the plan itself is wrong, escalate to the user.

Never ignore an escalation or force the same retry without changes.

### 3. Dispatch Spec Compliance Reviewer

Use `templates/spec-reviewer-prompt.md` to dispatch a fresh spec reviewer subagent.

The spec reviewer checks only whether the implementation matches the issue design, task text, plan constraints, and acceptance criteria. It must identify missing requirements and extra scope.

If the spec reviewer finds issues:

1. Send the findings back to the implementer.
2. Have the implementer fix them.
3. Dispatch spec review again.
4. Repeat until spec compliance is approved.

Do not start code quality review until spec compliance is approved.

### 4. Dispatch Code Quality Reviewer

Use `templates/code-quality-reviewer-prompt.md` to dispatch a fresh code quality reviewer subagent.

The code quality reviewer checks maintainability, test quality, repo conventions, architecture fit, type safety, error handling, and unintended side effects. It should not reopen scope questions already settled by spec compliance unless quality concerns reveal a real issue.

If the code quality reviewer finds issues:

1. Send the findings back to the implementer.
2. Have the implementer fix them.
3. Dispatch code quality review again.
4. Repeat until approved.

### 5. Mark Task Complete Internally

After both review stages approve, mark the task complete in your internal task list and move to the next task.

Do not dispatch multiple implementation subagents in parallel. Sequential execution avoids repository conflicts and keeps review attribution clear.

## Stage 5: Final Review

After all tasks are complete, dispatch a final code reviewer subagent for the entire implementation.

The final reviewer checks:

- the full issue design and plan are satisfied,
- task implementations work together,
- no unrelated changes were introduced,
- tests and validation are sufficient,
- commits are coherent,
- generated files are consistent when applicable.

If final review finds issues, dispatch a fix subagent with specific instructions. Do not fix manually unless no subagent is available.

## Stage 6: Mark Issue Done

After final review approves and validation passes, update the issue status:

```json
{
  "issueId": "I002",
  "status": "done"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.updateStatus --input /tmp/kata-issue-done.json
```

Summarize:

- issue ID and URL,
- tasks completed,
- commits created,
- validation run,
- review stages completed,
- remaining follow-up work, if any.

## Model Selection

Use the least powerful model that can handle each role to conserve cost and increase speed.

Mechanical implementation tasks that touch one or two files with complete specs can use a fast model. Integration and judgment tasks that coordinate multiple files should use a standard model. Architecture, design, debugging, and review tasks should use the most capable available model.

Task complexity signals:

- Touches one or two files with a complete spec: cheap model.
- Touches multiple files with integration concerns: standard model.
- Requires design judgment or broad codebase understanding: most capable model.

## Advantages

- Fresh context per task.
- Controller curates exactly what each subagent needs.
- Questions surface before work begins.
- Self-review catches issues before handoff.
- Two-stage review prevents under-building and over-building.
- Review loops ensure fixes actually work.
- Context stays with the controller for coordination.

Cost:

- More subagent invocations.
- Controller does more prep work extracting tasks upfront.
- Review loops add iterations.
- Catches issues earlier than debugging later.

## Red Flags

Never:

- Start implementation on main/master without explicit user consent.
- Execute without confirming the selected issue.
- Skip spec compliance review.
- Skip code quality review.
- Proceed with unfixed review issues.
- Dispatch multiple implementation subagents in parallel.
- Make the implementer read the backend issue; provide exact task text instead.
- Skip scene-setting context.
- Ignore subagent questions.
- Accept close enough on spec compliance.
- Let implementer self-review replace actual review.
- Start code quality review before spec compliance is approved.
- Move to the next task while either review has open issues.
- Mark the backend issue done before final review and validation pass.

If a subagent asks questions, answer clearly and completely. If a reviewer finds issues, the implementer fixes them and the reviewer reviews again. If a subagent fails a task, dispatch a fix subagent with specific instructions.
