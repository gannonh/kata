# Goal-Backward Reference

Methodology for deriving must_haves using goal-backward planning.

## Overview

**Forward planning asks:** "What should we build?"

**Goal-backward planning asks:** "What must be TRUE for the goal to be achieved?"

Forward planning produces tasks. Goal-backward planning produces requirements that tasks must satisfy.

## The Process

### Step 1: State the Goal

Take the phase goal from ROADMAP.md. This is the **outcome**, not the work.

- **Good:** "Working chat interface" (outcome)
- **Bad:** "Build chat components" (task)

If the roadmap goal is task-shaped, reframe it as outcome-shaped.

### Step 2: Derive Observable Truths

Ask: "What must be TRUE for this goal to be achieved?"

List 3-7 truths from the **USER's perspective**. These are observable behaviors.

For "working chat interface":
- User can see existing messages
- User can type a new message
- User can send the message
- Sent message appears in the list
- Messages persist across page refresh

**Test:** Each truth should be verifiable by a human using the application.

### Step 3: Derive Required Artifacts

For each truth, ask: "What must EXIST for this to be true?"

"User can see existing messages" requires:
- Message list component (renders Message[])
- Messages state (loaded from somewhere)
- API route or data source (provides messages)
- Message type definition (shapes the data)

**Test:** Each artifact should be a specific file or database object.

### Step 4: Derive Required Wiring

For each artifact, ask: "What must be CONNECTED for this artifact to function?"

Message list component wiring:
- Imports Message type (not using `any`)
- Receives messages prop or fetches from API
- Maps over messages to render (not hardcoded)
- Handles empty state (not just crashes)

### Step 5: Identify Key Links

Ask: "Where is this most likely to break?"

Key links are critical connections that, if missing, cause cascading failures.

For chat interface:
- Input onSubmit -> API call (if broken: typing works but sending doesn't)
- API save -> database (if broken: appears to send but doesn't persist)
- Component -> real data (if broken: shows placeholder, not messages)

## Must-Haves Output Format

```yaml
must_haves:
  truths:
    - "User can see existing messages"
    - "User can send a message"
    - "Messages persist across refresh"
  artifacts:
    - path: "src/components/Chat.tsx"
      provides: "Message list rendering"
      min_lines: 30
    - path: "src/app/api/chat/route.ts"
      provides: "Message CRUD operations"
      exports: ["GET", "POST"]
    - path: "prisma/schema.prisma"
      provides: "Message model"
      contains: "model Message"
  key_links:
    - from: "src/components/Chat.tsx"
      to: "/api/chat"
      via: "fetch in useEffect"
      pattern: "fetch.*api/chat"
    - from: "src/app/api/chat/route.ts"
      to: "prisma.message"
      via: "database query"
      pattern: "prisma\\.message\\.(find|create)"
```

## Artifact Validation Rules

### path
The file path that must exist.

### provides
What this artifact contributes to the system.

### Validation Options

| Field | Type | Purpose |
|-------|------|---------|
| `min_lines` | number | File must have at least N lines |
| `max_lines` | number | File must not exceed N lines |
| `exports` | string[] | Named exports that must exist |
| `contains` | string | Text that must appear in file |

## Key Link Validation Rules

### from
Source file path.

### to
Target (file path, API route, or identifier).

### via
Description of the connection type.

### pattern
Regex pattern to verify the connection exists in source file.

## Common Failures

### Truths Too Vague

**Bad:** "User can use chat"

**Good:** "User can see messages", "User can send message", "Messages persist"

### Artifacts Too Abstract

**Bad:** "Chat system", "Auth module"

**Good:** "src/components/Chat.tsx", "src/app/api/auth/login/route.ts"

### Missing Wiring

**Bad:** Listing components without how they connect

**Good:** "Chat.tsx fetches from /api/chat via useEffect on mount"

## Verification Integration

During plan execution, must_haves enable automated verification:

1. **truths** - Checked via functional tests or manual verification
2. **artifacts** - Checked via file existence and content validation
3. **key_links** - Checked via grep patterns in source files

If verification fails, the gap closure workflow uses must_haves to identify exactly what's broken and where.

## Examples

### Authentication Phase

```yaml
must_haves:
  truths:
    - "User can register with email and password"
    - "User can log in with valid credentials"
    - "Invalid credentials are rejected"
    - "Authenticated users can access protected routes"
    - "Unauthenticated users are redirected to login"
  artifacts:
    - path: "src/app/api/auth/register/route.ts"
      provides: "User registration endpoint"
      exports: ["POST"]
    - path: "src/app/api/auth/login/route.ts"
      provides: "User login endpoint"
      exports: ["POST"]
    - path: "src/middleware.ts"
      provides: "Route protection"
      contains: "matcher"
  key_links:
    - from: "src/app/api/auth/register/route.ts"
      to: "prisma.user.create"
      via: "database insert"
      pattern: "prisma\\.user\\.create"
    - from: "src/app/api/auth/login/route.ts"
      to: "bcrypt"
      via: "password comparison"
      pattern: "bcrypt\\.compare"
```

### API Integration Phase

```yaml
must_haves:
  truths:
    - "Application can fetch data from external API"
    - "API errors are handled gracefully"
    - "Rate limiting is respected"
  artifacts:
    - path: "src/lib/api-client.ts"
      provides: "External API client"
      exports: ["fetchData", "APIError"]
    - path: "src/app/api/proxy/route.ts"
      provides: "Server-side API proxy"
      exports: ["GET"]
  key_links:
    - from: "src/lib/api-client.ts"
      to: "fetch"
      via: "HTTP request"
      pattern: "fetch\\("
    - from: "src/app/api/proxy/route.ts"
      to: "src/lib/api-client.ts"
      via: "import"
      pattern: "import.*api-client"
```
