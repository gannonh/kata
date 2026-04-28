---
name: swiftui
description: SwiftUI apps from scratch through App Store. Full lifecycle - create, debug, test, optimize, ship.
---

<essential_principles>
## How We Work

**The user is the product owner. Claude is the developer.**

The user does not write code. The user does not read code. The user describes what they want and judges whether the result is acceptable. Claude implements, verifies, and reports outcomes.

### 1. Prove, Don't Promise

Never say "this should work." Prove it:
```bash
xcodebuild build 2>&1 | xcsift  # Build passes
xcodebuild test                  # Tests pass
open .../App.app                 # App launches
```
If you didn't run it, you don't know it works.

### 2. Tests for Correctness, Eyes for Quality

| Question | How to Answer |
|----------|---------------|
| Does the logic work? | Write test, see it pass |
| Does it look right? | Launch app, user looks at it |
| Does it feel right? | User uses it |
| Does it crash? | Test + launch |
| Is it fast enough? | Profiler |

Tests verify *correctness*. The user verifies *desirability*.

### 3. Report Outcomes, Not Code

**Bad:** "I refactored the view model to use @Observable with environment injection"
**Good:** "Fixed the state bug. App now updates correctly when you add items. Ready for you to verify."

The user doesn't care what you changed. The user cares what's different.

### 4. Small Steps, Always Verified

```
Change → Verify → Report → Next change
```

Never batch up work. Never say "I made several changes." Each change is verified before the next. If something breaks, you know exactly what caused it.

### 5. Ask Before, Not After

Unclear requirement? Ask now.
Multiple valid approaches? Ask which.
Scope creep? Ask if wanted.
Big refactor needed? Ask permission.

Wrong: Build for 30 minutes, then "is this what you wanted?"
Right: "Before I start, does X mean Y or Z?"

### 6. Always Leave It Working

Every stopping point = working state. Tests pass, app launches, changes committed. The user can walk away anytime and come back to something that works.
</essential_principles>

<swiftui_principles>
## SwiftUI Framework Principles

### Declarative Mindset
Describe what the UI should look like for a given state, not how to mutate it. Let SwiftUI manage the rendering. Never force updates - change the state and let the framework react.

### Single Source of Truth
Every piece of data has one authoritative location. Use the right property wrapper: @State for view-local, @Observable for shared objects, @Environment for app-wide. Derived data should be computed, not stored.

### Composition Over Inheritance
Build complex UIs by composing small, focused views. Extract reusable components when patterns emerge. Prefer many small views over few large ones.

### Platform-Adaptive Design
Write once but respect platform idioms. Use native navigation patterns, respect safe areas, adapt to screen sizes. Test on all target platforms.
</swiftui_principles>

<intake>
**What would you like to do?**

1. Build a new SwiftUI app
2. Debug an existing SwiftUI app
3. Add a feature to an existing app
4. Write/run tests
5. Optimize performance
6. Ship/release to App Store
7. Something else

**Then read the matching workflow from `workflows/` and follow it.**
</intake>

<routing>
| Response | Workflow |
|----------|----------|
| 1, "new", "create", "build", "start" | `workflows/build-new-app.md` |
| 2, "broken", "fix", "debug", "crash", "bug" | `workflows/debug-swiftui.md` |
| 3, "add", "feature", "implement", "change" | `workflows/add-feature.md` |
| 4, "test", "tests", "TDD", "coverage" | `workflows/write-tests.md` |
| 5, "slow", "optimize", "performance", "fast" | `workflows/optimize-performance.md` |
| 6, "ship", "release", "deploy", "publish", "app store" | `workflows/ship-app.md` |
| 7, other | Clarify, then select workflow or references |
</routing>

<verification_loop>
## After Every Change

```bash
# 1. Does it build?
xcodebuild -scheme AppName build 2>&1 | xcsift

# 2. Do tests pass? (use Core scheme for SwiftUI apps to avoid @main hang)
xcodebuild -scheme AppNameCore test

# 3. Does it launch?
# macOS:
open ./build/Build/Products/Debug/AppName.app

# iOS Simulator:
xcrun simctl boot "iPhone 15 Pro" 2>/dev/null || true
xcrun simctl install booted ./build/Build/Products/Debug-iphonesimulator/AppName.app
xcrun simctl launch booted com.yourcompany.appname
```

Note: If tests hang, the test target likely depends on the app target which has `@main`. Extract testable code to a framework target. See `../macos-apps/references/testing-tdd.md` for the pattern.

Report to the user:
- "Build: ✓"
- "Tests: 12 pass, 0 fail"
- "App launches, ready for you to check [specific thing]"
</verification_loop>

<cli_infrastructure>
## CLI Workflow References

For building, debugging, testing, and shipping from CLI without opening Xcode, read these from `../macos-apps/references/`:

| Reference | Use For |
|-----------|---------|
| `cli-workflow.md` | Build, run, test commands; xcodebuild usage; code signing |
| `cli-observability.md` | Log streaming, crash analysis, memory debugging, LLDB |
| `project-scaffolding.md` | XcodeGen project.yml templates, file structure, entitlements |
| `testing-tdd.md` | Test patterns that work from CLI, avoiding @main hangs |

These docs are platform-agnostic. For iOS, change destinations:
```bash
# iOS Simulator
xcodebuild -scheme AppName -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build

# macOS
xcodebuild -scheme AppName build
```
</cli_infrastructure>

<reference_index>
## Domain Knowledge

All in `references/`:

**Core:**
- architecture.md - MVVM patterns, project structure, dependency injection
- state-management.md - Property wrappers, @Observable, data flow
- layout-system.md - Stacks, grids, GeometryReader, custom layouts

**Navigation & Animation:**
- navigation.md - NavigationStack, sheets, tabs, deep linking
- animations.md - Built-in animations, transitions, matchedGeometryEffect

**Data & Platform:**
- swiftdata.md - Persistence, @Model, @Query, CloudKit sync
- platform-integration.md - iOS/macOS/watchOS/visionOS specifics
- uikit-appkit-interop.md - UIViewRepresentable, hosting controllers

**Support:**
- networking-async.md - async/await, .task modifier, API clients
- testing-debugging.md - Previews, unit tests, UI tests, debugging
- performance.md - Profiling, lazy loading, view identity
</reference_index>

<workflows_index>
## Workflows

All in `workflows/`:

| Workflow | Purpose |
|----------|---------|
| build-new-app.md | Create new SwiftUI app from scratch |
| debug-swiftui.md | Find and fix SwiftUI bugs |
| add-feature.md | Add functionality to existing app |
| write-tests.md | Write UI and unit tests |
| optimize-performance.md | Profile and improve performance |
| ship-app.md | App Store submission, TestFlight, distribution |
</workflows_index>

<canonical_terminology>
## Terminology

Use these terms consistently:
- **view** (not: widget, component, element)
- **@Observable** (not: ObservableObject, @Published for new iOS 17+ code)
- **NavigationStack** (not: NavigationView - deprecated)
- **SwiftData** (not: Core Data for new projects)
- **@Environment** (not: @EnvironmentObject for new code)
- **modifier** (not: method/function when describing view modifiers)
- **body** (not: render/build when describing view body)
</canonical_terminology>
