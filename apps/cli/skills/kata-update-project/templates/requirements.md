# Requirements Artifact Template

Use this as the content shape for `requirements` artifacts.

```markdown
# Requirements: [Scope Name]

**Defined:** [date]
**Core Value:** [from project brief]

## Active Requirements

### [Category]

- [ ] **[CAT]-01**: [User-centric, testable, atomic requirement]
- [ ] **[CAT]-02**: [User-centric, testable, atomic requirement]

## Future Requirements

### [Category]

- **[CAT]-03**: [Deferred requirement]

## Out of Scope

| Feature | Reason |
|---|---|
| [Feature] | [Why excluded] |

## Traceability

| Requirement | Slice/Phase | Status |
|---|---|---|
| [CAT]-01 | Pending | Pending |

## Coverage

- Active requirements: [N]
- Mapped to slices/phases: [N]
- Unmapped: [N]
```

## Quality Criteria

Good requirements are:

- Specific and testable.
- User-centric.
- Atomic.
- Independent enough to plan and verify.

Reject vague requirements. Convert "handle auth" into "User can log in with email/password and stay logged in across browser refresh."

