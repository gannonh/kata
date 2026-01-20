# Checkpoint Protocol

Handling checkpoints and user interactions during plan execution.

## Core Principle

Checkpoints are for verification and decisions, NOT manual work. Claude automates everything with CLI/API before checkpoints. The checkpoint is for the user to verify or decide.

---

## Checkpoint Types

### checkpoint:human-verify (90% of checkpoints)

For visual/functional verification after automation.

**When to use:**
- After deploying something user should verify
- After building UI that needs visual check
- After configuring service that needs manual confirmation

**Display format:**

```
CHECKPOINT: Verification Required

Progress: {X}/{Y} tasks complete
Task: [task name]

Built: [what was automated - deployed, built, configured]

How to verify:
  1. [Step 1 - exact command/URL]
  2. [Step 2 - what to check]
  3. [Step 3 - expected behavior]

---
YOUR ACTION: Type "approved" or describe issues
---
```

### checkpoint:decision (9% of checkpoints)

For implementation choices requiring user input.

**When to use:**
- Multiple valid approaches exist
- User preference affects outcome
- Architectural decision needed mid-execution

**Display format:**

```
CHECKPOINT: Decision Required

Progress: {X}/{Y} tasks complete
Task: [task name]

Decision needed: [decision]

Context: [why this matters]

Options:
1. [option-id]: [name]
   Pros: [pros]
   Cons: [cons]

2. [option-id]: [name]
   Pros: [pros]
   Cons: [cons]

---
YOUR ACTION: Select: option-id
---
```

### checkpoint:human-action (1% - rare)

For truly unavoidable manual steps with no CLI/API alternative.

**When to use:**
- Email verification link click
- 2FA code entry
- Physical device action
- OAuth consent screen

**Display format:**

```
CHECKPOINT: Action Required

Progress: {X}/{Y} tasks complete
Task: [task name]

I automated: [what Claude already did via CLI/API]

Need your help with: [the ONE thing with no CLI/API]

Instructions:
[Single unavoidable step]

I'll verify after: [verification command/check]

---
YOUR ACTION: Type "done" when complete
---
```

---

## Authentication Gates

Authentication errors are NOT failures. They're expected interaction points.

**Authentication error indicators:**
- CLI returns: "Error: Not authenticated", "Not logged in", "Unauthorized", "401", "403"
- API returns: "Authentication required", "Invalid API key", "Missing credentials"
- Command fails with: "Please run {tool} login" or "Set {ENV_VAR} environment variable"

**Handle as checkpoint:human-action:**

1. Recognize it's an auth gate - Not a bug
2. STOP current task - Don't retry repeatedly
3. Return checkpoint with exact auth steps
4. Wait for user to authenticate
5. Verify auth works
6. Retry original task
7. Continue normally

**Example:**

```
CHECKPOINT: Authentication Required

Progress: 2/8 tasks complete
Task: Deploy to Vercel

Attempted: vercel --yes
Error: Not authenticated

What you need to do:
  1. Run: vercel login
  2. Complete browser authentication

I'll verify: vercel whoami returns your account

---
YOUR ACTION: Type "done" when authenticated
---
```

---

## Return Format for Orchestrator

When spawned by orchestrator and hitting a checkpoint, return structured state:

```markdown
## CHECKPOINT REACHED

**Type:** [human-verify | decision | human-action]
**Plan:** {phase}-{plan}
**Progress:** {completed}/{total} tasks complete

### Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | [task name] | [hash] | [key files] |
| 2 | [task name] | [hash] | [key files] |

### Current Task

**Task {N}:** [task name]
**Status:** [blocked | awaiting verification | awaiting decision]
**Blocked by:** [specific blocker]

### Checkpoint Details

[User-facing content based on checkpoint type]

### Awaiting

[What user needs to do/provide]
```

**Why this structure:**
- **Completed Tasks table:** Fresh continuation agent knows what's done
- **Commit hashes:** Verification that work was committed
- **Files column:** Quick reference for what exists
- **Current Task + Blocked by:** Precise continuation point
- **Checkpoint Details:** User-facing content orchestrator presents directly

---

## Continuation After Checkpoint

After user responds, orchestrator spawns fresh continuation agent with:

```markdown
<completed_tasks>
| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | [task name] | [hash] | [files] |
| 2 | [task name] | [hash] | [files] |
</completed_tasks>

<resume_point>
Resume from Task {N}: [task name]
User response: [what user provided]
</resume_point>

<instructions>
Based on checkpoint type:
- human-verify: User approved, continue to next task
- human-action: Verify action worked, then continue
- decision: Implement selected option
</instructions>
```

**Continuation agent protocol:**

1. Verify previous commits exist:
   ```bash
   git log --oneline -5
   ```

2. DO NOT redo completed tasks - They're already committed

3. Start from resume point specified

4. Handle based on checkpoint type:
   - After human-action: Verify the action worked, then continue
   - After human-verify: User approved, continue to next task
   - After decision: Implement the selected option

5. If another checkpoint hit: Return with ALL completed tasks (previous + new)

6. Continue until plan completes or next checkpoint

---

## Gate Types

**blocking (default):**
Cannot proceed without user response. Execution pauses.

**non-blocking:**
Can proceed with default, user can adjust later. Rare.

---

## Summary Documentation

Document authentication gates as normal flow, not deviations:

```markdown
## Authentication Gates

During execution, these authentication requirements were handled:

1. Task 3: Vercel CLI required authentication
   - Paused for `vercel login`
   - Resumed after authentication
   - Deployed successfully

These are normal gates, not errors.
```
