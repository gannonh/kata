# Discovery Levels

Research depth indicators for phase research. Use these to determine how much investigation a phase needs.

## Level 0: Skip Research

**Time:** 0 minutes
**When:** Pure internal work with no external dependencies

**Indicators:**
- Refactoring existing code
- Internal reorganization
- Documentation updates
- Configuration changes
- Moving files between directories

**Example phases:**
- "Refactor auth module into separate files"
- "Add JSDoc comments to API routes"
- "Reorganize folder structure"

**Action:** Proceed directly to planning without research.

## Level 1: Quick Verification

**Time:** 2-5 minutes
**When:** Known patterns, just need version/syntax confirmation

**Indicators:**
- Using familiar libraries
- Following established patterns in codebase
- Minor additions to existing features
- Claude has high confidence from training

**Example phases:**
- "Add password reset endpoint" (auth patterns established)
- "Create new API route" (framework patterns known)
- "Add form validation" (library already in use)

**Research focus:**
- Current version of library
- Any breaking changes since training
- Quick Context7 query for specific API

**Action:** Brief Context7 lookup, then proceed to planning.

## Level 2: Standard Research

**Time:** 15-30 minutes
**When:** Unfamiliar domain, need to understand landscape

**Indicators:**
- New library or framework
- Domain Claude hasn't worked extensively with
- Multiple valid approaches to choose from
- Integration with external services

**Example phases:**
- "Implement Stripe payments"
- "Add real-time notifications"
- "Create PDF export feature"
- "Build email verification flow"

**Research focus:**
- Standard stack for this domain
- Established architecture patterns
- Common pitfalls and gotchas
- What NOT to hand-roll
- Code examples from official docs

**Action:** Full research protocol - Context7, official docs, WebSearch with verification.

## Level 3: Deep Dive

**Time:** 1+ hour
**When:** Complex/novel domain, high risk of wrong approach

**Indicators:**
- Novel technology or cutting-edge approaches
- High-stakes functionality (security, payments)
- Multiple services or complex integrations
- Significant architectural decisions
- Domain requires specialized knowledge

**Example phases:**
- "Implement OAuth 2.0 with PKCE flow"
- "Build real-time collaboration features"
- "Create multi-tenant architecture"
- "Implement end-to-end encryption"
- "Build GraphQL federation"

**Research focus:**
- All Level 2 items, plus:
- State of the art vs training data
- Security considerations
- Performance implications
- Scalability patterns
- Detailed code examples
- Alternative approaches with tradeoffs

**Action:** Extended research with multiple tool passes, cross-verification, detailed documentation.

## Detection Heuristic

To determine appropriate level:

```
1. Is this purely internal work with no external dependencies?
   YES -> Level 0 (Skip)

2. Is this using a library/pattern already established in codebase?
   YES -> Level 1 (Quick)

3. Is this introducing new technology or domain?
   YES -> Continue to step 4
   NO -> Level 1 (Quick)

4. Is this high-stakes (security, payments, architecture)?
   YES -> Level 3 (Deep)
   NO -> Level 2 (Standard)

5. Does Claude have low confidence about this domain?
   YES -> Level 3 (Deep)
   NO -> Level 2 (Standard)
```

## When to Suggest Full Research Phase

Sometimes a phase needs research BEFORE planning can begin. Suggest adding a research phase when:

- Multiple valid architectural approaches with different tradeoffs
- Technology choices that affect future phases significantly
- Domain requires validation of feasibility before committing
- User is uncertain about scope or approach

**Recommendation format:**

```
This phase touches [complex domain]. I'd recommend researching before planning:

/kata:research-phase {phase}

This will produce RESEARCH.md with:
- Standard stack recommendations
- Architecture patterns
- Known pitfalls
- Code examples

Then we can plan with confidence.
```

## Confidence Levels

Research findings should be tagged:

| Level | Sources | Use |
|-------|---------|-----|
| HIGH | Context7, official docs | State as fact |
| MEDIUM | WebSearch + official verification | State with attribution |
| LOW | WebSearch only, single source | Flag for validation |

Never present LOW confidence findings as authoritative.
