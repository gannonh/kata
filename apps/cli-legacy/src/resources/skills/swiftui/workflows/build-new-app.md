<required_reading>
**Read these reference files NOW before starting:**
1. `../macos-apps/references/project-scaffolding.md` - XcodeGen templates and file structure
2. `../macos-apps/references/cli-workflow.md` - Build/run/test from CLI
3. `references/architecture.md` - MVVM patterns and project structure
4. `references/state-management.md` - Property wrappers
</required_reading>

<process>
## Step 1: Clarify Requirements

Ask the user:
- What does the app do? (core functionality)
- Which platform? (iOS, macOS, or both)
- Any specific features needed? (persistence, networking, system integration)

## Step 2: Scaffold Project with XcodeGen

```bash
# Create directory structure
mkdir -p AppName/Sources AppName/Tests AppName/Resources
cd AppName

# Create project.yml (see ../macos-apps/references/project-scaffolding.md for full template)
cat > project.yml << 'EOF'
name: AppName
options:
  bundleIdPrefix: com.yourcompany
  deploymentTarget:
    iOS: "17.0"
    macOS: "14.0"
  xcodeVersion: "15.0"
  createIntermediateGroups: true

targets:
  AppName:
    type: application
    platform: iOS  # or macOS, or [iOS, macOS] for multi-platform
    sources: [Sources]
    resources: [Resources]
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.yourcompany.appname
        DEVELOPMENT_TEAM: YOURTEAMID
        SWIFT_VERSION: "5.9"

  AppNameTests:
    type: bundle.unit-test
    platform: iOS
    sources: [Tests]
    dependencies:
      - target: AppName

schemes:
  AppName:
    build:
      targets:
        AppName: all
        AppNameTests: [test]
    test:
      targets: [AppNameTests]
EOF

# Generate xcodeproj
xcodegen generate

# Verify
xcodebuild -list -project AppName.xcodeproj
```

## Step 3: Create Source Files

```
Sources/
├── AppNameApp.swift      # App entry point
├── ContentView.swift     # Main view
├── Models/
├── ViewModels/
├── Views/
│   ├── Screens/
│   └── Components/
├── Services/
└── Info.plist
```

## Step 4: Configure App Entry Point

```swift
import SwiftUI

@main
struct YourAppNameApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

## Step 5: Create Base Navigation

**Tab-based app:**
```swift
struct MainTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
```

**Stack-based navigation:**
```swift
struct RootView: View {
    var body: some View {
        NavigationStack {
            HomeView()
        }
    }
}
```

## Step 6: Implement First View Model

```swift
import Foundation
import Observation

@Observable
final class HomeViewModel {
    var items: [Item] = []
    var isLoading = false
    var errorMessage: String?

    func loadData() async {
        isLoading = true
        defer { isLoading = false }

        do {
            // items = try await service.fetchItems()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```

## Step 7: Create Main View

```swift
struct HomeView: View {
    @State private var viewModel = HomeViewModel()

    var body: some View {
        List(viewModel.items) { item in
            Text(item.name)
        }
        .navigationTitle("Home")
        .overlay {
            if viewModel.isLoading { ProgressView() }
        }
        .task {
            await viewModel.loadData()
        }
    }
}

#Preview {
    NavigationStack { HomeView() }
}
```

## Step 8: Wire Up Dependencies

```swift
@Observable
final class AppDependencies {
    let apiService: APIService

    static let shared = AppDependencies()

    private init() {
        self.apiService = APIService()
    }
}
```

Inject in App:
```swift
@main
struct YourAppNameApp: App {
    @State private var dependencies = AppDependencies.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(dependencies)
        }
    }
}
```

## Step 9: Build and Verify

```bash
# Build with error parsing
xcodebuild -scheme AppName -destination 'platform=iOS Simulator,name=iPhone 15 Pro' build 2>&1 | xcsift

# Boot simulator and install
xcrun simctl boot "iPhone 15 Pro" 2>/dev/null || true
xcrun simctl install booted ./build/Build/Products/Debug-iphonesimulator/AppName.app

# Launch and stream logs
xcrun simctl launch booted com.yourcompany.appname
log stream --predicate 'subsystem == "com.yourcompany.appname"' --level debug
```

For macOS apps:
```bash
xcodebuild -scheme AppName build 2>&1 | xcsift
open ./build/Build/Products/Debug/AppName.app
```

Report to user:
- "Build: ✓"
- "App installed on simulator, launching now"
- "Ready for you to check [specific functionality]"
</process>

<anti_patterns>
## Avoid These Mistakes

**Using NavigationView:**
```swift
// DON'T
NavigationView { ContentView() }

// DO
NavigationStack { ContentView() }
```

**Using ObservableObject for new code:**
```swift
// DON'T
class ViewModel: ObservableObject {
    @Published var data = []
}

// DO
@Observable
final class ViewModel {
    var data = []
}
```

**Massive views:**
```swift
// DON'T
struct HomeView: View {
    var body: some View {
        VStack { /* 300 lines */ }
    }
}

// DO
struct HomeView: View {
    var body: some View {
        VStack {
            HeaderComponent()
            ContentList()
            FooterActions()
        }
    }
}
```

**Missing previews:**
```swift
// Always add previews for iteration
#Preview { HomeView() }
```

**Business logic in views:**
```swift
// Move to view model
struct ProductView: View {
    @State private var viewModel = ProductViewModel()

    var body: some View {
        Button("Buy") { Task { await viewModel.purchase() } }
    }
}
```
</anti_patterns>

<success_criteria>
This workflow is complete when:
- [ ] Project builds without errors
- [ ] Folder structure matches MVVM pattern
- [ ] Navigation set up with NavigationStack or TabView
- [ ] At least one @Observable view model exists
- [ ] Dependencies injected via @Environment
- [ ] No deprecated APIs (NavigationView, ObservableObject)
- [ ] SwiftUI previews render correctly
- [ ] App launches without warnings
</success_criteria>
