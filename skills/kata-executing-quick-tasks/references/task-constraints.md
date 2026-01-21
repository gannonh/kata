# Quick Task Constraints

Validation rules and heuristics for determining if a task qualifies for quick execution.

## Size Constraints

### File Count

**Threshold:** ≤3 files

**Rationale:** Quick tasks should have focused scope. More files = higher complexity = planning recommended.

**Examples:**

✅ **QUICK:**
- Edit single file: `src/utils/validator.ts`
- Add test + implementation: `src/api.ts`, `src/api.test.ts`
- Update config + docs: `package.json`, `README.md`

❌ **NOT QUICK:**
- Refactor across 5 files
- Add feature touching multiple modules
- Migration affecting entire directory

### Time Estimate

**Threshold:** <30 minutes

**Heuristics:**

| Estimated Duration | Category   | Recommendation     |
| ------------------ | ---------- | ------------------ |
| <10 min            | Trivial    | Quick task ✓       |
| 10-30 min          | Small      | Quick task ✓       |
| 30-60 min          | Medium     | Consider planning  |
| >60 min            | Large      | Requires planning  |

**Indicators of >30 min:**
- Research required
- Need to understand unfamiliar code
- Multiple subsystems affected
- Testing unclear
- Breaking changes possible

### Lines Changed

**Guideline:** <200 lines changed (added + modified + deleted)

**Exceptions:**
- Generated files (lockfiles, build artifacts)
- Formatting-only changes
- Moving code (refactor without logic changes)

**200+ lines typically indicates:**
- New feature (needs planning)
- Major refactor (needs planning)
- Multiple concerns (split into tasks)

## Clarity Constraints

### Requirements Are Clear

**Quick tasks require:**
- [ ] Exact change specified ("Fix typo in README line 42")
- [ ] Expected outcome defined ("Function returns null instead of throwing")
- [ ] Acceptance criteria measurable ("Tests pass", "Build succeeds")

**NOT clear enough for quick:**
- "Improve error handling" (what specifically?)
- "Make it faster" (how much? where?)
- "Add validation" (which fields? what rules?)

### No Research Needed

**Quick task can proceed if:**
- [ ] You already know where the code is
- [ ] You understand the change needed
- [ ] No external documentation needed
- [ ] No API research required

**Requires planning if:**
- Need to research library APIs
- Must understand existing architecture
- Unfamiliar with codebase area
- Need to investigate root cause

### No Architecture Decisions

**Quick task safe if:**
- [ ] Pattern already established
- [ ] Following existing conventions
- [ ] No new abstractions needed

**Requires planning if:**
- Choosing between approaches
- Adding new design pattern
- Changing API contract
- Introducing new dependency

## Scope Constraints

### No New Dependencies

**Quick task allowed:**
- Using existing dependencies
- Removing dependencies
- Updating versions (minor/patch)

**Requires planning:**
- Adding new npm package
- Introducing new library
- Major version updates
- Switching frameworks

### No Schema Changes

**Quick task allowed:**
- Query changes (no schema impact)
- Adding columns with defaults
- Renaming columns (with migration)

**Requires planning:**
- Adding new tables
- Changing primary keys
- Altering relationships
- Data migrations

### No Breaking Changes

**Quick task allowed:**
- Backward-compatible additions
- Internal refactoring
- Bug fixes (no API changes)

**Requires planning:**
- Changing function signatures
- Removing public APIs
- Altering return types
- Modifying contracts

## Escalation Decision Tree

```
Is task well-defined?
├─ NO → Ask for clarification → Still unclear? → Escalate to planning
└─ YES → Continue

Affects ≤3 files?
├─ NO → Escalate to planning
└─ YES → Continue

Time estimate <30 min?
├─ NO → Escalate to planning
└─ YES → Continue

Architecture decisions needed?
├─ YES → Escalate to planning
└─ NO → Continue

New dependencies required?
├─ YES → Escalate to planning
└─ NO → Continue

Breaking changes?
├─ YES → Escalate to planning
└─ NO → QUICK TASK ✓
```

## Examples: Quick vs Not Quick

### ✅ QUICK TASKS

**Typo fix:**
```
File: README.md
Change: "recieve" → "receive"
Verification: Read file
Commit: docs: fix typo in installation section
```

**Add utility function:**
```
Files: src/utils/format.ts, src/utils/format.test.ts
Change: Add formatCurrency(amount) helper
Verification: Tests pass
Commit: feat: add currency formatting utility
```

**Config update:**
```
File: .gitignore
Change: Add .env.local to ignored files
Verification: Git status shows file ignored
Commit: chore: ignore .env.local files
```

**Import path fix:**
```
File: src/components/Button.tsx
Change: Fix relative import path after file move
Verification: Build succeeds
Commit: fix: correct import path for Icon component
```

### ❌ NOT QUICK (Requires Planning)

**Add authentication:**
```
Why not quick:
- Multiple files (auth.ts, middleware.ts, routes.ts, types.ts, db/schema.ts)
- Architecture decisions (JWT vs sessions? Where to store tokens?)
- New dependencies (jose, bcrypt)
- Breaking changes (protected routes need auth headers)
- Time estimate: 2-3 hours
```

**Fix performance issue:**
```
Why not quick:
- Research needed (profile to find bottleneck)
- Solution unclear (caching? indexing? query optimization?)
- Testing complex (need to measure improvement)
- May affect multiple queries
```

**Refactor component structure:**
```
Why not quick:
- Multiple files (split large component into smaller ones)
- Design decisions (component boundaries? prop interfaces?)
- Affects other files importing the component
- Breaking changes possible
```

## Commit Message Guidelines

### Format

```
{type}: {description}

{optional body with details}
```

### Types for Quick Tasks

| Type       | Use Case                    | Example                                  |
| ---------- | --------------------------- | ---------------------------------------- |
| `fix`      | Bug fix                     | `fix: handle null return from API`       |
| `feat`     | Small new feature           | `feat: add copy button to code blocks`   |
| `refactor` | Code cleanup                | `refactor: extract validation to helper` |
| `docs`     | Documentation               | `docs: add usage examples to README`     |
| `style`    | Formatting, linting         | `style: fix indentation in config.ts`    |
| `test`     | Test addition/fix           | `test: add edge case for email validator`|
| `chore`    | Config, deps, tooling       | `chore: update typescript to 5.3`        |

### Description Guidelines

**DO:**
- Start with lowercase verb
- Be specific and concise
- Focus on what changed

**DON'T:**
- Use past tense ("Fixed bug")
- Be vague ("Update file")
- Include ticket numbers (use body)

**Examples:**

✅ **GOOD:**
```
fix: prevent duplicate submissions on double-click
feat: add loading indicator to submit button
refactor: extract validation logic to separate function
```

❌ **BAD:**
```
Fixed a bug (what bug?)
Updated component (what changed?)
Changes to auth system (too vague for quick task)
```

## When in Doubt

**Ask yourself:**
1. Can I complete this in one sitting without breaks?
2. Do I know exactly what to change?
3. Is verification straightforward?
4. Will this be one clean commit?
5. No surprises likely?

**5 YES answers** → Quick task ✓
**Any NO** → Consider planning

**Remember:** Planning is not overhead, it's insurance. When uncertain, plan.
