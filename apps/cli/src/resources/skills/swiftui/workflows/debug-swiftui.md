<required_reading>
**Read these reference files NOW before starting:**
1. `../macos-apps/references/cli-observability.md` - Log streaming, crash analysis, LLDB, memory debugging
2. `references/testing-debugging.md` - SwiftUI-specific debugging techniques
3. `references/state-management.md` - State management issues are #1 bug source
</required_reading>

<process>
## Step 1: Reproduce the Bug Consistently

**Isolate the issue:**
- Create minimal reproducible example
- Remove unrelated views and logic
- Test in both preview and simulator/device

**Document:**
- What action triggers it?
- Every time or intermittent?
- Which platforms/OS versions?

## Step 2: Identify Bug Category

**State Management (60% of bugs):**
- View not updating
- Infinite update loops
- @State/@Binding incorrect usage
- Missing @Observable

**Layout Issues:**
- Views not appearing
- Wrong positioning
- ScrollView/List sizing problems

**Navigation Issues:**
- Stack corruption
- Sheets not dismissing
- Deep linking breaking

**Performance Issues:**
- UI freezing
- Excessive redraws
- Memory leaks

## Step 3: Add Observability

**Add _printChanges() to suspect view:**
```swift
var body: some View {
    let _ = Self._printChanges()
    // rest of view
}
```
This prints exactly which property caused the view to redraw.

**Add logging for runtime visibility:**
```swift
import os
private let logger = Logger(subsystem: Bundle.main.bundleIdentifier!, category: "Debug")

// In your code:
logger.debug("State changed: \(self.items.count) items")
```

**Stream logs from CLI:**
```bash
# While app is running
log stream --predicate 'subsystem == "com.yourcompany.appname"' --level debug

# Search historical logs
log show --predicate 'subsystem == "com.yourcompany.appname"' --last 1h
```

## Step 4: Check Common Causes

**State red flags:**
- Mutating @State from outside owning view
- Using @StateObject when should use @Observable
- Missing @Bindable for passing bindings

**View identity issues:**
- Array index as id when order changes
- Missing .id() when identity should reset
- Same id for different content

**Environment problems:**
- Custom @Environment not provided
- Using deprecated @EnvironmentObject

## Step 5: Apply Fix

**State fix:**
```swift
// Wrong: ObservableObject
class ViewModel: ObservableObject {
    @Published var count = 0
}

// Right: @Observable
@Observable
class ViewModel {
    var count = 0
}
```

**View identity fix:**
```swift
// Wrong: index as id
ForEach(items.indices, id: \.self) { index in }

// Right: stable id
ForEach(items) { item in }
```

**Navigation fix:**
```swift
// Wrong: NavigationView
NavigationView { }

// Right: NavigationStack
NavigationStack { }
```

## Step 6: Verify Fix from CLI

```bash
# 1. Rebuild
xcodebuild -scheme AppName build 2>&1 | xcsift

# 2. Run tests
xcodebuild -scheme AppName test 2>&1 | xcsift

# 3. Launch and monitor
open ./build/Build/Products/Debug/AppName.app
log stream --predicate 'subsystem == "com.yourcompany.appname"' --level debug

# 4. Check for memory leaks
leaks AppName

# 5. If crash occurred, check crash logs
ls ~/Library/Logs/DiagnosticReports/ | grep AppName
cat ~/Library/Logs/DiagnosticReports/AppName_*.ips | head -100
```

**For deep debugging, attach LLDB:**
```bash
lldb -n AppName
(lldb) breakpoint set --file ContentView.swift --line 42
(lldb) continue
```

Report to user:
- "Bug no longer reproduces after [specific fix]"
- "Tests pass: X pass, 0 fail"
- "No memory leaks detected"
- "Ready for you to verify the fix"
</process>

<anti_patterns>
## Avoid These Mistakes

**Random changes:**
- Trying property wrappers without understanding
- Adding .id(UUID()) hoping it fixes things
- Wrapping in DispatchQueue.main.async as band-aid

**Ignoring root cause:**
- Hiding warnings instead of fixing
- Working around instead of fixing architecture

**Skipping _printChanges():**
- For state bugs, this is the fastest diagnostic
- Running this FIRST saves hours

**Using deprecated APIs:**
- Fix bugs in ObservableObject? Migrate to @Observable
- NavigationView bugs? Switch to NavigationStack

**Mutating state in body:**
- Never change @State during body computation
- Move to .task, .onChange, or button actions
</anti_patterns>

<success_criteria>
This workflow is complete when:
- [ ] Bug is reproducible (or documented as intermittent)
- [ ] Root cause identified using _printChanges() or other tool
- [ ] Fix applied following SwiftUI best practices
- [ ] Bug no longer occurs
- [ ] No new bugs introduced
- [ ] Tested on all target platforms
- [ ] Console shows no related warnings
</success_criteria>
