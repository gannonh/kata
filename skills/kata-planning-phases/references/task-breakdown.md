# Task Breakdown Reference

Detailed guidance on breaking phases into well-sized, specific tasks.

## Task Anatomy

Every task has four required fields:

### files

Exact file paths created or modified.

**Good:** `src/app/api/auth/login/route.ts`, `prisma/schema.prisma`

**Bad:** "the auth files", "relevant components"

### action

Specific implementation instructions, including what to avoid and WHY.

**Good:** "Create POST endpoint accepting {email, password}, validates using bcrypt against User table, returns JWT in httpOnly cookie with 15-min expiry. Use jose library (not jsonwebtoken - CommonJS issues with Edge runtime)."

**Bad:** "Add authentication", "Make login work"

### verify

How to prove the task is complete.

**Good:** `npm test` passes, `curl -X POST /api/auth/login` returns 200 with Set-Cookie header

**Bad:** "It works", "Looks good"

### done

Acceptance criteria - measurable state of completion.

**Good:** "Valid credentials return 200 + JWT cookie, invalid credentials return 401"

**Bad:** "Authentication is complete"

## Task Types

| Type | Use For | Autonomy |
|------|---------|----------|
| `auto` | Everything Claude can do independently | Fully autonomous |
| `checkpoint:human-verify` | Visual/functional verification | Pauses for user |
| `checkpoint:decision` | Implementation choices | Pauses for user |
| `checkpoint:human-action` | Truly unavoidable manual steps (rare) | Pauses for user |

**Automation-first rule:** If Claude CAN do it via CLI/API, Claude MUST do it. Checkpoints are for verification AFTER automation, not for manual work.

### Checkpoint Structure Examples

**human-verify:**
```xml
<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Complete auth flow (schema + API + UI)</what-built>
  <how-to-verify>
    1. Visit http://localhost:3000/login
    2. Enter test@example.com / password123
    3. Should redirect to dashboard
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>
```

**decision:**
```xml
<task type="checkpoint:decision" gate="blocking">
  <decision>Which authentication approach?</decision>
  <context>Both work, tradeoffs differ</context>
  <options>
    <option id="jwt">
      <name>JWT Tokens</name>
      <pros>Stateless, scalable</pros>
      <cons>Can't revoke easily</cons>
    </option>
    <option id="sessions">
      <name>Server Sessions</name>
      <pros>Easy to revoke</pros>
      <cons>Requires session store</cons>
    </option>
  </options>
  <resume-signal>Select: jwt or sessions</resume-signal>
</task>
```

## Task Sizing

Each task should take Claude **15-60 minutes** to execute:

| Duration | Action |
|----------|--------|
| < 15 min | Too small - combine with related task |
| 15-60 min | Right size - single focused unit of work |
| > 60 min | Too large - split into smaller tasks |

### Signals a Task is Too Large

- Touches more than 3-5 files
- Has multiple distinct "chunks" of work
- You'd naturally take a break partway through
- The action section is more than a paragraph

### Signals Tasks Should Be Combined

- One task just sets up for the next
- Separate tasks touch the same file
- Neither task is meaningful alone

## TDD Detection Heuristic

For each potential task, evaluate TDD fit:

**Heuristic:** Can you write `expect(fn(input)).toBe(output)` before writing `fn`?

- Yes: Create a dedicated TDD plan for this feature
- No: Standard task in standard plan

### TDD Candidates (Dedicated TDD Plans)

- Business logic with defined inputs/outputs
- API endpoints with request/response contracts
- Data transformations, parsing, formatting
- Validation rules and constraints
- Algorithms with testable behavior
- State machines and workflows

### Standard Tasks (Remain in Standard Plans)

- UI layout, styling, visual components
- Configuration changes
- Glue code connecting existing components
- One-off scripts and migrations
- Simple CRUD with no business logic

**Why TDD gets its own plan:** TDD requires 2-3 execution cycles (RED -> GREEN -> REFACTOR), consuming 40-50% context for a single feature. Embedding in multi-task plans degrades quality.

## Specificity Examples

Tasks must be specific enough for clean execution:

| TOO VAGUE | JUST RIGHT |
|-----------|------------|
| "Add authentication" | "Add JWT auth with refresh rotation using jose library, store in httpOnly cookie, 15min access / 7day refresh" |
| "Create the API" | "Create POST /api/projects endpoint accepting {name, description}, validates name length 3-50 chars, returns 201 with project object" |
| "Style the dashboard" | "Add Tailwind classes to Dashboard.tsx: grid layout (3 cols on lg, 1 on mobile), card shadows, hover states on action buttons" |
| "Handle errors" | "Wrap API calls in try/catch, return {error: string} on 4xx/5xx, show toast via sonner on client" |
| "Set up the database" | "Add User and Project models to schema.prisma with UUID ids, email unique constraint, createdAt/updatedAt timestamps, run prisma db push" |

**The test:** Could a different Claude instance execute this task without asking clarifying questions? If not, add specificity.

## User Setup Detection

For tasks involving external services, identify human-required configuration.

**External service indicators:**
- New SDK: `stripe`, `@sendgrid/mail`, `twilio`, `openai`, `@supabase/supabase-js`
- Webhook handlers: Files in `**/webhooks/**`
- OAuth integration: Social login, third-party auth
- API keys: Code referencing `process.env.SERVICE_*` patterns

**For each external service, determine:**
1. **Env vars needed** - What secrets must be retrieved from dashboards?
2. **Account setup** - Does user need to create an account?
3. **Dashboard config** - What must be configured in external UI?

Record in `user_setup` frontmatter. Only include what Claude literally cannot do.

**Important:** User setup info goes in frontmatter ONLY. Do NOT surface it in planning output. The execute-plan workflow handles presenting this at the right time.
