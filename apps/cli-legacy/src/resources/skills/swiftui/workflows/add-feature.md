<required_reading>
**Read these reference files NOW before starting:**
1. `../macos-apps/references/cli-workflow.md` - Build, run, test from CLI
2. `references/architecture.md` - App structure, MVVM patterns
3. `references/state-management.md` - Property wrappers, @Observable
</required_reading>

<process>
## Step 1: Understand Existing Codebase

```bash
find . -name "*.swift" -type f | head -20
```

**Identify:**
- App architecture (MVVM, TCA, etc.)
- Existing patterns and conventions
- Navigation approach
- Dependency injection method

## Step 2: Plan Feature Integration

**Define scope:**
- What views needed?
- What state must be managed?
- Does it need persistence (SwiftData)?
- Does it need network calls?
- How does it connect to existing features?

## Step 3: Create Feature Module

Follow existing organization:
```
Features/
  YourFeature/
    Views/
      YourFeatureView.swift
    ViewModels/
      YourFeatureViewModel.swift
    Models/
      YourFeatureModel.swift
```

## Step 4: Implement View Model

```swift
@Observable
final class YourFeatureViewModel {
    var items: [YourModel] = []
    var isLoading = false
    var errorMessage: String?

    private let dataService: DataService

    init(dataService: DataService) {
        self.dataService = dataService
    }

    func loadData() async {
        isLoading = true
        defer { isLoading = false }

        do {
            items = try await dataService.fetchItems()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```

## Step 5: Implement Views

```swift
struct YourFeatureView: View {
    @State private var viewModel: YourFeatureViewModel

    init(viewModel: YourFeatureViewModel) {
        self.viewModel = viewModel
    }

    var body: some View {
        List(viewModel.items) { item in
            NavigationLink(value: item) {
                YourItemRow(item: item)
            }
        }
        .navigationTitle("Feature Title")
        .navigationDestination(for: YourModel.self) { item in
            YourFeatureDetailView(item: item)
        }
        .task {
            await viewModel.loadData()
        }
    }
}
```

## Step 6: Wire Up Navigation

**NavigationStack routing:**
```swift
NavigationLink(value: NavigationDestination.yourFeature) {
    Text("Go to Feature")
}

.navigationDestination(for: NavigationDestination.self) { destination in
    switch destination {
    case .yourFeature:
        YourFeatureView(viewModel: viewModel)
    }
}
```

**Sheet presentation:**
```swift
@State private var showingFeature = false

Button("Show") { showingFeature = true }
.sheet(isPresented: $showingFeature) {
    NavigationStack { YourFeatureView(viewModel: viewModel) }
}
```

## Step 7: Build and Verify

```bash
# 1. Build
xcodebuild -scheme AppName build 2>&1 | xcsift

# 2. Run tests
xcodebuild -scheme AppName test 2>&1 | xcsift

# 3. Launch and monitor
# macOS:
open ./build/Build/Products/Debug/AppName.app
log stream --predicate 'subsystem == "com.yourcompany.appname"' --level debug

# iOS Simulator:
xcrun simctl boot "iPhone 15 Pro" 2>/dev/null || true
xcrun simctl install booted ./build/Build/Products/Debug-iphonesimulator/AppName.app
xcrun simctl launch booted com.yourcompany.appname
```

Report to user:
- "Build: ✓"
- "Tests: X pass, 0 fail"
- "Feature added. Ready for you to test [navigation path to feature]"

**User verifies:**
- Navigate to feature from all entry points
- Test interactions
- Check loading/error states
- Verify light and dark mode
</process>

<anti_patterns>
## Avoid These Mistakes

**Not following existing patterns:**
- Creating new navigation when project has established pattern
- Using different naming conventions
- Introducing new DI when project has standard

**Overengineering:**
- Adding abstraction that doesn't exist elsewhere
- Creating generic solutions for specific problems
- Breaking single view into dozens of tiny files prematurely

**Tight coupling:**
- Accessing other features' view models directly
- Hardcoding dependencies
- Circular dependencies between features

**Breaking existing functionality:**
- Modifying shared view models without checking all callers
- Changing navigation state structure
- Removing @Environment values other views depend on
</anti_patterns>

<success_criteria>
This workflow is complete when:
- [ ] Feature matches existing architecture patterns
- [ ] Views compose with existing navigation
- [ ] State management follows project conventions
- [ ] Dependency injection consistent with existing code
- [ ] All existing tests pass
- [ ] No compiler warnings introduced
- [ ] Error states handled gracefully
- [ ] Code follows existing naming conventions
</success_criteria>
