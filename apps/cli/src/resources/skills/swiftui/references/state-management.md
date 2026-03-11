<overview>
SwiftUI state management is fundamentally different from imperative UI frameworks. You describe what the UI should look like for any given state, and SwiftUI handles the updates when state changes.

**Read this file when:** Building views that need to respond to data changes, sharing data between views, choosing property wrappers, debugging state issues, or migrating from ObservableObject patterns.

**Key insight:** SwiftUI uses a declarative, unidirectional data flow. State flows down through the view hierarchy via properties. Changes flow up through bindings or actions. You describe state, not mutations.

**Modern SwiftUI (iOS 17+)** uses the @Observable macro for reference types, eliminating most needs for ObservableObject, @Published, @StateObject, @ObservedObject, and @EnvironmentObject. The mental model is simpler: value types use @State/@Binding, reference types use @Observable with @State/@Bindable.
</overview>

<property_wrappers>
## Property Wrappers

<wrapper name="@State">
**Purpose:** Manage mutable value types owned by a single view. The source of truth for simple, view-local data.

**When to use:** Simple values (Int, String, Bool, Array, struct) that belong to this view and need to trigger UI updates when changed.

**Ownership:** The view owns this data. SwiftUI manages its lifecycle.

**Lifecycle:** Persists across view body recomputes. Reset when the view is removed from the hierarchy and recreated with a new identity.

```swift
struct CounterView: View {
    @State private var count = 0
    @State private var isExpanded = false

    var body: some View {
        VStack {
            Text("Count: \(count)")

            Button("Increment") {
                count += 1
            }

            if isExpanded {
                Text("Details about count...")
            }

            Toggle("Show Details", isOn: $isExpanded)
        }
    }
}
```

**With @Observable classes (iOS 17+):**
```swift
@Observable
class ViewModel {
    var items: [String] = []
    var selectedItem: String?
}

struct ContentView: View {
    @State private var viewModel = ViewModel()

    var body: some View {
        List(viewModel.items, id: \.self) { item in
            Text(item)
        }
    }
}
```

**Common mistakes:**
- Making @State public (should be private to enforce view-local ownership)
- Using @State for data passed from a parent (use @Binding or receive as plain property)
- Not initializing @State with a value
- Using @State with ObservableObject classes pre-iOS 17 (use @StateObject instead)
</wrapper>

<wrapper name="@Binding">
**Purpose:** Create a two-way connection to state owned by another view. Allows a child view to read and write a parent's state without owning it.

**When to use:** Passing writable access to value type data from parent to child. The child needs to modify data it doesn't own.

**Ownership:** The parent owns the data. This view has read-write access via reference.

**Lifecycle:** Tied to the source of truth it references.

```swift
struct ParentView: View {
    @State private var username = ""

    var body: some View {
        VStack {
            Text("Hello, \(username)")
            UsernameField(username: $username)
        }
    }
}

struct UsernameField: View {
    @Binding var username: String

    var body: some View {
        TextField("Enter name", text: $username)
            .textFieldStyle(.roundedBorder)
            .padding()
    }
}
```

**With custom controls:**
```swift
struct ToggleButton: View {
    @Binding var isOn: Bool
    let label: String

    var body: some View {
        Button(label) {
            isOn.toggle()
        }
        .foregroundStyle(isOn ? .green : .gray)
    }
}

// Usage
struct ContentView: View {
    @State private var notificationsEnabled = false

    var body: some View {
        ToggleButton(
            isOn: $notificationsEnabled,
            label: "Notifications"
        )
    }
}
```

**Common mistakes:**
- Providing a default value to @Binding (bindings are always passed from outside)
- Making @Binding private (it must be accessible to receive the binding)
- Passing the value without $ prefix (passes a copy, not a binding)
- Using @Binding when the child shouldn't modify the value (use a plain property instead)
</wrapper>

<wrapper name="@Observable">
**Purpose:** Mark a class as observable so SwiftUI automatically tracks property changes and updates views. Replaces ObservableObject protocol in iOS 17+.

**When to use:** Reference type data models shared across multiple views. Complex state that benefits from reference semantics. Data that needs to be passed down the view hierarchy.

**Ownership:** Created and owned by a view using @State, or passed through @Environment for app-wide access.

**Lifecycle:** Follows standard Swift reference type lifecycle. When stored in @State, survives view body recomputes.

```swift
import Observation

@Observable
class ShoppingCart {
    var items: [Item] = []
    var discount: Double = 0.0

    var total: Double {
        let subtotal = items.reduce(0) { $0 + $1.price }
        return subtotal * (1 - discount)
    }

    func addItem(_ item: Item) {
        items.append(item)
    }
}

struct StoreView: View {
    @State private var cart = ShoppingCart()

    var body: some View {
        VStack {
            CartSummary(cart: cart)
            ProductList(cart: cart)
        }
    }
}

struct CartSummary: View {
    var cart: ShoppingCart  // Plain property, no wrapper needed

    var body: some View {
        Text("Total: $\(cart.total, specifier: "%.2f")")
            .font(.headline)
    }
}
```

**With @ObservationIgnored for non-tracked properties:**
```swift
@Observable
class UserSession {
    var username: String = ""
    var loginCount: Int = 0

    @ObservationIgnored
    var temporaryCache: [String: Any] = [:]  // Won't trigger view updates
}
```

**Common mistakes:**
- Using @Published with @Observable (not needed, all properties are observed by default)
- Forgetting to import Observation
- Using @StateObject instead of @State for @Observable classes
- Not using @ObservationIgnored for properties that shouldn't trigger updates (like caches, formatters)
</wrapper>

<wrapper name="@Bindable">
**Purpose:** Create bindings to properties of @Observable objects when the view doesn't own the object. Bridges @Observable with SwiftUI's $ binding syntax.

**When to use:** You have an @Observable object passed from a parent, and you need to create two-way bindings to its properties (for TextField, Toggle, etc.).

**Ownership:** The view doesn't own the object. It's passed from outside.

**Lifecycle:** Tied to the lifecycle of the @Observable object it references.

```swift
@Observable
class FormData {
    var name: String = ""
    var email: String = ""
    var agreedToTerms: Bool = false
}

struct ParentView: View {
    @State private var formData = FormData()

    var body: some View {
        FormView(formData: formData)
    }
}

struct FormView: View {
    @Bindable var formData: FormData

    var body: some View {
        Form {
            TextField("Name", text: $formData.name)
            TextField("Email", text: $formData.email)
            Toggle("I agree to terms", isOn: $formData.agreedToTerms)
        }
    }
}
```

**Nested child views:**
```swift
struct NestedChildView: View {
    @Bindable var formData: FormData

    var body: some View {
        // Can still create bindings to properties
        Toggle("Marketing emails", isOn: $formData.agreedToTerms)
    }
}
```

**Common mistakes:**
- Using @Bindable when you own the object (use @State instead)
- Using @Binding for @Observable objects (use @Bindable for reference types)
- Forgetting that @Bindable doesn't work with ObservableObject (legacy pattern)
- Using @ObservedObject instead of @Bindable for iOS 17+ code
</wrapper>

<wrapper name="@Environment">
**Purpose:** Read values from SwiftUI's environment or inject custom values accessible throughout the view hierarchy. Replaces @EnvironmentObject in iOS 17+.

**When to use:**
- Accessing system values (colorScheme, locale, dismiss, etc.)
- Sharing app-wide or subtree-wide state without prop drilling
- Dependency injection for services and models

**Ownership:** Provided by ancestor views or the system. Current view reads it.

**Lifecycle:** Managed by the provider. Available to all descendant views.

```swift
// System environment values
struct ThemedView: View {
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.dismiss) var dismiss

    var body: some View {
        VStack {
            Text("Current theme: \(colorScheme == .dark ? "Dark" : "Light")")

            Button("Close") {
                dismiss()
            }
        }
        .foregroundStyle(colorScheme == .dark ? .white : .black)
    }
}
```

**Custom environment values (iOS 17+):**
```swift
@Observable
class AppSettings {
    var fontSize: Double = 16
    var accentColor: Color = .blue
}

// In your app root
@main
struct MyApp: App {
    @State private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(settings)
        }
    }
}

// Access in any descendant view
struct SettingsView: View {
    @Environment(AppSettings.self) var settings

    var body: some View {
        VStack {
            Text("Font size: \(settings.fontSize)")
            ColorPicker("Accent", selection: $settings.accentColor)
        }
    }
}
```

**Legacy custom environment values (pre-iOS 17):**
```swift
private struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme.light
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

// Usage
struct ContentView: View {
    @Environment(\.theme) var theme

    var body: some View {
        Text("Hello")
            .foregroundStyle(theme.textColor)
    }
}
```

**Common mistakes:**
- Using @EnvironmentObject instead of @Environment for iOS 17+ code
- Not providing the environment value before accessing it (runtime crash)
- Overusing environment for data that should be passed as properties
- Using environment for frequently changing values (can cause unnecessary updates)
</wrapper>

<wrapper name="@AppStorage">
**Purpose:** Read and write UserDefaults values with automatic UI updates when the value changes.

**When to use:** Storing user preferences, settings, or small amounts of persistent data that should survive app relaunches.

**Ownership:** Backed by UserDefaults. View has read-write access.

**Lifecycle:** Persists between app launches until explicitly removed.

```swift
struct SettingsView: View {
    @AppStorage("username") private var username = "Guest"
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("theme") private var theme = "system"

    var body: some View {
        Form {
            TextField("Username", text: $username)

            Toggle("Notifications", isOn: $notificationsEnabled)

            Picker("Theme", selection: $theme) {
                Text("System").tag("system")
                Text("Light").tag("light")
                Text("Dark").tag("dark")
            }
        }
    }
}
```

**With custom UserDefaults suite:**
```swift
struct SharedSettingsView: View {
    @AppStorage("syncEnabled", store: UserDefaults(suiteName: "group.com.example.app"))
    private var syncEnabled = false

    var body: some View {
        Toggle("Sync", isOn: $syncEnabled)
    }
}
```

**Supported types:** Bool, Int, Double, String, URL, Data

**Common mistakes:**
- Storing sensitive data (UserDefaults is not encrypted)
- Storing large amounts of data (performance degradation)
- Using for data that changes frequently during a session (use @State instead)
- Not providing a default value
- Assuming cross-app synchronization (requires App Groups configuration)
</wrapper>

<wrapper name="@SceneStorage">
**Purpose:** Automatic state restoration per scene. Saves and restores values when the app is backgrounded/foregrounded or scenes are destroyed/recreated.

**When to use:** Preserving UI state for state restoration (selected tab, scroll position, current navigation path, form data).

**Ownership:** Managed per scene by the system. View has read-write access.

**Lifecycle:** Persists when app backgrounds. Destroyed when user explicitly kills the app from the app switcher.

```swift
struct ContentView: View {
    @SceneStorage("selectedTab") private var selectedTab = "home"

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
                .tag("home")

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person") }
                .tag("profile")
        }
    }
}
```

**With navigation state:**
```swift
struct NavigationExample: View {
    @SceneStorage("navigationPath") private var navigationPathData: Data?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                NavigationLink("Details", value: "details")
            }
            .navigationDestination(for: String.self) { value in
                Text("Showing: \(value)")
            }
        }
        .onAppear {
            if let data = navigationPathData,
               let restored = try? JSONDecoder().decode(NavigationPath.CodableRepresentation.self, from: data) {
                path = NavigationPath(restored)
            }
        }
        .onChange(of: path) { _, newPath in
            if let representation = newPath.codable,
               let data = try? JSONEncoder().encode(representation) {
                navigationPathData = data
            }
        }
    }
}
```

**Supported types:** Bool, Int, Double, String, URL, Data

**Common mistakes:**
- Storing sensitive data (not secure)
- Storing large amounts of data (Apple warns against this)
- Expecting data to persist after force-quit (it's cleared)
- Using for cross-scene data (each scene has its own storage)
- Not providing a default value
</wrapper>

<wrapper name="@StateObject">
**Purpose:** Create and own an ObservableObject in a view. Ensures the object survives view body recomputes.

**When to use:** Legacy code (pre-iOS 17) when you need to create and own an ObservableObject. For iOS 17+, use @State with @Observable instead.

**Ownership:** The view owns and manages the object's lifecycle.

**Lifecycle:** Created once when the view is initialized. Survives view body recomputes. Destroyed when view is removed.

```swift
// Legacy pattern (pre-iOS 17)
class LegacyViewModel: ObservableObject {
    @Published var count = 0
    @Published var items: [String] = []
}

struct LegacyView: View {
    @StateObject private var viewModel = LegacyViewModel()

    var body: some View {
        VStack {
            Text("Count: \(viewModel.count)")

            Button("Increment") {
                viewModel.count += 1
            }
        }
    }
}
```

**Common mistakes:**
- Using @StateObject for iOS 17+ (use @State with @Observable instead)
- Using @ObservedObject when the view creates the object (causes recreation bugs)
- Creating @StateObject in non-root views unnecessarily (consider passing from parent)
- Using for value types (use @State instead)
</wrapper>

<wrapper name="@ObservedObject">
**Purpose:** Observe an ObservableObject owned by another view. Doesn't create or own the object.

**When to use:** Legacy code (pre-iOS 17) when receiving an ObservableObject from a parent. For iOS 17+, pass @Observable objects as plain properties.

**Ownership:** Parent or external source owns the object. This view observes it.

**Lifecycle:** Tied to the source that owns it.

```swift
// Legacy pattern (pre-iOS 17)
class SharedViewModel: ObservableObject {
    @Published var data: String = ""
}

struct ParentView: View {
    @StateObject private var viewModel = SharedViewModel()

    var body: some View {
        ChildView(viewModel: viewModel)
    }
}

struct ChildView: View {
    @ObservedObject var viewModel: SharedViewModel

    var body: some View {
        Text(viewModel.data)
    }
}
```

**Common mistakes:**
- Creating the object within the view using @ObservedObject (use @StateObject instead, or @State for @Observable)
- Using for iOS 17+ code (pass @Observable objects as plain properties)
- Confusing ownership (if you create it, you own it - use @StateObject not @ObservedObject)
</wrapper>
</property_wrappers>

<decision_tree>
## Choosing the Right Property Wrapper

**iOS 17+ Decision Process:**

1. **Is this a value type (Int, String, Bool, struct)?**
   - Owned by this view? → `@State`
   - Passed from parent, needs modification? → `@Binding`
   - Just reading it? → Plain property

2. **Is this an @Observable class?**
   - Created and owned by this view? → `@State`
   - Passed from parent, need to create bindings to properties? → `@Bindable`
   - Passed from parent, just reading? → Plain property
   - App-wide or subtree-wide access? → `@Environment`

3. **Is this a system value or custom environment value?**
   → `@Environment`

4. **Does this need to persist to UserDefaults?**
   → `@AppStorage`

5. **Does this need automatic state restoration per scene?**
   → `@SceneStorage`

**Pre-iOS 17 Decision Process:**

1. **Is this a value type?**
   - Owned by this view? → `@State`
   - Passed from parent? → `@Binding`

2. **Is this an ObservableObject?**
   - Created by this view? → `@StateObject`
   - Passed from parent? → `@ObservedObject`
   - App-wide access? → `@EnvironmentObject`

3. **Is this a system value?**
   → `@Environment`

**Quick Reference Table:**

| Data Type | Ownership | iOS 17+ | Pre-iOS 17 |
|-----------|-----------|---------|------------|
| Value type | Own | @State | @State |
| Value type | Parent owns, need write | @Binding | @Binding |
| Value type | Parent owns, read only | Plain property | Plain property |
| @Observable class | Own | @State | N/A |
| @Observable class | Parent owns, need bindings | @Bindable | N/A |
| @Observable class | Parent owns, read only | Plain property | N/A |
| @Observable class | App-wide | @Environment | N/A |
| ObservableObject | Own | N/A | @StateObject |
| ObservableObject | Parent owns | N/A | @ObservedObject |
| ObservableObject | App-wide | N/A | @EnvironmentObject |
| System values | N/A | @Environment | @Environment |
| UserDefaults | N/A | @AppStorage | @AppStorage |
| State restoration | N/A | @SceneStorage | @SceneStorage |
</decision_tree>

<patterns>
## Common Patterns

<pattern name="Unidirectional Data Flow">
**Use when:** Building any SwiftUI view hierarchy. This is the fundamental pattern.

**Concept:** Data flows down the view hierarchy as properties. Changes flow up through bindings or callbacks. State has a single source of truth.

**Implementation:**
```swift
@Observable
class AppState {
    var items: [Item] = []
    var selectedItemId: UUID?

    func selectItem(_ id: UUID) {
        selectedItemId = id
    }

    func addItem(_ item: Item) {
        items.append(item)
    }
}

struct AppView: View {
    @State private var appState = AppState()

    var body: some View {
        NavigationStack {
            ItemList(
                items: appState.items,
                selectedId: appState.selectedItemId,
                onSelect: { appState.selectItem($0) }
            )
        }
    }
}

struct ItemList: View {
    let items: [Item]
    let selectedId: UUID?
    let onSelect: (UUID) -> Void

    var body: some View {
        List(items) { item in
            ItemRow(
                item: item,
                isSelected: item.id == selectedId,
                onTap: { onSelect(item.id) }
            )
        }
    }
}

struct ItemRow: View {
    let item: Item
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        HStack {
            Text(item.name)
            if isSelected {
                Image(systemName: "checkmark")
            }
        }
        .onTapGesture(perform: onTap)
    }
}
```

**Considerations:**
- Clear data flow is easier to debug than bidirectional mutations
- Callbacks can become verbose for deeply nested hierarchies (consider @Environment)
- Single source of truth prevents sync issues
</pattern>

<pattern name="Environment Injection">
**Use when:** Multiple views need access to shared state without prop drilling. Dependency injection for services.

**Implementation:**
```swift
@Observable
class UserSession {
    var isLoggedIn = false
    var username: String?

    func login(username: String) {
        self.username = username
        isLoggedIn = true
    }

    func logout() {
        username = nil
        isLoggedIn = false
    }
}

@main
struct MyApp: App {
    @State private var session = UserSession()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(session)
        }
    }
}

struct ContentView: View {
    @Environment(UserSession.self) private var session

    var body: some View {
        if session.isLoggedIn {
            HomeView()
        } else {
            LoginView()
        }
    }
}

struct LoginView: View {
    @Environment(UserSession.self) private var session
    @State private var username = ""

    var body: some View {
        VStack {
            TextField("Username", text: $username)
            Button("Login") {
                session.login(username: username)
            }
        }
    }
}

struct HomeView: View {
    @Environment(UserSession.self) private var session

    var body: some View {
        VStack {
            Text("Welcome, \(session.username ?? "")")
            Button("Logout") {
                session.logout()
            }
        }
    }
}
```

**Considerations:**
- Convenient for app-wide state (settings, auth, theme)
- Runtime crash if environment value not provided
- Can make testing harder (need to provide environment in previews/tests)
- Overuse can hide dependencies and make data flow unclear
</pattern>

<pattern name="Derived State">
**Use when:** Computing values from other state. Avoid storing redundant state.

**Implementation:**
```swift
@Observable
class ShoppingCart {
    var items: [CartItem] = []
    var discountCode: String?

    // Derived - computed from items
    var subtotal: Double {
        items.reduce(0) { $0 + ($1.price * Double($1.quantity)) }
    }

    // Derived - computed from subtotal and discountCode
    var discount: Double {
        guard let code = discountCode else { return 0 }
        switch code {
        case "SAVE10": return subtotal * 0.1
        case "SAVE20": return subtotal * 0.2
        default: return 0
        }
    }

    // Derived - computed from subtotal and discount
    var total: Double {
        subtotal - discount
    }
}

struct CartView: View {
    @State private var cart = ShoppingCart()

    var body: some View {
        VStack {
            List(cart.items) { item in
                HStack {
                    Text(item.name)
                    Spacer()
                    Text("$\(item.price * Double(item.quantity), specifier: "%.2f")")
                }
            }

            Divider()

            HStack {
                Text("Subtotal:")
                Spacer()
                Text("$\(cart.subtotal, specifier: "%.2f")")
            }

            if cart.discount > 0 {
                HStack {
                    Text("Discount:")
                    Spacer()
                    Text("-$\(cart.discount, specifier: "%.2f")")
                        .foregroundStyle(.green)
                }
            }

            HStack {
                Text("Total:")
                    .bold()
                Spacer()
                Text("$\(cart.total, specifier: "%.2f")")
                    .bold()
            }
        }
    }
}
```

**Considerations:**
- Computed properties are always in sync with source data
- No need to manually update derived state
- Recomputed on every access (cache if expensive)
- Keep computations simple or consider caching
</pattern>

<pattern name="View-Specific State">
**Use when:** State only matters for presentation, not business logic (UI-only state like selection, expansion, animation).

**Implementation:**
```swift
struct ExpandableCard: View {
    let content: String
    @State private var isExpanded = false  // UI state only

    var body: some View {
        VStack(alignment: .leading) {
            HStack {
                Text(content.prefix(50))
                    .lineLimit(isExpanded ? nil : 1)
                Spacer()
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
            }

            if isExpanded {
                Text(content)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.quaternary)
        .cornerRadius(8)
        .onTapGesture {
            withAnimation {
                isExpanded.toggle()
            }
        }
    }
}
```

**Considerations:**
- Keeps business logic separate from UI state
- Resets naturally when view is recreated
- Makes components self-contained and reusable
- Consider if state needs to persist (use @SceneStorage for restoration)
</pattern>

<pattern name="Sharing State Between Sibling Views">
**Use when:** Two sibling views need to share mutable state.

**Implementation:**
```swift
struct ParentView: View {
    @State private var searchQuery = ""  // Shared state lives in parent

    var body: some View {
        VStack {
            SearchBar(query: $searchQuery)  // Pass binding to both siblings
            SearchResults(query: searchQuery)
        }
    }
}

struct SearchBar: View {
    @Binding var query: String

    var body: some View {
        TextField("Search", text: $query)
            .textFieldStyle(.roundedBorder)
            .padding()
    }
}

struct SearchResults: View {
    let query: String

    var body: some View {
        List {
            // Filter results based on query
            Text("Results for: \(query)")
        }
    }
}
```

**Considerations:**
- State lives in lowest common ancestor
- Clear data flow (parent owns, children use)
- Siblings can't directly communicate (goes through parent)
- Consider @Observable model if state becomes complex
</pattern>
</patterns>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Creating @ObservedObject in View">
**Problem:** Creating an ObservableObject with @ObservedObject instead of @StateObject.

**Why it's bad:** SwiftUI can recreate views at any time. @ObservedObject doesn't guarantee the object survives, causing data loss, crashes, and unpredictable behavior. The object gets recreated on every view update.

**Instead:**
```swift
// WRONG
struct MyView: View {
    @ObservedObject var viewModel = ViewModel()  // ❌ Will be recreated!
    var body: some View { /* ... */ }
}

// RIGHT (pre-iOS 17)
struct MyView: View {
    @StateObject private var viewModel = ViewModel()  // ✅ Survives redraws
    var body: some View { /* ... */ }
}

// RIGHT (iOS 17+)
@Observable
class ViewModel {
    var data = ""
}

struct MyView: View {
    @State private var viewModel = ViewModel()  // ✅ Modern approach
    var body: some View { /* ... */ }
}
```
</anti_pattern>

<anti_pattern name="Not Making @State Private">
**Problem:** Declaring @State properties as public or internal.

**Why it's bad:** @State is meant for view-local state. Making it public violates encapsulation and suggests the state should be passed from outside (making it not truly @State). Creates confusion about ownership.

**Instead:**
```swift
// WRONG
struct MyView: View {
    @State var count = 0  // ❌ Not private
    var body: some View { /* ... */ }
}

// RIGHT
struct MyView: View {
    @State private var count = 0  // ✅ Private ownership
    var body: some View { /* ... */ }
}

// If state needs to come from outside:
struct MyView: View {
    @Binding var count: Int  // ✅ Use @Binding instead
    var body: some View { /* ... */ }
}
```
</anti_pattern>

<anti_pattern name="Storing Large Objects in State">
**Problem:** Storing large value types or arrays in @State, causing performance issues.

**Why it's bad:** SwiftUI recreates the view body whenever @State changes. Large value types cause expensive copies. Massive arrays cause performance degradation.

**Instead:**
```swift
// WRONG
struct ListView: View {
    @State private var items: [LargeItem] = loadThousandsOfItems()  // ❌ Expensive copies
    var body: some View { /* ... */ }
}

// RIGHT
@Observable
class ItemStore {
    var items: [LargeItem] = []  // Reference type, no copies
}

struct ListView: View {
    @State private var store = ItemStore()  // ✅ Only reference is copied
    var body: some View { /* ... */ }
}
```
</anti_pattern>

<anti_pattern name="Using @Binding Without $">
**Problem:** Passing a state value to a child expecting @Binding without the $ prefix.

**Why it's bad:** Passes a copy of the value instead of a binding. Child's changes don't propagate back to parent.

**Instead:**
```swift
struct ParentView: View {
    @State private var text = ""

    var body: some View {
        // WRONG
        ChildView(text: text)  // ❌ Passes copy

        // RIGHT
        ChildView(text: $text)  // ✅ Passes binding
    }
}

struct ChildView: View {
    @Binding var text: String
    var body: some View {
        TextField("Enter text", text: $text)
    }
}
```
</anti_pattern>

<anti_pattern name="Mutating State in Computed Properties">
**Problem:** Changing @State or @Observable properties inside computed properties or body.

**Why it's bad:** Causes infinite loops or unpredictable update cycles. SwiftUI reads body to determine what to render; mutating state during rendering triggers another render.

**Instead:**
```swift
// WRONG
struct MyView: View {
    @State private var count = 0

    var body: some View {
        let _ = count += 1  // ❌ Infinite loop!
        Text("Count: \(count)")
    }
}

// RIGHT
struct MyView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            Text("Count: \(count)")
            Button("Increment") {
                count += 1  // ✅ Mutate in response to events
            }
        }
        .onAppear {
            count = 0  // ✅ Or in lifecycle events
        }
    }
}
```
</anti_pattern>

<anti_pattern name="Storing Sensitive Data in @AppStorage">
**Problem:** Using @AppStorage for passwords, tokens, or other sensitive data.

**Why it's bad:** UserDefaults is not encrypted. Data is easily accessible to anyone with device access or backup access. Security vulnerability.

**Instead:**
```swift
// WRONG
@AppStorage("password") private var password = ""  // ❌ Not secure!
@AppStorage("authToken") private var token = ""    // ❌ Not secure!

// RIGHT
import Security

class KeychainManager {
    func save(password: String, for account: String) {
        // Use Keychain for sensitive data
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecValueData as String: password.data(using: .utf8)!
        ]
        SecItemAdd(query as CFDictionary, nil)
    }
}

// For auth tokens, user credentials, etc.
struct SecureView: View {
    @State private var keychain = KeychainManager()

    var body: some View {
        Button("Save Password") {
            keychain.save(password: "secret", for: "user@example.com")
        }
    }
}
```
</anti_pattern>

<anti_pattern name="Using ObservableObject in iOS 17+ Code">
**Problem:** Using ObservableObject, @Published, @StateObject, @ObservedObject, @EnvironmentObject in new iOS 17+ projects.

**Why it's bad:** The @Observable macro is simpler, more performant, and the recommended approach. Legacy patterns add unnecessary complexity. Better compiler optimization with @Observable.

**Instead:**
```swift
// WRONG (legacy)
class ViewModel: ObservableObject {
    @Published var name = ""
    @Published var count = 0
}

struct OldView: View {
    @StateObject private var viewModel = ViewModel()
    var body: some View { /* ... */ }
}

// RIGHT (iOS 17+)
@Observable
class ViewModel {
    var name = ""
    var count = 0
}

struct ModernView: View {
    @State private var viewModel = ViewModel()
    var body: some View { /* ... */ }
}
```
</anti_pattern>

<anti_pattern name="Overusing Environment">
**Problem:** Putting everything in @Environment, even data that should be passed as properties.

**Why it's bad:** Hides dependencies, makes views harder to test and preview, unclear data flow, runtime crashes if environment not provided.

**Instead:**
```swift
// WRONG - overusing environment
struct ItemRow: View {
    @Environment(AppState.self) private var appState  // ❌ Just to access one property

    var body: some View {
        Text(appState.currentItem.name)
    }
}

// RIGHT - explicit dependencies
struct ItemRow: View {
    let item: Item  // ✅ Clear dependency

    var body: some View {
        Text(item.name)
    }
}

// Environment is good for truly cross-cutting concerns:
struct ThemedView: View {
    @Environment(\.colorScheme) var colorScheme  // ✅ System value
    @Environment(UserSession.self) var session   // ✅ App-wide auth state

    var body: some View { /* ... */ }
}
```
</anti_pattern>
</anti_patterns>

<migration_guide>
## Migrating from Legacy Patterns

**ObservableObject → @Observable:**

```swift
// Before (legacy)
class ViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var count: Int = 0
    @Published var items: [Item] = []

    private var cache: [String: Any] = [:]  // Not published
}

struct OldView: View {
    @StateObject private var viewModel = ViewModel()

    var body: some View {
        Text(viewModel.name)
    }
}

// After (iOS 17+)
import Observation

@Observable
class ViewModel {
    var name: String = ""
    var count: Int = 0
    var items: [Item] = []

    @ObservationIgnored
    private var cache: [String: Any] = [:]  // Won't trigger updates
}

struct ModernView: View {
    @State private var viewModel = ViewModel()

    var body: some View {
        Text(viewModel.name)
    }
}
```

**@EnvironmentObject → @Environment:**

```swift
// Before (legacy)
class AppSettings: ObservableObject {
    @Published var theme: String = "light"
}

@main
struct OldApp: App {
    @StateObject private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settings)
        }
    }
}

struct OldContentView: View {
    @EnvironmentObject var settings: AppSettings

    var body: some View {
        Text("Theme: \(settings.theme)")
    }
}

// After (iOS 17+)
@Observable
class AppSettings {
    var theme: String = "light"
}

@main
struct ModernApp: App {
    @State private var settings = AppSettings()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(settings)
        }
    }
}

struct ModernContentView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        Text("Theme: \(settings.theme)")
    }
}
```

**@ObservedObject (child views) → Plain properties:**

```swift
// Before (legacy)
class SharedData: ObservableObject {
    @Published var value: String = ""
}

struct ParentView: View {
    @StateObject private var data = SharedData()

    var body: some View {
        ChildView(data: data)
    }
}

struct ChildView: View {
    @ObservedObject var data: SharedData

    var body: some View {
        Text(data.value)
    }
}

// After (iOS 17+)
@Observable
class SharedData {
    var value: String = ""
}

struct ParentView: View {
    @State private var data = SharedData()

    var body: some View {
        ChildView(data: data)
    }
}

struct ChildView: View {
    var data: SharedData  // Plain property, no wrapper

    var body: some View {
        Text(data.value)
    }
}
```

**Creating bindings to @Observable properties:**

```swift
// Before (legacy)
class FormData: ObservableObject {
    @Published var username: String = ""
    @Published var email: String = ""
}

struct LegacyForm: View {
    @ObservedObject var formData: FormData

    var body: some View {
        Form {
            TextField("Username", text: $formData.username)
            TextField("Email", text: $formData.email)
        }
    }
}

// After (iOS 17+)
@Observable
class FormData {
    var username: String = ""
    var email: String = ""
}

struct ModernForm: View {
    @Bindable var formData: FormData

    var body: some View {
        Form {
            TextField("Username", text: $formData.username)
            TextField("Email", text: $formData.email)
        }
    }
}
```

**Migration checklist:**

1. Add `import Observation` to files using @Observable
2. Replace `class X: ObservableObject` with `@Observable class X`
3. Remove `@Published` from properties (all properties are observed by default)
4. Add `@ObservationIgnored` to properties that shouldn't trigger updates
5. Replace `@StateObject` with `@State` in owning views
6. Replace `@ObservedObject` with plain properties in child views (no wrapper)
7. Replace `@EnvironmentObject` with `@Environment(Type.self)`
8. Replace `.environmentObject(obj)` with `.environment(obj)`
9. Use `@Bindable` when you need to create bindings to @Observable properties
10. Test thoroughly - SwiftUI will warn about missing environment values at runtime
</migration_guide>

<debugging>
## Debugging State Issues

**State not updating views:**
- Verify property is marked with correct wrapper (@State, @Observable)
- Check that mutations happen on main thread for UI updates
- Ensure @ObservationIgnored isn't on properties that should update views
- Confirm view is actually observing the state (proper property wrapper usage)

**Views updating too much:**
- Check if @Observable class is triggering updates from non-UI properties (use @ObservationIgnored)
- Verify child views aren't receiving entire model when they only need specific properties
- Consider breaking large models into smaller focused models
- Use Instruments Time Profiler to identify expensive body computations

**Runtime crashes:**
- "Missing @Environment" - Forgot to provide environment value with `.environment(value)`
- Force unwrapping nil @AppStorage or @SceneStorage - Always provide default values
- Access to deallocated object - Using @ObservedObject instead of @StateObject for owned objects

**Previews not working:**
- Provide all required @Environment values in preview
- Initialize @Binding properties with `.constant(value)` in previews
- Ensure @Observable classes are properly initialized

**Example debugging view:**
```swift
struct DebugStateView: View {
    @State private var viewModel = ViewModel()

    var body: some View {
        VStack {
            Text("Count: \(viewModel.count)")
            Button("Increment") {
                print("Before: \(viewModel.count)")
                viewModel.count += 1
                print("After: \(viewModel.count)")
            }
        }
        // Add debugging modifier
        ._printChanges()  // Prints when view updates and why
    }
}
```
</debugging>
