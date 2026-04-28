# UI Brand

Use consistent, low-noise Kata output. Keep the content plain enough for any harness while preserving workflow structure.

## Stage Banner

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Kata > QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Use uppercase stage names:

- `QUESTIONING`
- `DEFINING REQUIREMENTS`
- `CREATING ROADMAP`
- `PLANNING PHASE`
- `EXECUTING`
- `VERIFYING`
- `MILESTONE COMPLETE`

## Checkpoint

```text
CHECKPOINT: Decision Required

[Brief summary]

Next: [specific action requested]
```

## Status Symbols

- `Complete`: completed or verified.
- `Blocked`: cannot proceed without user action.
- `In progress`: currently being worked.
- `Pending`: not started.
- `Warning`: important but not blocking.

Avoid decorative emoji in generated artifacts. Keep output compact and copy-pasteable.

## Next Up Block

End major workflows with:

```text
Next up:

Run `kata-new-milestone` to define the first milestone.
```

Use the next skill name, not slash command names.
