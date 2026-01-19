# Goal-Backward Verification Methodology

How to verify phase goals through must_haves checking.

## Core Principle

**Task completion is not goal achievement.**

A task "create chat component" can be marked complete when the component is a placeholder. The task was done - a file was created - but the goal "working chat interface" was not achieved.

Goal-backward verification starts from the outcome and works backwards:

1. What must be TRUE for the goal to be achieved?
2. What must EXIST for those truths to hold?
3. What must be WIRED for those artifacts to function?

## must_haves Structure

Plans should include must_haves in frontmatter:

```yaml
must_haves:
  truths:
    - "User can see existing messages"
    - "User can send a message"
  artifacts:
    - path: "src/components/Chat.tsx"
      provides: "Message list rendering"
      max_lines: 200
  key_links:
    - from: "Chat.tsx"
      to: "api/chat"
      via: "fetch in useEffect"
      pattern: "fetch.*api/chat"
```

### Truths

Observable behaviors from user perspective. Each truth should be:
- Testable by a human using the application
- Specific enough to verify programmatically
- Independent (can pass/fail individually)

**Good truths:**
- "User can see existing messages in chronological order"
- "Clicking Reply shows inline composer below comment"

**Bad truths:**
- "Chat works" (too vague)
- "Messages are in state" (implementation detail)

### Artifacts

Concrete files that must exist with substantive content.

Each artifact has:
- `path`: Exact file path
- `provides`: What this file delivers
- `max_lines`: Optional size expectation

### Key Links

Critical connections between artifacts. If broken, the goal fails even with all artifacts present.

Each link has:
- `from`: Source artifact
- `to`: Target artifact
- `via`: Connection type (fetch, import, etc.)
- `pattern`: Regex to verify connection exists

## Verification Levels

### Level 1: Existence

Does the file exist?

```bash
[ -f "$path" ] && echo "EXISTS" || echo "MISSING"
```

### Level 2: Substantive

Is it real implementation or a stub?

**Line count check:**
```bash
lines=$(wc -l < "$path")
[ "$lines" -ge "$min_lines" ] && echo "SUBSTANTIVE" || echo "THIN"
```

**Stub pattern detection:**
```bash
grep -E "TODO|FIXME|placeholder|not implemented|coming soon" "$path"
grep -E "return null|return undefined|return \{\}|return \[\]" "$path"
```

**Export check:**
```bash
grep -E "^export (default )?(function|const|class)" "$path"
```

### Level 3: Wired

Is it connected to the system?

**Import check:**
```bash
grep -r "import.*$artifact_name" src/ --include="*.ts" --include="*.tsx"
```

**Usage check:**
```bash
grep -r "$artifact_name" src/ --include="*.ts" --include="*.tsx" | grep -v "import"
```

## Artifact Status Matrix

| Exists | Substantive | Wired | Status |
|--------|-------------|-------|--------|
| Yes | Yes | Yes | VERIFIED |
| Yes | Yes | No | ORPHANED |
| Yes | No | - | STUB |
| No | - | - | MISSING |

## Key Link Verification Patterns

### Component -> API

```bash
# Check fetch/axios call exists
grep -E "fetch\(['\"].*$api_path|axios\.(get|post).*$api_path" "$component"

# Check response is handled
grep -A 5 "fetch\|axios" "$component" | grep -E "await|\.then|setData|setState"
```

### API -> Database

```bash
# Check database query exists
grep -E "prisma\.$model|db\.$model|$model\.(find|create|update|delete)" "$route"

# Check result is returned
grep -E "return.*json.*\w+|res\.json\(\w+" "$route"
```

### Form -> Handler

```bash
# Check handler exists
grep -E "onSubmit=\{|handleSubmit" "$component"

# Check handler has implementation (not just preventDefault)
grep -A 10 "onSubmit.*=" "$component" | grep -E "fetch|axios|mutate|dispatch"
```

## Gap Classification

When verification fails, classify the gap:

### Missing Artifact

File doesn't exist at expected path.

```yaml
- truth: "User can see messages"
  status: failed
  reason: "Chat.tsx does not exist"
  artifacts:
    - path: "src/components/Chat.tsx"
      issue: "MISSING"
  missing:
    - "Create Chat.tsx component"
```

### Stub Artifact

File exists but has placeholder content.

```yaml
- truth: "User can see messages"
  status: failed
  reason: "Chat.tsx is a stub"
  artifacts:
    - path: "src/components/Chat.tsx"
      issue: "STUB - returns placeholder div"
  missing:
    - "Implement message list rendering"
    - "Add useEffect to fetch messages"
```

### Broken Link

Artifacts exist but aren't connected.

```yaml
- truth: "User can see messages"
  status: failed
  reason: "Chat.tsx exists but doesn't fetch from API"
  artifacts:
    - path: "src/components/Chat.tsx"
      issue: "No fetch call to /api/chat"
  missing:
    - "Add useEffect with fetch to /api/chat"
    - "Store fetched messages in state"
```

### Untrue Behavior

Implementation exists but doesn't achieve truth.

```yaml
- truth: "Messages appear in chronological order"
  status: failed
  reason: "Messages displayed in reverse order"
  artifacts:
    - path: "src/components/Chat.tsx"
      issue: "Array not sorted before render"
  missing:
    - "Sort messages by timestamp ascending"
```

## Gap Diagnosis Output

Structure gaps in VERIFICATION.md frontmatter for consumption by gap closure planning:

```yaml
---
phase: XX-name
verified: 2026-01-19T10:00:00Z
status: gaps_found
score: 2/5 must-haves verified
gaps:
  - truth: "User can see existing messages"
    status: failed
    reason: "Chat.tsx exists but doesn't fetch from API"
    artifacts:
      - path: "src/components/Chat.tsx"
        issue: "No useEffect with fetch call"
    missing:
      - "API call in useEffect to /api/chat"
      - "State for storing fetched messages"
      - "Render messages array in JSX"
---
```

## When to Trigger Gap Closure

After verification with gaps_found status:

1. **Structured gaps exist** in VERIFICATION.md frontmatter
2. **Root causes identified** (not just symptoms)
3. **Missing items specific** (actionable tasks)

Gap closure planning (`/kata:plan-phase --gaps`) reads the gap analysis and creates targeted fix plans.

## Re-verification Mode

When VERIFICATION.md already exists with gaps:

1. Parse previous must_haves and gaps
2. **Failed items:** Full 3-level verification
3. **Passed items:** Quick regression check (existence + basic sanity)
4. Compare results, track:
   - `gaps_closed`: Previously failed, now passing
   - `gaps_remaining`: Still failing
   - `regressions`: Previously passed, now failing

## Verification Mindset

**Do NOT trust SUMMARY claims.** SUMMARYs document what Claude SAID it did. You verify what ACTUALLY exists in the code. These often differ.

**Check the code, not the claims.** Read actual file content. Run actual commands. Verify actual behavior.

**Structure gaps precisely.** Vague gaps lead to vague fixes. Specific gaps enable specific plans.
