# Symphony project home and prompt-driven runtime plan

## Goal

Make Symphony work cleanly as a distributed binary from any repository by using a project-local `.symphony/` directory for workflow and prompt assets, and by removing the need to distribute Symphony-owned `sym-*` skills into worker worktrees.

## Target model

`symphony init` creates this project-local structure:

```text
.symphony/
  WORKFLOW.md
  .env.example
  prompts/
    system.md
    supervisor.md
    repo.md
    in-progress.md
    agent-review.md
    merging.md
    rework.md
  docs/
    WORKFLOW-REFERENCE.md
```

Users can commit `.symphony/` to their repo. Symphony will not add it to `.gitignore`.

When `symphony` runs without an explicit workflow path, it should try `.symphony/WORKFLOW.md` first. Keep support for explicitly passed workflow paths.

## Prompt model

Prompt files are the editable orchestration layer.

The starter `.symphony/WORKFLOW.md` should reference prompt files relative to `.symphony/WORKFLOW.md`:

```yaml
prompts:
  system: prompts/system.md
  repo: prompts/repo.md
  by_state:
    Todo: prompts/in-progress.md
    In Progress: prompts/in-progress.md
    Agent Review: prompts/agent-review.md
    Merging: prompts/merging.md
    Rework: prompts/rework.md
  default: prompts/in-progress.md
```

The generic binary distribution should include these starter assets only:

```text
apps/symphony/WORKFLOW.md
apps/symphony/.env.example
apps/symphony/docs/WORKFLOW-REFERENCE.md
apps/symphony/prompts/agent-review.md
apps/symphony/prompts/in-progress.md
apps/symphony/prompts/merging.md
apps/symphony/prompts/repo.md
apps/symphony/prompts/rework.md
apps/symphony/prompts/supervisor.md
apps/symphony/prompts/system.md
```

`apps/symphony/WORKFLOW.md` should become a sanitized starter workflow for distribution. Before changing it, copy the current working mono repo workflow into `.symphony/WORKFLOW.md` so repo-specific settings are preserved there.

Specialized repo prompts are repo-specific and should move out of the Symphony source prompt set into the mono repo `.symphony/prompts/` directory:

```text
.symphony/prompts/repo-mono.md
.symphony/prompts/repo-cli.md
.symphony/prompts/repo-desktop.md
.symphony/prompts/repo-sym.md
```

## Remove required `sym-*` skill injection

Inline the guidance from Symphony-owned skills into the distributed prompts.

Replace prompt references like:

```bash
.agents/skills/sym-state/scripts/sym-call issue.get --input "$INPUT"
```

with direct helper invocation:

```bash
"$SYMPHONY_BIN" helper issue.get \
  --workflow "$SYMPHONY_WORKFLOW_PATH" \
  --input "$INPUT"
```

The worker environment already receives:

```text
SYMPHONY_BIN
SYMPHONY_WORKFLOW_PATH
SYMPHONY_ISSUE_ID
SYMPHONY_ISSUE_IDENTIFIER
SYMPHONY_ISSUE_TITLE
SYMPHONY_WORKSPACE_PATH
```

Skill guidance mapping:

- `sym-state` -> `prompts/system.md`
- `sym-address-comments` -> `prompts/agent-review.md`
- `sym-fix-ci` -> `prompts/agent-review.md`
- `sym-land` -> `prompts/merging.md`
- `sym-commit`, `sym-pull`, `sym-push` -> `prompts/system.md` or state prompts as concise Git workflow guidance
- `sym-linear` -> remove from generic prompts to maintain backend abstractions

Project-specific user skills should remain in the repo’s normal `.agents/skills/` directory.

## Kata mono repo migration

Copy the current Symphony working config into the mono repo project home:

```text
/Volumes/EVO/kata/kata-mono/.symphony/
  WORKFLOW.md
  .env.example
  prompts/system.md
  prompts/supervisor.md
  prompts/rework.md
  prompts/repo.md
  prompts/repo-sym.md
  prompts/repo-desktop.md
  prompts/repo-mono.md
  prompts/repo-cli.md
  prompts/merging.md
  prompts/in-progress.md
  prompts/agent-review.md
  docs/WORKFLOW-REFERENCE.md
```

The mono repo `.symphony/WORKFLOW.md` can continue using a specialized repo prompt such as `prompts/repo-mono.md`.

## CLI changes

Add:

```bash
symphony init
```

Behavior:

- Create `.symphony/` starter files in the current directory, including `.symphony/.env.example`.
- Do not overwrite existing files by default.
- Provide an explicit overwrite path, such as `--force`, or write `.new` files for conflicts.
- Use embedded starter assets so the command works from the distributed binary without source repo access.

Default workflow and path resolution:

1. Use explicit workflow path when provided.
2. If no path is provided, use `.symphony/WORKFLOW.md` when present.
3. Keep legacy `WORKFLOW.md` fallback for compatibility if desired.
4. If no workflow exists, print a clear message: run `symphony init` or pass a workflow path.
5. Resolve relative paths in workflow-defined prompts and hook commands from the active `WORKFLOW.md` directory. Hooks still receive `SYMPHONY_WORKSPACE_PATH` for workspace access.

## Prompt drift management

Add template metadata comments to generated files, for example:

```md
<!-- symphony-template: prompts/system.md version=VERSION checksum=CHECKSUM -->
```

Future commands:

```bash
symphony prompts status
symphony prompts update
```

Initial implementation can be simple:

- `status`: show which files match bundled templates, differ, or are missing.
- `update`: update untouched files and write `.new` files for modified files.

## Docs updates

Update:

- `apps/symphony/docs/WORKFLOW-REFERENCE.md`
- `apps/symphony/AGENTS.md`
- examples that show running Symphony from the app directory
- release notes/changelog

Document the binary onboarding path:

```bash
cd /path/to/repo
symphony init
$EDITOR .symphony/WORKFLOW.md
$EDITOR .symphony/prompts/repo.md
symphony doctor
symphony
```

## Tests

Add or update tests for:

- `symphony init` writes the expected `.symphony/` tree.
- init does not overwrite files by default.
- no-arg `symphony` resolves `.symphony/WORKFLOW.md`.
- explicit workflow path still works.
- prompt files do not reference `.agents/skills/sym-*`.
- prompts use direct `"$SYMPHONY_BIN" helper ... --workflow "$SYMPHONY_WORKFLOW_PATH"` calls.
- dispatch works when no `skills/` directory exists next to the workflow.
- worker session environment includes helper env vars.

## Implementation phases

1. Create `.symphony/` project home assets for the mono repo, preserving the current repo-specific workflow and prompts there.
2. Sanitize `apps/symphony/WORKFLOW.md` into the generic starter workflow used by binary distribution.
3. Update generic prompts to inline Symphony runtime guidance and remove `sym-*` references.
4. Add embedded starter assets and `symphony init`.
5. Update default workflow resolution to prefer `.symphony/WORKFLOW.md` for no-arg runs.
6. Remove or disable required workflow `skills/` injection from dispatch.
7. Add tests and documentation.
8. Add prompt drift commands, or land metadata first and commands in a follow-up.

## Acceptance criteria

- A user can install the Symphony binary, enter any repo, run `symphony init`, edit `.symphony/WORKFLOW.md` and `.symphony/prompts/repo.md`, then run `symphony doctor` and `symphony` without copying files from the Symphony source repo.
- Worker prompts contain the Symphony helper contract directly.
- Worker prompts do not require `.agents/skills/sym-*`.
- Repo-owned `.agents/skills/` remains available for normal project skills.
- The Kata mono repo has a committed `.symphony/` working setup.
