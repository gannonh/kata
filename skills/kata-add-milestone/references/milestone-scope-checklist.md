# Milestone Scope Checklist

Evaluation criteria for milestone and phase structure. Apply after creating ROADMAP.md draft.

## User Value Check

**Question:** "What can users DO after this milestone ships?"

**Good answers:**
- "Users can create accounts and log in"
- "Users can browse products and add to cart"
- "Admin can manage inventory"

**Bad answers:**
- "Database is set up"
- "API framework is configured"
- "Infrastructure is ready"

**Test:** Can you demo the milestone to a non-technical user? If demo requires showing code or database tables, user value is missing.

**Fix if failing:**
- Reframe infrastructure phases as feature phases
- Combine setup with first feature that uses it
- Defer non-critical setup to v2

## Demo-ability Check

**CRITICAL:** Phase = PR = Demo unit. Every phase must have a concrete demo scenario.

### Demo Format Requirements

Each phase MUST include a demo field that passes these checks:

**Format checklist:**
- [ ] Starts with "Demo: " prefix
- [ ] Contains specific user actions (visit X, click Y, enter Z)
- [ ] Describes observable outcomes (page loads, data appears, response shown)
- [ ] Executable in 30-60 seconds
- [ ] Requires no code inspection (all UI/CLI visible)
- [ ] Reads like instructions you'd give another person

**Quality levels:**

**EXCELLENT (✓✓✓):**
```
Phase 1: User Registration
Demo: User visits /signup, enters email alice@example.com and password,
clicks Create Account, sees "Check your email" message, clicks confirmation
link in email, logs in with credentials, dashboard loads, session persists
after browser refresh, user clicks Logout, returns to login page
```
*Why excellent:* Step-by-step, observable at every step, complete workflow

**GOOD (✓✓):**
```
Phase 2: Product Catalog
Demo: User visits /products, sees product grid with images and prices,
clicks Electronics category filter, grid updates to show only electronics,
clicks product card, sees detail page with full description
```
*Why good:* Clear actions, observable outcomes, focused on one feature

**ACCEPTABLE (✓):**
```
Phase 3: Plan Generation
Demo: User runs `kata-cloud plan generate "add rate limiting"`, system
outputs "Analyzing codebase..." then "Generating plan...", writes
.plan.json to disk, user runs `cat .kata/plans/01-01.plan.json` to
inspect generated plan
```
*Why acceptable:* CLI demo with visible output, requires file inspection but still concrete

**FAILING (❌):**
```
Phase 4: Code Quality Sweep
Demo: Code is refactored, tests pass, linter reports clean
```
*Why failing:* No user actions, no observable outcomes, requires code inspection

**FAILING (❌):**
```
Phase 5: Database Schema
Demo: Schema exists in database
```
*Why failing:* Not user-visible, requires database inspection

**FAILING (❌):**
```
Phase 6: API Endpoints
Demo: curl returns 200
```
*Why failing:* Not user-facing, too technical, no UI

**FAILING (❌):**
```
Phase 7: Validation
Demo: Validation works correctly
```
*Why failing:* Too abstract, no specific steps, no observable behavior

### Validation Process

For each phase:

1. **Read the demo field**
2. **Execute it mentally** - Can you visualize each step?
3. **Check for red flags:**
   - Requires showing code/database/logs
   - Says "works correctly" without showing how
   - No specific user actions listed
   - No observable outcomes described
   - Too abstract ("validation", "setup", "infrastructure")

4. **If demo fails validation:**
   - **Option A:** Restructure phase as vertical slice (add UI layer)
   - **Option B:** Inline phase with next phase (setup + first feature)
   - **Option C:** Split phase (if too big to demo cohesively)

### Common Fixes

**Problem:** "Phase 1: Database Models"
**Fix:** Inline with "Phase 1: User Management (DB + API + UI)"
**New demo:** User visits /admin/users, sees user table, creates user, user appears in table

**Problem:** "Phase 2: API Layer"
**Fix:** Vertical slice with UI per feature
**New demo:** User interacts with working feature, not curl commands

**Problem:** "Phase 3: Code Cleanup"
**Fix:** Make it phase 0 (before features) or inline with features
**New demo:** If phase 0, demo that existing features still work after cleanup

**Problem:** "Phase 4: Validation & Caching"
**Fix:** Show validation in context of user action
**New demo:** User submits invalid data, sees specific error message, corrects it, submission succeeds

**Test:** Can you record a 60-second video of this demo without showing code? If no, phase is not demo-able.

**Fix if failing:**
- Restructure phases as vertical slices (DB + API + UI per feature)
- Inline setup with first feature
- Ensure each phase ships working end-to-end capability

## Independence Check

**Question:** "Can phases execute with minimal dependencies?"

**Good structure:**
```
Phase 1: User Auth (no dependencies)
Phase 2: Product Catalog (depends on Phase 1 for auth)
Phase 3: Shopping Cart (depends on Phases 1-2)
Phase 4: Order Processing (depends on Phases 1-3)

Wave 1: Phase 1
Wave 2: Phase 2
Wave 3: Phases 3-4 (CAN'T parallel - both need 1-2)
```

**Bad structure:**
```
Phase 1: Database Models (all models)
Phase 2: API Layer (depends on Phase 1 - ALL APIs)
Phase 3: UI Layer (depends on Phase 2 - ALL UI)
Phase 4: Integration Tests (depends on Phase 3)

Everything sequential. No parallelism possible.
```

**Test:** Draw dependency graph. How many phases can run in parallel? Good structure has 30%+ parallel opportunities.

**Fix if failing:**
- Switch from horizontal layers to vertical features
- Identify truly independent features
- Reduce cross-phase dependencies

## Slicing Check

**Question:** "Are phases vertical (feature-focused) or horizontal (layer-focused)?"

**Vertical phases (GOOD):**
- Named after features/capabilities
- Each phase delivers end-to-end functionality
- Demo-able independently
- Can merge as standalone PR

```
✓ "User Authentication"
✓ "Product Catalog"
✓ "Shopping Cart"
✓ "Order Processing"
```

**Horizontal phases (BAD):**
- Named after technical layers
- Each phase is partial implementation
- Nothing works until all phases complete
- High integration risk

```
❌ "Database Schema"
❌ "API Endpoints"
❌ "Frontend Components"
❌ "Integration Layer"
```

**Test:** Read phase names. Do they describe user features or technical layers?

**Fix if failing:**
- Rename phases to features they deliver
- Restructure: one feature per phase (full stack)
- Combine layers within feature phases

## Red Flags

Structural anti-patterns that indicate poor slicing:

### Flag 1: Setup-Only Phases

```
❌ Phase 1: Project Setup
   - Initialize Next.js
   - Set up Prisma
   - Configure Tailwind
   - Deploy pipeline
```

**Why bad:** No user value. Not demo-able. Blocks all real work.

**Fix:** Inline setup with first feature.

```
✓ Phase 1: User Authentication
   - Set up Next.js + Prisma + Tailwind (inlined)
   - Create User model
   - Build signup/login API
   - Build auth UI
   - Demo: Working signup/login
```

### Flag 2: Layer-Focused Phases

```
❌ Phase 2: Database Models
   - User model
   - Product model
   - Order model
   - Payment model
```

**Why bad:** No demo. Just data structures. Nothing works yet.

**Fix:** One model per feature phase.

```
✓ Phase 1: User Auth (includes User model)
✓ Phase 2: Product Catalog (includes Product model)
✓ Phase 3: Order Processing (includes Order model)
```

### Flag 3: Strictly Sequential Phases

```
❌ Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
   Every phase depends on ALL prior phases
```

**Why bad:** No parallel execution. Bottlenecked development. High coupling.

**Fix:** Identify independent features.

```
✓ Phase 1 (foundation)
   ├─ Phase 2 (depends on 1)
   ├─ Phase 3 (depends on 1)
   └─ Phase 4 (depends on 1)

Wave 1: Phase 1
Wave 2: Phases 2, 3, 4 (parallel)
```

### Flag 4: Non-Demo-able Phases

**Test:** "Can you show what this phase does?"

```
❌ Phase 1: API Framework
   Answer: "No, nothing visible yet"

❌ Phase 2: Database Schema
   Answer: "Just tables, no features"

✓ Phase 1: User Registration
   Answer: "Yes, users can sign up and log in"
```

### Flag 5: Scope Explosion

```
❌ Phase 2: User Management
   - User CRUD
   - Role management
   - Permission system
   - Audit logging
   - Activity tracking
   - Email preferences
   - Notification settings
   - Profile customization

Expected: 3 plans
Actual: 12 plans
```

**Why bad:** Scope creep. Context overload. Should be multiple phases.

**Fix:** Split into phases.

```
✓ Phase 2: User Authentication (3 plans)
✓ Phase 3: User Profiles (2 plans)
✓ Phase 4: Role Management (3 plans) [if v1 requirement]
```

## Compression vs Splitting Guidance

### When to Compress (Combine Plans/Tasks)

**Compress if:**
- Task is < 15 minutes of work
- Tasks touch same file
- One task is just setup for the next
- Tasks have no natural verification boundary between them

**Example:**

```
Before:
- Plan 01: Create User model
- Plan 02: Create login API
- Plan 03: Create signup API

After:
- Plan 01: User authentication API
  - Task 1: Create User model + login endpoint
  - Task 2: Create signup endpoint
  - Task 3: Wire auth middleware
```

### When to Split (Break Apart)

**Split if:**
- Plan has 4+ tasks
- Plan touches 6+ files
- Plan crosses multiple subsystems
- Any single task is >60 minutes
- Context usage would exceed 60%

**Example:**

```
Before:
- Plan 01: Complete E-commerce Platform
  - Create models (User, Product, Order, Payment)
  - Create API layer (12 endpoints)
  - Build admin UI (5 pages)
  - Build customer UI (8 pages)
  - Integrate Stripe
  - Set up email notifications

After:
- Phase 1: User Auth (3 plans)
- Phase 2: Product Catalog (3 plans)
- Phase 3: Shopping Cart (2 plans)
- Phase 4: Checkout (4 plans)
```

## Depth Calibration

Depth controls compression tolerance. Apply AFTER deriving natural structure.

### Quick Depth

**Target:** 1-3 plans per phase

**Compression strategy:**
- Combine related tasks aggressively
- Skip nice-to-haves
- Focus on critical path
- 3 tasks per plan (upper limit)

**Use when:**
- User wants speed over thoroughness
- Milestone is small/simple
- Time-sensitive delivery

### Standard Depth

**Target:** 3-5 plans per phase

**Compression strategy:**
- Balanced grouping
- Include important edge cases
- 2-3 tasks per plan
- Reasonable context usage

**Use when:**
- Default mode (most milestones)
- Balanced speed and quality
- Standard complexity project

### Comprehensive Depth

**Target:** 5-10 plans per phase

**Compression strategy:**
- Let natural boundaries stand
- Include edge cases, error handling
- 2 tasks per plan (prefer smaller)
- Optimize for quality over speed

**Use when:**
- User wants thorough coverage
- Complex domain (fintech, healthcare)
- High-risk project
- Learning-focused development

## Common Fixes

### Fix 1: Infrastructure-Heavy Milestone

**Before:**
```
v1.0: Foundation
- Phase 1: Database setup
- Phase 2: API framework
- Phase 3: Auth system
- Phase 4: Deploy pipeline
```

**After:**
```
v1.0: Core Features
- Phase 1: User Management (includes auth, DB setup)
- Phase 2: Data Management (includes API framework)
- Phase 3: Dashboard (includes deploy pipeline)
```

### Fix 2: Sequential Bottleneck

**Before:**
```
Phase 1: Create all models → Phase 2: Create all APIs → Phase 3: Create all UI
```

**After:**
```
Phase 1: Foundation (shared models)
Phase 2: Feature A (model + API + UI) [parallel]
Phase 3: Feature B (model + API + UI) [parallel]
Phase 4: Feature C (model + API + UI) [parallel]
```

### Fix 3: Non-Demo-able Phases

**Before:**
```
Phase 1: Backend Setup (not demo-able)
Phase 2: Frontend Setup (not demo-able)
Phase 3: Integration (finally demo-able)
```

**After:**
```
Phase 1: User Auth (demo: login works)
Phase 2: Product Catalog (demo: browse products)
Phase 3: Shopping Cart (demo: add to cart)
```

## Summary Decision Matrix

| Check             | Pass Criteria                               | Fail Signal                                | Fix                                  |
| ----------------- | ------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| User Value        | Users can DO something                      | "Infrastructure is ready"                  | Reframe as feature phases            |
| Demo-ability      | Can show working feature per phase          | "Trust me, it exists"                      | Vertical slices (DB + API + UI)      |
| Independence      | 30%+ phases can run parallel                | Everything sequential                      | Identify independent features        |
| Slicing           | Phases named after features                 | Phases named after layers                  | Rename, restructure as features      |
| Red Flags         | No setup-only, layer, or sequential phases  | Setup phase, "Models", strict dependencies | Inline setup, vertical slices        |
| Compression       | 2-3 tasks per plan, <50% context            | 4+ tasks, >60% context                     | Split plans                          |
| Depth Calibration | Plans match depth setting (Quick/Std/Comp)  | Artificial padding or excessive compression | Derive from work, apply depth as guidance |
| Phase = PR = Demo | Each phase can merge as standalone PR       | Phase can't merge until later phases done  | Ensure end-to-end completeness       |
