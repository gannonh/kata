<overview>
SwiftUI navigation has evolved significantly with NavigationStack (iOS 16+) replacing the deprecated NavigationView. The modern navigation model provides type-safe, programmatic control while supporting both user-driven and code-driven navigation patterns.

**Key insight:** NavigationStack with NavigationPath provides a stack-based navigation system where you can programmatically manipulate the navigation hierarchy while SwiftUI keeps the UI in sync automatically.

**Read this file when:** Building multi-screen apps, implementing deep linking, managing programmatic navigation, presenting sheets and modals, or setting up tab-based navigation.

**Related files:**
- architecture.md - Coordinator pattern for complex navigation flows
- state-management.md - Managing navigation state with @Observable
- platform-integration.md - Platform-specific navigation differences (iOS vs macOS)
</overview>

<navigation_stack>
## NavigationStack

NavigationStack manages a stack of views with type-safe routing. It replaces the deprecated NavigationView and provides better programmatic control.

**Basic usage with NavigationLink:**
```swift
struct ContentView: View {
    var body: some View {
        NavigationStack {
            List {
                NavigationLink("Details", value: "details")
                NavigationLink("Settings", value: "settings")
            }
            .navigationTitle("Home")
            .navigationDestination(for: String.self) { value in
                Text("Showing: \(value)")
            }
        }
    }
}
```

**With NavigationPath for programmatic navigation:**
```swift
struct ContentView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            VStack {
                Button("Go to Details") {
                    path.append("details")
                }

                Button("Go Deep (3 levels)") {
                    path.append("level1")
                    path.append("level2")
                    path.append("level3")
                }
            }
            .navigationTitle("Home")
            .navigationDestination(for: String.self) { value in
                DetailView(value: value, path: $path)
            }
        }
    }
}

struct DetailView: View {
    let value: String
    @Binding var path: NavigationPath

    var body: some View {
        VStack {
            Text("Showing: \(value)")

            Button("Pop to Root") {
                path = NavigationPath()
            }
        }
    }
}
```

**navigationDestination modifier:**

The navigationDestination modifier enables type-based routing. You can register multiple destination handlers for different data types:

```swift
struct MultiTypeNavigation: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Button("Show User") {
                    path.append(User(id: 1, name: "Alice"))
                }

                Button("Show Product") {
                    path.append(Product(id: 100, title: "iPhone"))
                }
            }
            .navigationDestination(for: User.self) { user in
                UserDetailView(user: user)
            }
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }
        }
    }
}

struct User: Hashable, Codable {
    let id: Int
    let name: String
}

struct Product: Hashable, Codable {
    let id: Int
    let title: String
}
```

**Key rules:**
- Place navigationDestination inside NavigationStack, not on child views
- Don't place navigationDestination on lazy containers (List, ScrollView, LazyVStack)
- Top-level navigationDestination always overrides lower ones for the same type
- Each destination type must be Hashable

**Navigation state in @Observable:**
```swift
import Observation

@Observable
class NavigationManager {
    var path = NavigationPath()

    func push(_ destination: Destination) {
        path.append(destination)
    }

    func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
    }

    func popToRoot() {
        path = NavigationPath()
    }
}

enum Destination: Hashable {
    case detail(id: Int)
    case settings
    case profile
}

struct AppView: View {
    @State private var navigation = NavigationManager()

    var body: some View {
        @Bindable var nav = navigation

        NavigationStack(path: $nav.path) {
            List {
                Button("Details") {
                    navigation.push(.detail(id: 1))
                }

                Button("Settings") {
                    navigation.push(.settings)
                }
            }
            .navigationDestination(for: Destination.self) { destination in
                switch destination {
                case .detail(let id):
                    DetailView(id: id, navigation: navigation)
                case .settings:
                    SettingsView(navigation: navigation)
                case .profile:
                    ProfileView(navigation: navigation)
                }
            }
        }
    }
}
```
</navigation_stack>

<programmatic_navigation>
## Programmatic Navigation

NavigationPath provides programmatic control over the navigation stack without requiring NavigationLink user interaction.

**Push to path:**
```swift
// Push single destination
path.append(DetailDestination.item(id: 123))

// Push multiple levels at once
path.append(contentsOf: [screen1, screen2, screen3])
```

**Pop operations:**
```swift
// Pop one level
path.removeLast()

// Pop multiple levels
path.removeLast(2)

// Pop to root (clear entire stack)
path = NavigationPath()

// Conditional pop
if path.count > 0 {
    path.removeLast()
}
```

**Deep navigation example:**
```swift
@Observable
class Router {
    var path = NavigationPath()

    func navigateToUserPosts(userId: Int, postId: Int) {
        // Navigate through multiple screens
        path.append(Route.userDetail(userId))
        path.append(Route.userPosts(userId))
        path.append(Route.postDetail(postId))
    }

    func popToUserDetail() {
        // Remove specific number of levels
        if path.count >= 2 {
            path.removeLast(2)
        }
    }
}

enum Route: Hashable {
    case userDetail(Int)
    case userPosts(Int)
    case postDetail(Int)
}
```

**NavigationPath count and inspection:**
```swift
struct NavigationDebugView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            VStack {
                Text("Stack depth: \(path.count)")

                Button("Push") {
                    path.append("Level \(path.count + 1)")
                }

                Button("Pop") {
                    if !path.isEmpty {
                        path.removeLast()
                    }
                }

                Button("Pop to Root") {
                    path = NavigationPath()
                }
            }
            .navigationDestination(for: String.self) { value in
                Text(value)
            }
        }
    }
}
```
</programmatic_navigation>

<sheets_and_covers>
## Sheet and FullScreenCover

Sheets present modal content on top of the current view. They are not part of the NavigationStack hierarchy.

**Basic sheet with boolean:**
```swift
struct SheetExample: View {
    @State private var showingSheet = false

    var body: some View {
        Button("Show Sheet") {
            showingSheet = true
        }
        .sheet(isPresented: $showingSheet) {
            SheetContentView()
        }
    }
}

struct SheetContentView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack {
                Text("Sheet Content")
                Button("Close") {
                    dismiss()
                }
            }
            .navigationTitle("Modal")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}
```

**Item-based presentation (type-safe, recommended):**
```swift
struct ItemSheet: View {
    @State private var selectedUser: User?

    var body: some View {
        List(users) { user in
            Button(user.name) {
                selectedUser = user
            }
        }
        .sheet(item: $selectedUser) { user in
            UserDetailSheet(user: user)
        }
    }
}

struct User: Identifiable {
    let id: UUID
    let name: String
}

struct UserDetailSheet: View {
    let user: User
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack {
                Text("User: \(user.name)")
            }
            .navigationTitle(user.name)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}
```

**FullScreenCover:**
```swift
struct FullScreenExample: View {
    @State private var showingFullScreen = false

    var body: some View {
        Button("Show Full Screen") {
            showingFullScreen = true
        }
        .fullScreenCover(isPresented: $showingFullScreen) {
            FullScreenContentView()
        }
    }
}

struct FullScreenContentView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack {
                Text("Full Screen Content")
                    .font(.largeTitle)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
    }
}
```

**Presentation detents (iOS 16+):**
```swift
struct DetentSheet: View {
    @State private var showingSheet = false
    @State private var selectedDetent: PresentationDetent = .medium

    var body: some View {
        Button("Show Customizable Sheet") {
            showingSheet = true
        }
        .sheet(isPresented: $showingSheet) {
            SheetWithDetents(selectedDetent: $selectedDetent)
                .presentationDetents(
                    [.medium, .large, .fraction(0.25), .height(200)],
                    selection: $selectedDetent
                )
                .presentationDragIndicator(.visible)
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        }
    }
}

struct SheetWithDetents: View {
    @Binding var selectedDetent: PresentationDetent

    var body: some View {
        VStack {
            Text("Drag to resize")
                .font(.headline)

            Text("Current detent: \(detentDescription)")
                .font(.caption)
        }
        .padding()
    }

    var detentDescription: String {
        if selectedDetent == .medium { return "Medium" }
        if selectedDetent == .large { return "Large" }
        return "Custom"
    }
}
```

**Dismiss from presented view:**
```swift
struct DismissExample: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack {
            Text("Modal Content")

            Button("Dismiss") {
                dismiss()
            }
        }
    }
}
```
</sheets_and_covers>

<tab_view>
## TabView

TabView presents multiple independent navigation hierarchies. Each tab typically contains its own NavigationStack.

**Basic TabView:**
```swift
struct TabExample: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            SearchView()
                .tabItem {
                    Label("Search", systemImage: "magnifyingglass")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
        }
    }
}

struct HomeView: View {
    var body: some View {
        NavigationStack {
            List {
                Text("Home Content")
            }
            .navigationTitle("Home")
        }
    }
}
```

**Programmatic tab selection:**
```swift
struct ProgrammaticTabView: View {
    @State private var selectedTab = Tab.home

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(Tab.home)

            SearchView()
                .tabItem {
                    Label("Search", systemImage: "magnifyingglass")
                }
                .tag(Tab.search)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
                .tag(Tab.profile)
        }
        .onChange(of: selectedTab) { oldValue, newValue in
            print("Tab changed from \(oldValue) to \(newValue)")
        }
    }
}

enum Tab {
    case home
    case search
    case profile
}
```

**Each tab with independent NavigationStack:**
```swift
struct IndependentTabStacks: View {
    @State private var homeNavPath = NavigationPath()
    @State private var searchNavPath = NavigationPath()

    var body: some View {
        TabView {
            NavigationStack(path: $homeNavPath) {
                HomeRootView()
                    .navigationDestination(for: HomeDestination.self) { destination in
                        // Home-specific destinations
                        Text("Home destination")
                    }
            }
            .tabItem {
                Label("Home", systemImage: "house")
            }

            NavigationStack(path: $searchNavPath) {
                SearchRootView()
                    .navigationDestination(for: SearchDestination.self) { destination in
                        // Search-specific destinations
                        Text("Search destination")
                    }
            }
            .tabItem {
                Label("Search", systemImage: "magnifyingglass")
            }
        }
    }
}

enum HomeDestination: Hashable {
    case detail(Int)
}

enum SearchDestination: Hashable {
    case results(String)
}
```

**iOS 18 Tab API:**
```swift
// iOS 18 introduces new Tab syntax with better customization
@available(iOS 18.0, *)
struct ModernTabView: View {
    @State private var selectedTab: TabIdentifier = .home

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Home", systemImage: "house", value: .home) {
                NavigationStack {
                    HomeView()
                }
            }

            Tab("Search", systemImage: "magnifyingglass", value: .search) {
                NavigationStack {
                    SearchView()
                }
            }
            .badge(5)  // Badge support

            Tab("Profile", systemImage: "person", value: .profile) {
                NavigationStack {
                    ProfileView()
                }
            }
            .customizationID("profile")  // Enables tab customization
        }
        .tabViewStyle(.sidebarAdaptable)  // Sidebar on iPad
    }
}

enum TabIdentifier: Hashable {
    case home
    case search
    case profile
}
```

**Tab badges:**
```swift
struct BadgedTabs: View {
    @State private var unreadCount = 3

    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            MessagesView()
                .tabItem {
                    Label("Messages", systemImage: "message")
                }
                .badge(unreadCount)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
        }
    }
}
```

**Platform differences:**
- **iOS:** Bottom tabs with up to 5 visible items (more creates "More" tab)
- **macOS:** Top tabs or sidebar style
- **iPadOS:** Can transform to sidebar with .tabViewStyle(.sidebarAdaptable)
- **watchOS:** PageTabViewStyle (swipeable pages)
</tab_view>

<deep_linking>
## Deep Linking

Deep linking enables opening your app to specific screens via URLs, supporting both custom URL schemes and Universal Links.

**URL handling with onOpenURL:**
```swift
@main
struct MyApp: App {
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(router)
                .onOpenURL { url in
                    handleDeepLink(url)
                }
        }
    }

    private func handleDeepLink(_ url: URL) {
        router.handleDeepLink(url)
    }
}

@Observable
class Router {
    var path = NavigationPath()

    func handleDeepLink(_ url: URL) {
        // Parse URL and update navigation
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return
        }

        // myapp://user/123
        if components.scheme == "myapp",
           components.host == "user",
           let userId = components.path.split(separator: "/").first,
           let id = Int(userId) {
            navigateToUser(id: id)
        }

        // myapp://product/456/reviews
        if components.scheme == "myapp",
           components.host == "product" {
            let pathComponents = components.path.split(separator: "/")
            if let productId = pathComponents.first,
               let id = Int(productId) {
                navigateToProduct(id: id, showReviews: pathComponents.contains("reviews"))
            }
        }
    }

    func navigateToUser(id: Int) {
        path = NavigationPath()  // Reset to root
        path.append(Route.userDetail(id))
    }

    func navigateToProduct(id: Int, showReviews: Bool) {
        path = NavigationPath()
        path.append(Route.productDetail(id))
        if showReviews {
            path.append(Route.productReviews(id))
        }
    }
}

enum Route: Hashable {
    case userDetail(Int)
    case productDetail(Int)
    case productReviews(Int)
}
```

**Parsing URLs into navigation state:**
```swift
@Observable
class DeepLinkRouter {
    var path = NavigationPath()
    var selectedTab: AppTab = .home

    func handleDeepLink(_ url: URL) {
        // Parse URL: myapp://tab/search?query=SwiftUI&filter=recent
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return
        }

        // Handle tab switching
        if components.host == "tab",
           let tabName = components.path.split(separator: "/").first {
            switchTab(String(tabName))
        }

        // Handle query parameters
        let queryItems = components.queryItems ?? []
        if let query = queryItems.first(where: { $0.name == "query" })?.value {
            navigateToSearch(query: query)
        }
    }

    private func switchTab(_ tab: String) {
        switch tab {
        case "home": selectedTab = .home
        case "search": selectedTab = .search
        case "profile": selectedTab = .profile
        default: break
        }
    }

    private func navigateToSearch(query: String) {
        selectedTab = .search
        path = NavigationPath()
        path.append(SearchRoute.results(query))
    }
}

enum AppTab {
    case home
    case search
    case profile
}

enum SearchRoute: Hashable {
    case results(String)
}
```

**Universal Links setup:**

1. **Associated Domains entitlement:** Add in Xcode project capabilities
   - `applinks:example.com`

2. **apple-app-site-association file:** Host at `https://example.com/.well-known/apple-app-site-association`
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.example.myapp",
        "paths": [
          "/user/*",
          "/product/*"
        ]
      }
    ]
  }
}
```

3. **Handle in app:**
```swift
@main
struct MyApp: App {
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(router)
                .onOpenURL { url in
                    router.handleUniversalLink(url)
                }
        }
    }
}
```

**Custom URL schemes:**

1. **Register scheme in Info.plist:**
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>myapp</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.example.myapp</string>
    </dict>
</array>
```

2. **Handle custom scheme:**
```swift
struct ContentView: View {
    @Environment(Router.self) private var router

    var body: some View {
        @Bindable var router = router

        NavigationStack(path: $router.path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    destinationView(for: route)
                }
        }
    }

    @ViewBuilder
    func destinationView(for route: Route) -> some View {
        switch route {
        case .userDetail(let id):
            UserDetailView(userId: id)
        case .productDetail(let id):
            ProductDetailView(productId: id)
        case .productReviews(let id):
            ProductReviewsView(productId: id)
        }
    }
}
```

**Security considerations:**
- Validate all incoming URLs
- Sanitize parameters before using them
- Don't expose sensitive functionality via deep links
- Use Universal Links over custom URL schemes for production (more secure, unique)
</deep_linking>

<coordinator_pattern>
## Coordinator Pattern (Optional)

The Coordinator pattern centralizes navigation logic, decoupling it from views. Use when navigation becomes complex enough to justify the abstraction.

**When to use:**
- Complex navigation flows with many paths
- Testable navigation logic separated from views
- Multiple entry points to the same flow
- Deep linking with complex routing

**Implementation with @Observable:**
```swift
import Observation

@Observable
class AppCoordinator {
    var path = NavigationPath()
    var sheet: Sheet?
    var fullScreenCover: Cover?

    // MARK: - Navigation

    func push(_ destination: Destination) {
        path.append(destination)
    }

    func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
    }

    func popToRoot() {
        path = NavigationPath()
    }

    // MARK: - Sheets

    func presentSheet(_ sheet: Sheet) {
        self.sheet = sheet
    }

    func dismissSheet() {
        self.sheet = nil
    }

    // MARK: - Full Screen

    func presentFullScreen(_ cover: Cover) {
        self.fullScreenCover = cover
    }

    func dismissFullScreen() {
        self.fullScreenCover = nil
    }

    // MARK: - Deep Linking

    func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return
        }

        if components.path.contains("/user/"),
           let userId = extractId(from: components.path) {
            popToRoot()
            push(.userDetail(userId))
        }
    }

    private func extractId(from path: String) -> Int? {
        let components = path.split(separator: "/")
        return components.last.flatMap { Int($0) }
    }
}

enum Destination: Hashable {
    case userDetail(Int)
    case settings
    case editProfile
}

enum Sheet: Identifiable {
    case addUser
    case filter

    var id: String {
        switch self {
        case .addUser: return "addUser"
        case .filter: return "filter"
        }
    }
}

enum Cover: Identifiable {
    case onboarding
    case camera

    var id: String {
        switch self {
        case .onboarding: return "onboarding"
        case .camera: return "camera"
        }
    }
}

// MARK: - Root View

struct RootView: View {
    @State private var coordinator = AppCoordinator()

    var body: some View {
        @Bindable var coordinator = coordinator

        NavigationStack(path: $coordinator.path) {
            UserListView()
                .navigationDestination(for: Destination.self) { destination in
                    destinationView(for: destination)
                }
        }
        .sheet(item: $coordinator.sheet) { sheet in
            sheetView(for: sheet)
        }
        .fullScreenCover(item: $coordinator.fullScreenCover) { cover in
            coverView(for: cover)
        }
        .environment(coordinator)
        .onOpenURL { url in
            coordinator.handleDeepLink(url)
        }
    }

    @ViewBuilder
    func destinationView(for destination: Destination) -> some View {
        switch destination {
        case .userDetail(let id):
            UserDetailView(userId: id)
        case .settings:
            SettingsView()
        case .editProfile:
            EditProfileView()
        }
    }

    @ViewBuilder
    func sheetView(for sheet: Sheet) -> some View {
        switch sheet {
        case .addUser:
            AddUserView()
        case .filter:
            FilterView()
        }
    }

    @ViewBuilder
    func coverView(for cover: Cover) -> some View {
        switch cover {
        case .onboarding:
            OnboardingView()
        case .camera:
            CameraView()
        }
    }
}

// MARK: - Views using coordinator

struct UserListView: View {
    @Environment(AppCoordinator.self) private var coordinator

    var body: some View {
        List {
            ForEach(users) { user in
                Button(user.name) {
                    coordinator.push(.userDetail(user.id))
                }
            }
        }
        .navigationTitle("Users")
        .toolbar {
            Button("Add") {
                coordinator.presentSheet(.addUser)
            }
        }
    }

    let users = [
        User(id: 1, name: "Alice"),
        User(id: 2, name: "Bob")
    ]
}

struct UserDetailView: View {
    let userId: Int
    @Environment(AppCoordinator.self) private var coordinator

    var body: some View {
        VStack {
            Text("User \(userId)")

            Button("Edit Profile") {
                coordinator.push(.editProfile)
            }

            Button("Pop to Root") {
                coordinator.popToRoot()
            }
        }
        .navigationTitle("User Detail")
    }
}
```

**Trade-offs:**
- **Pros:** Testable navigation logic, centralized flow control, easier deep linking, decoupled views
- **Cons:** Additional abstraction layer, more code to maintain, can be overkill for simple apps

**When NOT to use:** Simple apps with linear navigation, apps with fewer than 10 screens, prototypes
</coordinator_pattern>

<state_persistence>
## Navigation State Persistence

Enable state restoration so users return to where they left off when reopening your app.

**Codable NavigationPath:**
```swift
struct PersistentNavigation: View {
    @State private var path = NavigationPath()
    @AppStorage("navigationPath") private var navigationPathData: Data?

    var body: some View {
        NavigationStack(path: $path) {
            List {
                NavigationLink("Details", value: Route.details)
                NavigationLink("Settings", value: Route.settings)
            }
            .navigationTitle("Home")
            .navigationDestination(for: Route.self) { route in
                routeView(for: route)
            }
        }
        .onAppear {
            restorePath()
        }
        .onChange(of: path) { oldPath, newPath in
            savePath()
        }
    }

    @ViewBuilder
    func routeView(for route: Route) -> some View {
        switch route {
        case .details:
            Text("Details")
        case .settings:
            Text("Settings")
        }
    }

    func savePath() {
        guard let representation = path.codable else { return }

        do {
            let data = try JSONEncoder().encode(representation)
            navigationPathData = data
        } catch {
            print("Failed to save path: \(error)")
        }
    }

    func restorePath() {
        guard let data = navigationPathData else { return }

        do {
            let representation = try JSONDecoder().decode(
                NavigationPath.CodableRepresentation.self,
                from: data
            )
            path = NavigationPath(representation)
        } catch {
            print("Failed to restore path: \(error)")
        }
    }
}

enum Route: Hashable, Codable {
    case details
    case settings
}
```

**@SceneStorage for restoration:**
```swift
struct SceneStorageNavigation: View {
    @SceneStorage("navigationPath") private var pathData: Data?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            List {
                NavigationLink("Item 1", value: 1)
                NavigationLink("Item 2", value: 2)
            }
            .navigationDestination(for: Int.self) { value in
                DetailView(value: value)
            }
        }
        .task {
            if let data = pathData,
               let representation = try? JSONDecoder().decode(
                NavigationPath.CodableRepresentation.self,
                from: data
               ) {
                path = NavigationPath(representation)
            }
        }
        .onChange(of: path) { _, newPath in
            if let representation = newPath.codable,
               let data = try? JSONEncoder().encode(representation) {
                pathData = data
            }
        }
    }
}
```

**Important notes:**
- Only works if all types in NavigationPath are Codable
- @SceneStorage cleared when user force-quits app
- @AppStorage persists across launches but not recommended for large data
- Test restoration thoroughly (background app, force quit, etc.)
</state_persistence>

<decision_tree>
## Choosing the Right Approach

**Simple app with few screens:** NavigationStack with NavigationLink (user-driven navigation is sufficient)

**Need programmatic navigation:** NavigationStack + NavigationPath in @Observable class stored in @State

**Modal content (settings, forms, detail overlays):** .sheet() for dismissible modals, .fullScreenCover() for immersive content

**Multiple independent sections:** TabView with separate NavigationStack per tab

**Deep linking required:** onOpenURL + NavigationPath (parse URL and manipulate path programmatically)

**Complex navigation flows (10+ screens, multiple entry points):** Coordinator pattern with @Observable coordinator managing NavigationPath and sheet/cover state

**State restoration needed:** NavigationPath.codable with @SceneStorage or @AppStorage

**Platform differences matter:** Check platform in architecture.md, use NavigationSplitView for iPad/macOS multi-column layouts
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Using NavigationView">
**Problem:** NavigationView is deprecated in iOS 16+

**Why it's bad:**
- Missing modern features (programmatic navigation, type-safe routing)
- Deprecated API that may be removed
- NavigationStack is more performant and flexible

**Instead:** Use NavigationStack
```swift
// WRONG
NavigationView {
    List { }
}

// RIGHT
NavigationStack {
    List { }
}
```
</anti_pattern>

<anti_pattern name="Boolean flags for navigation">
**Problem:** Using @State var showDetail = false for each destination

**Why it's bad:**
- Doesn't scale beyond 2-3 screens
- Loses type safety (what data does the destination need?)
- Can't programmatically navigate deep
- No navigation history

**Instead:** Use navigationDestination with typed values
```swift
// WRONG
@State private var showUserDetail = false
@State private var showSettings = false
@State private var showProfile = false

// RIGHT
@State private var path = NavigationPath()

NavigationStack(path: $path) {
    Button("Show User") {
        path.append(Route.userDetail(id: 1))
    }
    .navigationDestination(for: Route.self) { route in
        // Handle route
    }
}
```
</anti_pattern>

<anti_pattern name="Storing NavigationPath in @State at wrong level">
**Problem:** Storing NavigationPath in child views that need to access it

**Why it's bad:**
- Child views can't access parent's NavigationPath
- Forces passing bindings through many levels
- Breaks encapsulation

**Instead:** Store in @Observable, pass via @Environment
```swift
// WRONG
struct ChildView: View {
    @State private var path = NavigationPath()  // Can't access parent's path
}

// RIGHT
@Observable
class Router {
    var path = NavigationPath()
}

@main
struct App: App {
    @State private var router = Router()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(router)
        }
    }
}

struct ChildView: View {
    @Environment(Router.self) private var router

    var body: some View {
        Button("Navigate") {
            router.path.append(destination)
        }
    }
}
```
</anti_pattern>

<anti_pattern name="Placing navigationDestination on lazy containers">
**Problem:** Putting navigationDestination inside List, ScrollView, LazyVStack

**Why it's bad:**
- Destination closures may not be called
- Lazy loading means modifiers aren't registered
- Apple explicitly warns against this

**Instead:** Place navigationDestination on NavigationStack or its immediate child
```swift
// WRONG
NavigationStack {
    List {
        ForEach(items) { item in
            NavigationLink(item.name, value: item)
        }
        .navigationDestination(for: Item.self) { item in  // ❌ Inside List
            DetailView(item: item)
        }
    }
}

// RIGHT
NavigationStack {
    List {
        ForEach(items) { item in
            NavigationLink(item.name, value: item)
        }
    }
    .navigationDestination(for: Item.self) { item in  // ✅ Outside List
        DetailView(item: item)
    }
}
```
</anti_pattern>

<anti_pattern name="Mixing sheets with NavigationStack for sequential flows">
**Problem:** Using sheets for multi-step flows that should be pushed

**Why it's bad:**
- Sheets are for modal content, not hierarchical navigation
- Can't use back button (must dismiss)
- Breaks user expectations
- No navigation history

**Instead:** Use NavigationStack for flows, sheets for modals
```swift
// WRONG - using sheets for sequential steps
.sheet(isPresented: $showStep2) {
    Step2View()
        .sheet(isPresented: $showStep3) {
            Step3View()  // Nested sheets
        }
}

// RIGHT - NavigationStack for flows
NavigationStack(path: $path) {
    Step1View()
        .navigationDestination(for: Step.self) { step in
            switch step {
            case .step2: Step2View()
            case .step3: Step3View()
            }
        }
}

// RIGHT - Sheets for modals
.sheet(isPresented: $showSettings) {
    SettingsView()  // Self-contained modal
}
```
</anti_pattern>

<anti_pattern name="Not making navigation types Hashable">
**Problem:** Forgetting to conform to Hashable for navigationDestination types

**Why it's bad:**
- Compiler error: navigationDestination requires Hashable
- NavigationPath can't store non-Hashable types

**Instead:** Always make route types Hashable (and Codable for persistence)
```swift
// WRONG
struct Route {
    let id: Int
}

// RIGHT
struct Route: Hashable {
    let id: Int
}

// EVEN BETTER - also Codable for persistence
enum Route: Hashable, Codable {
    case detail(id: Int)
    case settings
}
```
</anti_pattern>

<anti_pattern name="Creating separate NavigationStack per TabView tab without independent state">
**Problem:** Sharing NavigationPath between tabs

**Why it's bad:**
- Tabs should have independent navigation stacks
- Switching tabs loses navigation context
- Breaks expected tab behavior

**Instead:** Each tab gets its own NavigationStack and path
```swift
// WRONG
@State private var path = NavigationPath()

TabView {
    NavigationStack(path: $path) { HomeView() }
        .tabItem { Label("Home", systemImage: "house") }

    NavigationStack(path: $path) { SearchView() }  // ❌ Shared path
        .tabItem { Label("Search", systemImage: "magnifyingglass") }
}

// RIGHT
@State private var homePath = NavigationPath()
@State private var searchPath = NavigationPath()

TabView {
    NavigationStack(path: $homePath) { HomeView() }
        .tabItem { Label("Home", systemImage: "house") }

    NavigationStack(path: $searchPath) { SearchView() }  // ✅ Independent
        .tabItem { Label("Search", systemImage: "magnifyingglass") }
}
```
</anti_pattern>
</anti_patterns>

## Sources

- [Hacking with Swift: Programmatic navigation with NavigationStack](https://www.hackingwithswift.com/books/ios-swiftui/programmatic-navigation-with-navigationstack)
- [AzamSharp: Navigation Patterns in SwiftUI](https://azamsharp.com/2024/07/29/navigation-patterns-in-swiftui.html)
- [tanaschita: How to use NavigationPath for routing in SwiftUI](https://tanaschita.com/swiftui-navigationpath/)
- [Swift with Majid: Mastering NavigationStack in SwiftUI. Navigator Pattern](https://swiftwithmajid.com/2022/06/15/mastering-navigationstack-in-swiftui-navigator-pattern/)
- [Medium: Mastering Navigation in SwiftUI: The 2025 Guide](https://medium.com/@dinaga119/mastering-navigation-in-swiftui-the-2025-guide-to-clean-scalable-routing-bbcb6dbce929)
- [Swift Anytime: How to use Coordinator Pattern in SwiftUI](https://www.swiftanytime.com/blog/coordinator-pattern-in-swiftui)
- [SwiftLee: Deeplink URL handling in SwiftUI](https://www.avanderlee.com/swiftui/deeplink-url-handling/)
- [Michael Long: Advanced Deep Linking in SwiftUI](https://michaellong.medium.com/advanced-deep-linking-in-swiftui-c0085be83e7c)
- [Swift with Majid: Deep linking for local notifications in SwiftUI](https://swiftwithmajid.com/2024/04/09/deep-linking-for-local-notifications-in-swiftui/)
- [Sarunw: Bottom Sheet in SwiftUI on iOS 16 with presentationDetents](https://sarunw.com/posts/swiftui-bottom-sheet/)
- [Apple Developer: presentationDetents(_:)](https://developer.apple.com/documentation/swiftui/view/presentationdetents(_:))
- [Hacking with Swift: What's new in SwiftUI for iOS 18](https://www.hackingwithswift.com/articles/270/whats-new-in-swiftui-for-ios-18)
- [iOS Coffee Break: Using SwiftUI's Improved TabView with Sidebar on iOS 18](https://www.ioscoffeebreak.com/issue/issue34)
- [AppCoda: What's New in SwiftUI for iOS 18](https://www.appcoda.com/swiftui-ios-18/)
- [Medium: Getting Started with the Improved TabView in iOS 18](https://medium.com/@jpmtech/getting-started-with-the-improved-tabview-in-ios-18-111974b70db9)
- [Apple Developer: Enhancing your app's content with tab navigation](https://developer.apple.com/documentation/swiftui/enhancing-your-app-content-with-tab-navigation)
- [Apple Developer: NavigationPath](https://developer.apple.com/documentation/swiftui/navigationpath)
- [DEV Community: Modern Navigation in SwiftUI](https://dev.to/sebastienlato/modern-navigation-in-swiftui-1c8g)
- [Medium: Mastering Navigation in SwiftUI Using Coordinator Pattern](https://medium.com/@dikidwid0/mastering-navigation-in-swiftui-using-coordinator-pattern-833396c67db5)
- [QuickBird Studios: How to Use the Coordinator Pattern in SwiftUI](https://quickbirdstudios.com/blog/coordinator-pattern-in-swiftui/)
