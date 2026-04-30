---
name: sym-commit
description:
  Create a well-formed git commit from current changes using session history for
  rationale and summary; use when asked to commit, prepare a commit message, or
  finalize staged work.
---

# Commit

## Goals

- Produce a commit that reflects the actual code changes and the session
  context.
- Follow common git conventions (type prefix, short subject, wrapped body).
- Include both summary and rationale in the body.

## Inputs

- Active Pi/Symphony agent session history for intent and rationale (including Codex-originated context when Symphony is running the Codex app-server harness explicitly).
- `git status`, `git diff`, and `git diff --staged` for actual changes.
- Repo-specific commit conventions if documented.

## Steps

1. Read session history to identify scope, intent, and rationale.
2. Inspect the working tree and staged changes (`git status`, `git diff`,
   `git diff --staged`).
3. Stage only intended changes, including new files after confirming scope. Avoid broad `git add -A` when unrelated user changes, generated files, logs, or harness scratch files are present; use path-specific `git add` in those cases.
4. Sanity-check newly added files; if anything looks random or likely ignored
   (build artifacts, logs, temp files), flag it to the user before committing.
5. If staging is incomplete or includes unrelated files, fix the index or ask
   for confirmation.
6. Choose a conventional type and optional scope that match the change (e.g.,
   `feat(scope): ...`, `fix(scope): ...`, `refactor(scope): ...`).
7. Write a subject line in imperative mood, <= 72 characters, no trailing
   period.
8. Write a body that includes:
   - Summary of key changes (what changed).
   - Rationale and trade-offs (why it changed).
   - Tests or validation run (or explicit note if not run).
9. Use the co-author trailer that matches the active harness identity when the repository or user expects one. For explicit Codex app-server work, use `Co-authored-by: Codex <codex@openai.com>` unless the user requests a different identity; otherwise omit or use the project-approved Pi/Symphony identity.
10. Wrap body lines at 72 characters.
11. Create the commit message with a here-doc or temp file and use
    `git commit -F <file>` so newlines are literal (avoid `-m` with `\n`).
12. Commit only when the message matches the staged changes: if the staged diff
    includes unrelated files or the message describes work that isn't staged,
    fix the index or revise the message before committing.
13. Never use `git commit --no-verify` or `git push --no-verify`; if hooks or validation fail, fix the underlying issue.

## Output

- A single commit created with `git commit` whose message reflects the session, staged diff, and validation evidence without bypassing hooks.

## Template

Type and scope are examples only; adjust to fit the repo and changes.

```
<type>(<scope>): <short summary>

Summary:
- <what changed>
- <what changed>

Rationale:
- <why>
- <why>

Tests:
- <command or "not run (reason)">

Co-authored-by: <active harness identity when required>
```
