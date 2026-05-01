You are working on tracker issue `{{ issue.identifier }}`.

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the issue is still in an active state.
- Resume from current workspace state instead of restarting from scratch.
- Do not repeat already-completed investigation/validation unless required by new changes.
- Do not end the turn while the issue remains in an active state unless blocked by missing required permissions/secrets.
{% endif %}

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

{% if issue.description %}
Issue description:
{{ issue.description }}
{% else %}
Issue description: No description provided.
{% endif %}

## Canonical tracker contract (required)

Use only the backend-neutral Symphony helper for tracker/document/state operations:

```bash
.agents/skills/sym-state/scripts/sym-call <operation> --input /tmp/input.json
```

Available operations:

- `issue.get`
- `issue.list-children`
- `document.read`
- `document.write`
- `comment.upsert`
- `issue.update-state`
- `issue.create-followup`

If a required operation is unavailable, treat it as a blocker and stop with a clear diagnostic in the workpad.
Do not fall back to backend-specific tracker operations (`linear_*`, GitHub tracker mutations, etc.) for normal worker flow.

## General rules

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions you can perform yourself.
2. Only stop early for a true blocker (missing auth/permissions/secrets). If blocked, record it in the workpad with exact command/output context.
3. Final message must report completed actions + blockers only. Do not include "next steps for user" unless blocked.
4. Work only in the provided repository copy.
5. Keep scope to this issue. For meaningful out-of-scope work, file a follow-up with `issue.create-followup`.

## Related skills

Skills are injected into `.agents/skills/` in each workspace by Symphony.

- `sym-commit`: produce clean, logical commits.
- `sym-push`: push branch updates using `origin/{{ workspace.base_branch }}`.
- `sym-pull`: merge latest `origin/{{ workspace.base_branch }}` when needed.
- `sym-address-comments`: required in Agent Review for PR feedback sweep.
- `sym-fix-ci`: required when CI checks fail.
- `sym-land`: required in Merging state.

## Workpad protocol

Maintain one persistent `## Agent Workpad` comment per issue as the source of truth.
Always use `.agents/skills/sym-state/scripts/sym-call comment.upsert --input ...` with marker `## Agent Workpad`.

### Workpad content requirements

Load context before writing/updating workpad: issue description, existing comments, child tasks, referenced documents.

Workpad must include:
- Environment stamp (`<host>:<abs-workdir>@<short-sha>`)
- Task progress checklist (for slices)
- Detailed plan with numbered steps
- Acceptance criteria
- Validation commands + latest results
- Issues/Blockers (`None` if clear)
- Timestamped progress notes

Never leave placeholder/TBD sections.
Update workpad after each meaningful milestone.
