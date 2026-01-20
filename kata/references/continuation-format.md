# Continuation Format

Standard format for presenting next steps after completing a command or workflow.

## Core Structure

```
───────────────────────────────────────────────────────────────

## ▶ Next Action

**{Identifier}: {Name}** — {one-line description}

> Instructions can be given conversationally (recommended) or via /commands.

| Action                 | Natural Trigger    | Explicit Command |
| ---------------------- | ------------------ | ---------------- |
| ⭐ **{Primary action}** | "{trigger phrase}" | `/{skill-name}`  |
| {Secondary action}     | "{trigger phrase}" | `/{skill-name}`  |

<sub>★ recommended · `/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

## Format Rules

1. **Always show what it is** — name + description, never just a command path
2. **Pull context from source** — ROADMAP.md for phases, PLAN.md `<objective>` for plans
3. **Table format** — Action, Natural Trigger, Explicit Command columns
4. **Bold primary action** — first row should be bolded (recommended action)
5. **`/clear` explanation** — always include, keeps it concise but explains why
6. **Visual separators** — `───` above and below to make it stand out

## Skill Mapping Reference

| Action        | Skill Name                         | Natural Triggers                    |
| ------------- | ---------------------------------- | ----------------------------------- |
| Plan phase    | `kata-planning`                    | "plan phase N", "plan next phase"   |
| Execute phase | `kata-execution`                   | "execute phase N", "run phase N"    |
| Verify/UAT    | `kata-verification-and-uat`        | "verify phase N", "run UAT"         |
| New project   | `kata-project-initialization`      | "new project", "start project"      |
| New milestone | `kata-milestone-management`        | "new milestone", "start milestone"  |
| Add phase     | `kata-roadmap-management`          | "add a phase", "insert phase"       |
| Progress      | `kata-progress-and-status-updates` | "progress", "status", "what's next" |
| Research      | `kata-research`                    | "research phase N", "investigate"   |

## Variants

### Execute Next Plan

```
───────────────────────────────────────────────────────────────

## ▶ Next Action

**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry

> Instructions can be given conversationally (recommended) or via /commands.

| Action                 | Natural Trigger                | Explicit Command  |
| ---------------------- | ------------------------------ | ----------------- |
| ⭐ **Execute the plan** | "Execute phase 2"              | `/kata-execution` |
| Check assumptions      | "List assumptions for phase 2" | —                 |

<sub>★ recommended · `/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

### Execute Final Plan in Phase

Add note that this is the last plan and what comes after:

```
───────────────────────────────────────────────────────────────

## ▶ Next Action

**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry
<sub>Final plan in Phase 2</sub>

> Instructions can be given conversationally (recommended) or via /commands.

| Action                 | Natural Trigger   | Explicit Command  |
| ---------------------- | ----------------- | ----------------- |
| ⭐ **Execute the plan** | "Execute phase 2" | `/kata-execution` |

<sub>★ recommended · `/clear` first → fresh context window</sub>

**After this completes:**
- Phase 2 → Phase 3 transition
- Next: **Phase 3: Core Features** — User dashboard and settings

───────────────────────────────────────────────────────────────
```

### Plan a Phase

```
───────────────────────────────────────────────────────────────

## ▶ Next Action

**Phase 2: Authentication** — JWT login flow with refresh tokens

> Instructions can be given conversationally (recommended) or via /commands.

| Action               | Natural Trigger    | Explicit Command |
| -------------------- | ------------------ | ---------------- |
| ⭐ **Plan the phase** | "Plan phase 2"     | `/kata-planning` |
| Research first       | "Research phase 2" | `/kata-research` |
| Discuss context      | "Discuss phase 2"  | `/kata-research` |

<sub>★ recommended · `/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

### Phase Complete, Ready for Next

Show completion status before next action:

```
───────────────────────────────────────────────────────────────

## ✓ Phase 2 Complete

3/3 plans executed

## ▶ Next Action

**Phase 3: Core Features** — User dashboard, settings, and data export

> Instructions can be given conversationally (recommended) or via /commands.

| Action                   | Natural Trigger             | Explicit Command             |
| ------------------------ | --------------------------- | ---------------------------- |
| ⭐ **Verify and run UAT** | "Verify phase 2", "Run UAT" | `/kata-verification-and-uat` |
| Plan next phase          | "Plan phase 3"              | `/kata-planning`             |
| Research first           | "Research phase 3"          | `/kata-research`             |

<sub>★ recommended · `/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

### Multiple Equal Options

When there's no clear primary action:

```
───────────────────────────────────────────────────────────────

## ▶ Next Action

**Phase 3: Core Features** — User dashboard, settings, and data export

> Instructions can be given conversationally (recommended) or via /commands.

| Action          | Natural Trigger    | Explicit Command |
| --------------- | ------------------ | ---------------- |
| Plan the phase  | "Plan phase 3"     | `/kata-planning` |
| Research first  | "Research phase 3" | `/kata-research` |
| Discuss context | "Discuss phase 3"  | `/kata-research` |

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

### Milestone Complete

```
───────────────────────────────────────────────────────────────

## 🎉 Milestone v1.0 Complete

All 4 phases shipped

## ▶ Next Action

**Start v1.1** — questioning → research → requirements → roadmap

> Instructions can be given conversationally (recommended) or via /commands.

| Action                    | Natural Trigger | Explicit Command             |
| ------------------------- | --------------- | ---------------------------- |
| ⭐ **Start new milestone** | "New milestone" | `/kata-milestone-management` |

<sub>★ recommended · `/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────
```

## Pulling Context

### For phases (from ROADMAP.md):

```markdown
### Phase 2: Authentication
**Goal**: JWT login flow with refresh tokens
```

Extract: `**Phase 2: Authentication** — JWT login flow with refresh tokens`

### For plans (from ROADMAP.md):

```markdown
Plans:
- [ ] 02-03: Add refresh token rotation
```

Or from PLAN.md `<objective>`:

```xml
<objective>
Add refresh token rotation with sliding expiry window.

Purpose: Extend session lifetime without compromising security.
</objective>
```

Extract: `**02-03: Refresh Token Rotation** — Add /api/auth/refresh with sliding expiry`

## Anti-Patterns

### Don't: Command-only (no context)

```
## To Continue

Run `/clear`, then paste:
/kata-execution
```

User has no idea what 02-03 is about.

### Don't: Missing /clear explanation

```
`/kata-planning`

Run /clear first.
```

Doesn't explain why. User might skip it.

### Don't: Old command namespace syntax

```
`/kata:plan-phase 3`
```

Use skill names directly: `/kata-planning`

### Don't: Bullet list instead of table

```
**Also available:**
- `/kata-planning` — plan the phase
- `/kata-research` — research first
```

Use table format for consistency and clarity.

### Don't: Fenced code blocks for commands

```
```
/kata-planning
```
```

Fenced blocks inside templates create nesting ambiguity. Use inline backticks instead.
