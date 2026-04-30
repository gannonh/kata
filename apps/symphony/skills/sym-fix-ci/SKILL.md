---
name: sym-fix-ci
description: "Use when a user asks to debug or fix failing GitHub PR checks that run in GitHub Actions. Trigger words include: 'fix CI', 'debug GitHub Actions', 'gh pr checks', 'CI is red', 'GitHub Actions failed', 'fix the build', and similar phrases indicating a need to investigate and resolve CI failures in a GitHub-hosted repository."
---

## Overview

Use the Pi-hosted Symphony workflow to reason about the task, Kata CLI only for durable Kata project/slice/task/artifact state when applicable, and `gh` to locate failing PR checks, fetch GitHub Actions logs for actionable failures, summarize the failures, and implement fixes. GitHub Actions check/log APIs are not deterministic Kata CLI runtime operations in this skill's contract, so preserve the `gh` path for CI inspection.

## Inputs

- `repo`: path inside the repo (default `.`)
- `pr`: PR number or URL (optional; defaults to current branch PR)
- `gh` authentication for the repo host
- Optional active Kata task/slice context when CI work is part of a Kata-backed Symphony run

## Quick start

- Write an input file, for example `/tmp/sym-pr-checks.json`:
  `{"pr":"<number-or-url>","includeLogs":true,"maxLines":160}`
- Run:
  `.agents/skills/sym-state/scripts/sym-call pr.inspect-checks --input /tmp/sym-pr-checks.json`
- Omit `pr` to inspect the current branch PR.

## Workflow

1. Verify helper availability.
   - Confirm `.agents/skills/sym-state/scripts/sym-call` exists.
   - If the helper returns an auth error, record the exact error in the Agent Workpad and stop only if it is a true blocker.
2. Resolve the PR.
   - Prefer the current branch PR: `gh pr view --json number,url`.
   - If the user provides a PR number or URL, use that directly.
3. Inspect failing checks (GitHub Actions only).
   - `.agents/skills/sym-state/scripts/sym-call pr.inspect-checks --input /tmp/sym-pr-checks.json`
4. Scope non-GitHub Actions checks.
   - If `detailsUrl` is not a GitHub Actions run, label it as external and only report the URL.
   - Do not attempt Buildkite or other providers; keep the workflow lean.
5. Summarize failures.
   - Provide the failing check name, run URL (if any), and a concise log snippet.
   - Call out missing logs explicitly.
6. Create a plan.
   - Create a checklist for yourself of issues to address so you have a clear sequence of steps to follow.
7. Implement plan.
   - Apply the plan, summarize diffs/tests, commit and push changes.
   - If the work is attached to a Kata task, keep Kata status/artifact updates in the active Pi/Kata workflow and keep GitHub CI state in GitHub.
8. Recheck status.
   - After changes, re-run the relevant tests and `pr.inspect-checks` to confirm.
   - If new or existing failures remain, repeat the workflow until CI passes
9. Summarize outcome.
   - Once CI checks pass, summarize the fix and confirm with the user before merging or proceeding to the next steps in their workflow.

## Bundled Resources

### Symphony helper

Fetch failing PR checks and optionally include GitHub Actions log tails through the backend-neutral helper surface used by injected prompts.

Usage examples:

- `.agents/skills/sym-state/scripts/sym-call pr.inspect-checks --input /tmp/sym-pr-checks.json`
- Input for current branch PR: `{"includeLogs":true,"maxLines":200}`
- Input for an explicit PR: `{"pr":"https://github.com/org/repo/pull/123","includeLogs":true}`
