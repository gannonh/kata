# Vertical Slicing Principles

## Core Philosophy

**Vertical slice** = incremental value delivery. Each slice is complete, shippable, and demo-able.

**Horizontal layer** = delayed value. Nothing works until all layers complete.

```
Vertical (PREFER):
├─ User Auth Phase (DB + API + UI) ← DEMO-ABLE
├─ Product Catalog Phase (DB + API + UI) ← DEMO-ABLE
└─ Checkout Phase (DB + API + UI) ← DEMO-ABLE

Horizontal (AVOID):
├─ Database Models Phase ← NOT DEMO-ABLE
├─ API Endpoints Phase ← NOT DEMO-ABLE
└─ UI Components Phase ← DEMO-ABLE (finally)
```

**Key principle:** Every phase must be independently demo-able. If you can't show what the phase does, it's wrong.

## Phase = PR = Demo Unit

**Critical mapping:** Phase boundaries align with PR boundaries, which align with demo boundaries.

- **Phase completes** → PR created → User can demo the feature
- **Phase merges** → Main branch ships new capability
- **Phase fails demo** → PR doesn't merge

This is why phases MUST be:
- **Independently verifiable** — Can run UAT on the phase alone
- **Feature-complete** — Delivers working end-to-end capability
- **Demo-able** — User can see/interact with what was built

**Anti-pattern example (non-demo-able phase):**
```
Phase 1: Create database schema
- Users can't see anything
- No UI, no API, just tables
- Demo = "trust me, the DB exists"
```

**Correct pattern (demo-able phase):**
```
Phase 1: User registration
- Users can visit /signup
- Users can create account
- Users can log in
- Demo = working signup flow
```

## Three Levels of Slicing

### 1. Milestone Level

**Milestone = User-valuable release**

Good milestone:
```
v1.0: MVP E-commerce
- Users can browse products
- Users can add to cart
- Users can checkout
- Admin can manage inventory
```

Bad milestone:
```
v1.0: Infrastructure
- Database setup
- API framework
- UI scaffolding
- Deploy pipeline
```

**Test:** "What can users DO after this milestone ships?" If answer is "nothing visible," milestone is too infrastructure-heavy.

### 2. Phase Level

**Phase = Single complete capability**

Good phase:
```
Phase 2: Product Catalog
- Product list page with filters
- Product detail page
- Search functionality
- Admin product CRUD
```

Bad phase:
```
Phase 2: Backend Setup
- Create Product model
- Create Category model
- Create all API routes
- Set up authentication
```

**Test:** "Can I demo this phase independently?" If no, phase crosses too many concerns or is a horizontal layer.

### 3. Plan Level

**Plan = 2-3 related tasks (~50% context)**

Good plan:
```
Plan 01: Product List UI
- Task 1: Create ProductCard component
- Task 2: Create ProductList with API integration
- Task 3: Add filters (category, price range)
```

Bad plan:
```
Plan 01: All Product Components
- Task 1: ProductCard
- Task 2: ProductList
- Task 3: ProductDetail
- Task 4: ProductForm
- Task 5: ProductFilters
```

**Test:** "Does this plan complete within 50% context?" If no, split it.

## Infrastructure Setup Decision Tree

Setup work (DB, auth, API framework) rarely deserves dedicated phases. Use this tree:

### Decision 1: Can setup inline with first feature?

**YES** → Inline it. Most common pattern.

```
Phase 1: User Authentication
- Task 1: Set up Prisma with User model
- Task 2: Create /api/auth/login endpoint
- Task 3: Create login UI
- Task 4: Wire login flow
```

Setup happens in Task 1, feature completes by Task 4. **Demo-able: working login.**

**NO** → Continue to Decision 2.

### Decision 2: Does setup enable 3+ independent features?

**YES** → Dedicated setup phase may be justified.

```
Phase 0: Foundation
- Next.js 14 with App Router
- Prisma with PostgreSQL
- TailwindCSS + shadcn/ui
- Environment config

Phase 1: User Auth (depends on Phase 0)
Phase 2: Product Catalog (depends on Phase 0)
Phase 3: Shopping Cart (depends on Phase 0)
```

**Setup is demo-able:** "Next.js app running, DB connected, UI component library working."

**NO** → Inline it. Setup that enables 1-2 features should be inline.

### Decision 3: Can we defer setup until needed?

**Always ask:** "What breaks if we don't do this setup now?"

**Example:**
- Monitoring/observability → Defer until performance issues arise
- Advanced caching → Defer until bottlenecks identified
- Multi-region deployment → Defer until traffic justifies
- Comprehensive error tracking → Start with console.log, upgrade later

**Defer unless:** Setup blocks immediate feature delivery.

## Scope Anxiety Defense

**The fear:** "This plan is too small. Let's combine plans to be efficient."

**The reality:** Context quality degrades with size. Small plans outperform large plans.

### Context Degradation Math

| Context Usage | Quality   | Behavior                  |
| ------------- | --------- | ------------------------- |
| 0-30%         | PEAK      | Thorough, comprehensive   |
| 30-50%        | GOOD      | Confident, solid work     |
| 50-70%        | DEGRADING | Efficiency mode, rushing  |
| 70%+          | POOR      | Minimal, incomplete       |

**Example scenario:**

**Option A: One large plan (80% context)**
- Tasks 1-5 execute at 80% context
- Quality degraded for ALL tasks
- Verification rushed
- Bugs introduced
- Estimated rework: 20-30%

**Option B: Three small plans (40% context each)**
- Each plan executes at peak quality (40%)
- No context pressure
- Thorough verification
- Estimated rework: 0-5%

**Result:** Three small plans complete FASTER and with FEWER bugs than one large plan, despite seeming "less efficient."

### The 3-Task Rule

**Maximum 3 tasks per plan.**

Why?
- Task 1 execution: 15-20% context
- Task 2 execution: 15-20% context
- Task 3 execution: 15-20% context
- Total: 45-60% context (optimal zone)

**4+ tasks = 70%+ context = degradation zone**

## Anti-Patterns by Name

### 1. Infrastructure-First

**Symptom:** Phases named after technical layers, not features.

```
❌ Phase 1: Database Schema
❌ Phase 2: API Layer
❌ Phase 3: Frontend Components
```

**Why bad:** Nothing works until Phase 3 completes. No intermediate demos. High integration risk.

**Fix:**

```
✓ Phase 1: User Management (full stack)
✓ Phase 2: Product Catalog (full stack)
✓ Phase 3: Order Processing (full stack)
```

Each phase is independently demo-able.

### 2. Premature Abstraction

**Symptom:** Building "flexible frameworks" before knowing requirements.

```
❌ Phase 1: Generic CRUD Generator
❌ Phase 2: Abstract Data Access Layer
❌ Phase 3: Configurable UI Component System
```

**Why bad:** Solving hypothetical future problems. Over-engineering. Wrong abstractions.

**Fix:** Build concrete features first. Extract abstractions when patterns emerge (third occurrence, not first).

```
✓ Phase 1: User CRUD (concrete implementation)
✓ Phase 2: Product CRUD (concrete implementation)
✓ Phase 3: Extract shared CRUD patterns (if needed)
```

### 3. Scope Creep

**Symptom:** Phases grow during planning to "handle edge cases."

```
Initial: Phase 2: User Login
Final: Phase 2: User Login + Password Reset + 2FA + OAuth + Session Management + Rate Limiting
```

**Why bad:** Scope explosion. Original 3 plans becomes 1 plan with 12 tasks. Context overload.

**Fix:** Core feature in Phase N, enhancements in Phase N+1.

```
✓ Phase 2: User Login (email/password only)
✓ Phase 3: Password Reset
✓ Phase 4: 2FA Support (if required for v1)
```

### 4. Non-Demo-able Phases

**Symptom:** Phase completes but nothing works yet.

```
❌ Phase 1: Set up database models
   Demo: "Trust me, the models exist"

❌ Phase 2: Create API endpoints
   Demo: "curl works, but no UI"

❌ Phase 3: Build UI
   Demo: "Now it finally works"
```

**Why bad:** Violates Phase = PR = Demo unit. Can't merge until Phase 3. High risk.

**Fix:** Each phase delivers working capability.

```
✓ Phase 1: User Signup (DB + API + UI)
   Demo: Users can create accounts

✓ Phase 2: User Login (DB + API + UI)
   Demo: Users can log in

✓ Phase 3: User Profile (DB + API + UI)
   Demo: Users can edit profiles
```

## Case Studies

### Case Study 1: E-commerce MVP

**❌ Bad (Horizontal Layers)**

```
Milestone v1.0: E-commerce MVP

Phase 1: Database Schema (4 plans)
- User, Product, Order, Payment models
- Relationships and indexes
- Migration scripts
- NOT DEMO-ABLE

Phase 2: API Endpoints (6 plans)
- User CRUD
- Product CRUD
- Order CRUD
- Payment processing
- NOT DEMO-ABLE

Phase 3: Admin UI (5 plans)
- User management screens
- Product management screens
- Order management screens
- PARTIALLY DEMO-ABLE (backend exists)

Phase 4: Customer UI (5 plans)
- Product browsing
- Shopping cart
- Checkout flow
- FULLY DEMO-ABLE (finally)

Total: 20 plans, nothing works until Phase 4
```

**✓ Good (Vertical Slices)**

```
Milestone v1.0: E-commerce MVP

Phase 1: Product Catalog (3 plans)
- Plan 01: Product model + admin CRUD API + admin UI
- Plan 02: Product list + detail pages (customer)
- Plan 03: Search and filters
- DEMO: Admin adds products, customers browse products

Phase 2: Shopping Cart (3 plans)
- Plan 01: Cart model + add/remove API
- Plan 02: Cart UI + item management
- Plan 03: Cart persistence across sessions
- DEMO: Customers add products to cart

Phase 3: User Accounts (3 plans)
- Plan 01: User model + signup/login API
- Plan 02: Auth UI + session management
- Plan 03: User profile page
- DEMO: Customers create accounts and log in

Phase 4: Checkout (4 plans)
- Plan 01: Order model + create order API
- Plan 02: Stripe integration + payment processing
- Plan 03: Checkout UI flow
- Plan 04: Order confirmation + email
- DEMO: Customers complete purchases

Total: 13 plans, each phase independently demo-able
```

**Benefits:**
- 35% fewer plans (context efficiency)
- Each phase ships working feature
- Parallel development possible (Phases 2-3)
- Lower integration risk
- Earlier user feedback

### Case Study 2: SaaS Dashboard

**❌ Bad (Infrastructure-First)**

```
Milestone v1.0: SaaS Dashboard

Phase 1: Backend Infrastructure (5 plans)
- PostgreSQL setup
- Prisma models (all entities)
- API framework (Express + middleware)
- Auth system (JWT + refresh tokens)
- NOT DEMO-ABLE

Phase 2: API Implementation (8 plans)
- User endpoints
- Organization endpoints
- Project endpoints
- Task endpoints
- Team endpoints
- Billing endpoints
- Webhook handlers
- NOT DEMO-ABLE

Phase 3: Frontend Foundation (4 plans)
- React setup + routing
- Component library integration
- Auth flow UI
- Layout components
- PARTIALLY DEMO-ABLE (can log in)

Phase 4: Dashboard Features (6 plans)
- Organization dashboard
- Project dashboard
- Task management
- Team management
- Settings pages
- FULLY DEMO-ABLE

Total: 23 plans, nothing useful until Phase 4
```

**✓ Good (Feature-Focused)**

```
Milestone v1.0: SaaS Dashboard

Phase 1: User Authentication (3 plans)
- Plan 01: User model + JWT auth API (Prisma + jose)
- Plan 02: Login/signup UI + session management
- Plan 03: Password reset flow
- DEMO: Users can sign up, log in, reset password

Phase 2: Organization Management (3 plans)
- Plan 01: Organization model + CRUD API
- Plan 02: Create/switch org UI
- Plan 03: Invite team members
- DEMO: Users create orgs, invite teammates

Phase 3: Project Dashboard (4 plans)
- Plan 01: Project model + CRUD API
- Plan 02: Project list + detail views
- Plan 03: Project creation form
- Plan 04: Project metrics visualization
- DEMO: Users create projects, view dashboards

Phase 4: Task Management (3 plans)
- Plan 01: Task model + CRUD API
- Plan 02: Task list with filters/sorting
- Plan 03: Task create/edit forms
- DEMO: Users create and manage tasks

Total: 13 plans, each phase independently valuable
```

**Benefits:**
- 43% fewer plans
- Progressive value delivery
- Phases 2-3 can develop in parallel
- User feedback after Phase 1
- Infrastructure emerges as needed

## Summary Checklist

Use when planning milestones and phases:

**Milestone Level:**
- [ ] Does milestone deliver user-visible value?
- [ ] Can we ship this milestone to users?
- [ ] Does each phase contribute to milestone goal?

**Phase Level:**
- [ ] Is this phase demo-able on its own?
- [ ] Does phase deliver complete capability (DB + API + UI)?
- [ ] Can this phase merge as a PR independently?
- [ ] Is phase named after a feature, not a layer?

**Plan Level:**
- [ ] Does plan have 2-3 tasks maximum?
- [ ] Does plan target ~50% context usage?
- [ ] Are tasks in this plan related to same feature?
- [ ] Can we verify this plan's output independently?

**Red Flags:**
- [ ] Phase named after technical layer (Models, APIs, Components)
- [ ] Phase that blocks all subsequent phases (horizontal dependency)
- [ ] Plan with 4+ tasks
- [ ] Phase that can't be demoed until later phases complete
- [ ] Setup-only phase not enabling 3+ independent features
