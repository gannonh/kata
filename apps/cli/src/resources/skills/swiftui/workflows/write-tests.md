<required_reading>
**Read these reference files NOW before starting:**
1. `../macos-apps/references/cli-workflow.md` - Test commands from CLI
2. `../macos-apps/references/testing-tdd.md` - TDD patterns, avoiding @main hangs
3. `references/testing-debugging.md` - SwiftUI-specific testing and debugging
</required_reading>

<process>
## Step 1: Identify Testing Scope

**Test business logic in view models, not views:**
```swift
// Testable view model
@Observable
final class LoginViewModel {
    var email = ""
    var password = ""
    var isLoading = false

    var isValidInput: Bool {
        !email.isEmpty && password.count >= 8
    }
}

// View is just presentation
struct LoginView: View {
    let viewModel: LoginViewModel
    var body: some View {
        Form {
            TextField("Email", text: $viewModel.email)
            Button("Login") { }
                .disabled(!viewModel.isValidInput)
        }
    }
}
```

## Step 2: Write Unit Tests

**Using Swift Testing (@Test):**
```swift
import Testing
@testable import MyApp

@Test("Email validation")
func emailValidation() {
    let viewModel = LoginViewModel()

    viewModel.email = ""
    viewModel.password = "password123"
    #expect(!viewModel.isValidInput)

    viewModel.email = "user@example.com"
    #expect(viewModel.isValidInput)
}

@Test("Async loading")
func asyncLoading() async {
    let mockService = MockService()
    let viewModel = TaskViewModel(service: mockService)

    await viewModel.load()

    #expect(!viewModel.tasks.isEmpty)
}
```

## Step 3: Add Accessibility Identifiers

```swift
TextField("Email", text: $email)
    .accessibilityIdentifier("emailField")

SecureField("Password", text: $password)
    .accessibilityIdentifier("passwordField")

Button("Login") { }
    .accessibilityIdentifier("loginButton")
```

## Step 4: Write UI Tests

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
        let passwordField = app.secureTextFields["passwordField"]
        let loginButton = app.buttons["loginButton"]

        XCTAssertTrue(emailField.waitForExistence(timeout: 5))

        emailField.tap()
        emailField.typeText("user@example.com")

        passwordField.tap()
        passwordField.typeText("password123")

        XCTAssertTrue(loginButton.isEnabled)
        loginButton.tap()

        let welcomeText = app.staticTexts["welcomeMessage"]
        XCTAssertTrue(welcomeText.waitForExistence(timeout: 5))
    }
}
```

## Step 5: Create Previews for Visual Testing

```swift
#Preview("Empty") { LoginView(viewModel: LoginViewModel()) }

#Preview("Filled") {
    let viewModel = LoginViewModel()
    viewModel.email = "user@example.com"
    viewModel.password = "password123"
    return LoginView(viewModel: viewModel)
}

#Preview("Error") {
    let viewModel = LoginViewModel()
    viewModel.errorMessage = "Invalid credentials"
    return LoginView(viewModel: viewModel)
}

#Preview("Dark Mode") {
    LoginView(viewModel: LoginViewModel())
        .preferredColorScheme(.dark)
}
```

## Step 6: Run Tests from CLI

```bash
# Run all tests with parsed output
xcodebuild test -scheme AppName -destination 'platform=iOS Simulator,name=iPhone 15 Pro' 2>&1 | xcsift

# Run only unit tests
xcodebuild test -scheme AppName -only-testing:AppNameTests 2>&1 | xcsift

# Run only UI tests
xcodebuild test -scheme AppName -only-testing:AppNameUITests 2>&1 | xcsift

# Run specific test class
xcodebuild test -scheme AppName -only-testing:AppNameTests/LoginViewModelTests 2>&1 | xcsift

# Run specific test method
xcodebuild test -scheme AppName -only-testing:AppNameTests/LoginViewModelTests/testEmailValidation 2>&1 | xcsift

# Generate test coverage
xcodebuild test -scheme AppName -enableCodeCoverage YES -resultBundlePath TestResults.xcresult 2>&1 | xcsift
xcrun xccov view --report TestResults.xcresult
```

**If tests hang:** The test target likely depends on the app target with `@main`. Extract testable code to a Core framework target. See `../macos-apps/references/testing-tdd.md`.

Report to user:
- "Tests: X pass, Y fail"
- "Coverage: Z% of lines"
- If failures: "Failed tests: [list]. Investigating..."
</process>

<anti_patterns>
## Avoid These Mistakes

**Testing view bodies:**
```swift
// Wrong: can't test views directly
func testView() {
    let view = LoginView()
    // Can't inspect SwiftUI view
}

// Right: test view model
@Test func emailInput() {
    let viewModel = LoginViewModel()
    viewModel.email = "test@example.com"
    #expect(viewModel.email == "test@example.com")
}
```

**Missing accessibility identifiers:**
```swift
// Wrong: using text
let button = app.buttons["Login"]

// Right: stable identifier
let button = app.buttons["loginButton"]
```

**No dependency injection:**
```swift
// Wrong: can't mock
@Observable
class ViewModel {
    private let service = RealService()
}

// Right: injectable
@Observable
class ViewModel {
    private let service: ServiceProtocol
    init(service: ServiceProtocol) {
        self.service = service
    }
}
```

**No edge case testing:**
```swift
// Test empty, invalid, error states
@Test func emptyEmail() { }
@Test func shortPassword() { }
@Test func networkError() { }
```
</anti_patterns>

<success_criteria>
This workflow is complete when:
- [ ] Unit tests verify view model business logic
- [ ] UI tests verify user flows using accessibility identifiers
- [ ] All tests pass: `xcodebuild test -scheme YourApp`
- [ ] Edge cases and error states have coverage
- [ ] Dependencies use protocols for testability
- [ ] Previews exist for major UI states
</success_criteria>
