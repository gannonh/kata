<required_reading>
**Read these reference files NOW before starting:**
1. `../macos-apps/references/cli-observability.md` - xctrace profiling, leak detection, memory debugging
2. `references/performance.md` - Profiling, lazy loading, view identity, optimization
3. `references/layout-system.md` - Layout containers and GeometryReader pitfalls
</required_reading>

<process>
## Step 1: Establish Performance Baseline

```bash
# Build release for accurate profiling
xcodebuild -scheme AppName -configuration Release build 2>&1 | xcsift

# List available profiling templates
xcrun xctrace list templates

# Time Profiler - CPU usage baseline
xcrun xctrace record \
  --template 'Time Profiler' \
  --time-limit 30s \
  --output baseline-cpu.trace \
  --launch -- ./build/Build/Products/Release/AppName.app/Contents/MacOS/AppName

# SwiftUI template (if available)
xcrun xctrace record \
  --template 'SwiftUI' \
  --time-limit 30s \
  --output baseline-swiftui.trace \
  --launch -- ./build/Build/Products/Release/AppName.app/Contents/MacOS/AppName

# Export trace data
xcrun xctrace export --input baseline-cpu.trace --toc
```

Document baseline: CPU usage, view update count, frame rate during slow flows.

## Step 2: Profile View Updates

Add to suspect views:
```swift
var body: some View {
    let _ = Self._printChanges()
    // rest of view
}
```

Check console for which properties caused invalidation.

## Step 3: Fix Unnecessary View Recreation

**Stable view identity:**
```swift
// Wrong: index as id
ForEach(items.indices, id: \.self) { }

// Right: stable id
ForEach(items) { item in
    ItemRow(item: item).id(item.id)
}
```

**Isolate frequently-changing state:**
```swift
// Before: entire list recreates
struct SlowList: View {
    @State private var items: [Item] = []
    @State private var count: Int = 0  // Updates often

    var body: some View {
        List(items) { item in ItemRow(item: item) }
    }
}

// After: isolate count to separate view
struct FastList: View {
    @State private var items: [Item] = []

    var body: some View {
        VStack {
            CountBadge()  // Only this updates
            List(items) { item in ItemRow(item: item) }
        }
    }
}
```

## Step 4: Optimize Lists

```swift
// Use lazy containers
ScrollView {
    LazyVStack(spacing: 8) {
        ForEach(items) { item in
            ItemRow(item: item)
        }
    }
}
```

## Step 5: Reduce Layout Passes

```swift
// Avoid GeometryReader when possible
// Before:
GeometryReader { geo in
    Circle().frame(width: geo.size.width * 0.8)
}

// After:
Circle()
    .frame(maxWidth: .infinity)
    .aspectRatio(1, contentMode: .fit)
    .padding(.horizontal, 20)
```

## Step 6: Use @Observable

```swift
// Before: ObservableObject invalidates everything
class OldViewModel: ObservableObject {
    @Published var name = ""
    @Published var count = 0
}

// After: granular updates
@Observable
class ViewModel {
    var name = ""
    var count = 0
}
```

## Step 7: Verify Improvements from CLI

```bash
# 1. Rebuild release
xcodebuild -scheme AppName -configuration Release build 2>&1 | xcsift

# 2. Profile again with same settings
xcrun xctrace record \
  --template 'Time Profiler' \
  --time-limit 30s \
  --output optimized-cpu.trace \
  --launch -- ./build/Build/Products/Release/AppName.app/Contents/MacOS/AppName

# 3. Check for memory leaks
leaks AppName

# 4. Run tests to ensure no regressions
xcodebuild test -scheme AppName 2>&1 | xcsift

# 5. Launch for user verification
open ./build/Build/Products/Release/AppName.app
```

Report to user:
- "CPU usage reduced from X% to Y%"
- "View body invocations reduced by Z%"
- "No memory leaks detected"
- "Tests: all pass, no regressions"
- "App launched - please verify scrolling feels smooth"
</process>

<anti_patterns>
## Avoid These Mistakes

**Optimizing without profiling:**
- Always measure with Instruments first
- Let data guide decisions

**Using .equatable() as first resort:**
- Masks the issue instead of fixing it
- Can cause stale UI

**Testing only in simulator:**
- Simulator runs on Mac CPU
- Always profile on real devices

**Ignoring view identity:**
- Use explicit id() when needed
- Ensure stable IDs in ForEach

**Premature view extraction:**
- Extract when it isolates state observation
- Not "for performance" by default
</anti_patterns>

<success_criteria>
This workflow is complete when:
- [ ] Time Profiler shows reduced CPU usage
- [ ] 50%+ reduction in unnecessary view body invocations
- [ ] Scroll performance at 60fps
- [ ] App feels responsive on oldest supported device
- [ ] Memory usage stable, no leaks
- [ ] _printChanges() confirms targeted updates
</success_criteria>
