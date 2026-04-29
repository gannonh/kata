<overview>
Testing and debugging SwiftUI apps requires a multi-layered approach combining previews, unit tests, UI tests, and debugging tools. SwiftUI's declarative nature makes traditional debugging challenging, but modern tools provide robust solutions.

**Key principles:**
- Use #Preview macros for rapid visual iteration
- Test business logic with @Observable view models (not views directly)
- Write focused UI tests using accessibility identifiers
- Profile with Instruments on real devices

SwiftUI views cannot be unit tested directly. Test view models and use UI automation tests for interaction testing.
</overview>

<previews>
## Xcode Previews

**Basic #Preview:**
```swift
#Preview {
    ContentView()
}

#Preview("Dark Mode") {
    ContentView()
        .preferredColorScheme(.dark)
}
```

**Multiple states:**
```swift
#Preview("Empty") { TaskListView(tasks: []) }
#Preview("Loaded") { TaskListView(tasks: Task.sampleData) }
#Preview("Error") { TaskListView(tasks: [], error: "Network unavailable") }
```

**With @Binding (Xcode 16+):**
```swift
#Preview {
    @Previewable @State var isOn = true
    ToggleView(isOn: $isOn)
}
```

**Mock data:**
```swift
extension Task {
    static let sampleData: [Task] = [
        Task(title: "Review PR", isCompleted: false),
        Task(title: "Write tests", isCompleted: true)
    ]
}
```
</previews>

<unit_testing>
## Unit Testing View Models

**Testing @Observable with Swift Testing:**
```swift
import Testing
@testable import MyApp

@Test("Login validation")
func loginValidation() {
    let viewModel = LoginViewModel()
    viewModel.email = ""
    viewModel.password = "password123"
    #expect(!viewModel.isValidInput)

    viewModel.email = "user@example.com"
    #expect(viewModel.isValidInput)
}

@Test("Async data loading")
func dataLoading() async {
    let mockService = MockService()
    let viewModel = TaskViewModel(service: mockService)

    await viewModel.load()

    #expect(!viewModel.tasks.isEmpty)
}
```

**Dependency injection for testing:**
```swift
@Observable
final class TaskViewModel {
    private let service: TaskServiceProtocol

    init(service: TaskServiceProtocol = TaskService()) {
        self.service = service
    }
}
```
</unit_testing>

<ui_testing>
## UI Testing

**Setting accessibility identifiers:**
```swift
TextField("Email", text: $email)
    .accessibilityIdentifier("emailField")

Button("Login") { }
    .accessibilityIdentifier("loginButton")
```

**Writing UI tests:**
```swift
import XCTest

final class LoginUITests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    func testLoginFlow() {
        let emailField = app.textFields["emailField"]
        let loginButton = app.buttons["loginButton"]

        XCTAssertTrue(emailField.waitForExistence(timeout: 5))
        emailField.tap()
        emailField.typeText("user@example.com")

        loginButton.tap()

        let welcomeText = app.staticTexts["welcomeMessage"]
        XCTAssertTrue(welcomeText.waitForExistence(timeout: 5))
    }
}
```
</ui_testing>

<debugging>
## Debugging Techniques

**_printChanges():**
```swift
var body: some View {
    let _ = Self._printChanges()
    VStack { /* content */ }
}
```

**View hierarchy debugger:**
Debug menu → View Debugging → Capture View Hierarchy

**Lifecycle debugging:**
```swift
.onAppear { print("View appeared") }
.onDisappear { print("View disappeared") }
.task { print("Task started") }
```

**Visual debugging:**
```swift
.border(.red)
.background(.yellow.opacity(0.3))
```
</debugging>

<instruments>
## Instruments Profiling

**SwiftUI template (Xcode 16+):**
- View Body: Track view creation count
- View Properties: Monitor property changes
- Core Animation Commits: Animation performance

**Time Profiler:**
1. Product → Profile (Cmd+I)
2. Select Time Profiler
3. Record while using app
4. Sort by "Self" time to find hotspots

**Allocations:**
- Track memory usage
- Filter by "Persistent" to find leaks

**Always profile on real devices, not simulators.**
</instruments>

<common_bugs>
## Common SwiftUI Bugs

**View not updating:**
```swift
// Problem: missing @State
var count = 0  // Won't trigger updates

// Fix: use @State
@State private var count = 0
```

**ForEach crash on empty binding:**
```swift
// Problem: binding crashes on empty
ForEach($items) { $item in }

// Fix: check for empty
if !items.isEmpty {
    ForEach($items) { $item in }
}
```

**Animation not working:**
```swift
// Problem: no value parameter
.animation(.spring())

// Fix: specify value
.animation(.spring(), value: isExpanded)
```
</common_bugs>

<decision_tree>
## Testing Strategy

**Preview:** Visual iteration, different states
**Unit Test:** @Observable view models, business logic
**UI Test:** Critical user flows, login, checkout
**Manual Test:** Animations, accessibility, performance
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Testing view bodies">
**Problem:** Trying to unit test SwiftUI views directly
**Instead:** Extract logic to view models, test those
</anti_pattern>

<anti_pattern name="Missing accessibility identifiers">
**Problem:** Using text to find elements in UI tests
**Instead:** Use .accessibilityIdentifier("stableId")
</anti_pattern>

<anti_pattern name="No dependency injection">
**Problem:** Hardcoded dependencies in view models
**Instead:** Use protocols, inject mocks in tests
</anti_pattern>
</anti_patterns>
