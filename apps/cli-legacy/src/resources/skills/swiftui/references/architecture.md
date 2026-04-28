<overview>
SwiftUI architecture determines how you organize code, manage dependencies, and structure your app for maintainability and scalability. This file covers architectural patterns, project organization, and design decisions.

**Read this when:**
- Starting a new SwiftUI project
- Deciding between MVVM, TCA, or other patterns
- Structuring a growing codebase
- Setting up dependency injection
- Organizing features into modules

**Related files:**
- state-management.md - State ownership and data flow within architectures
- navigation.md - Navigation patterns for different architectures
- networking-async.md - Async operations and where they fit architecturally
- swiftdata.md - Persistence layer integration with architecture
</overview>

<options>
## Available Approaches

<option name="SwiftUI Native (Minimal Architecture)">
**When to use:** Simple apps with limited business logic, prototypes, learning projects, apps with 5-10 screens or fewer

**Strengths:**
- Zero architectural overhead - just build features
- SwiftUI has MVVM-like patterns built-in (@State acts as ViewModel)
- Fastest development for small scopes
- Easy to understand for SwiftUI beginners
- Works seamlessly with SwiftData (MVVM struggles with SwiftData)

**Weaknesses:**
- Business logic mixes with views as app grows
- Hard to test (views contain logic)
- No clear dependency management strategy
- Doesn't scale well beyond simple apps
- Can lead to massive view files

**Current status:** Apple's default approach, actively recommended for simple apps

**Learning curve:** Easy - just use SwiftUI's built-in patterns

```swift
// Simple counter app with no explicit architecture
struct ContentView: View {
    @State private var count = 0
    @State private var items: [Item] = []

    var body: some View {
        VStack {
            Text("Count: \(count)")
            Button("Increment") {
                count += 1
            }

            List(items) { item in
                Text(item.name)
            }
        }
        .task {
            items = try? await fetchItems()
        }
    }

    // Business logic embedded in view
    private func fetchItems() async throws -> [Item] {
        let url = URL(string: "https://api.example.com/items")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([Item].self, from: data)
    }
}
```
</option>

<option name="MVVM with @Observable">
**When to use:** Medium to large apps, apps requiring extensive testing, teams familiar with MVVM, apps with complex business logic

**Strengths:**
- Clear separation between UI (View) and logic (ViewModel)
- Highly testable - ViewModels are plain Swift classes
- Industry standard pattern - team members likely know it
- Works well with dependency injection
- @Observable (iOS 17+) provides better performance than ObservableObject
- Scalable to large codebases

**Weaknesses:**
- More boilerplate than native SwiftUI approach
- MVVM conflicts with SwiftData's @Query requirements
- Can lead to massive ViewModels if not disciplined
- Requires iOS 17+ for @Observable benefits

**Current status:** Actively used, transitioning from ObservableObject to @Observable

**Learning curve:** Medium - familiar to many developers

```swift
// Model
struct User: Identifiable, Codable {
    let id: UUID
    let name: String
    let email: String
}

// ViewModel using @Observable (iOS 17+)
import Observation

@Observable
@MainActor
class UserListViewModel {
    var users: [User] = []
    var isLoading = false
    var errorMessage: String?

    private let userService: UserServiceProtocol

    init(userService: UserServiceProtocol = UserService()) {
        self.userService = userService
    }

    func loadUsers() async {
        isLoading = true
        errorMessage = nil

        do {
            users = try await userService.fetchUsers()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func deleteUser(_ user: User) async {
        do {
            try await userService.deleteUser(user.id)
            users.removeAll { $0.id == user.id }
        } catch {
            errorMessage = "Failed to delete user"
        }
    }
}

// View
struct UserListView: View {
    @State private var viewModel = UserListViewModel()

    var body: some View {
        List {
            ForEach(viewModel.users) { user in
                UserRowView(user: user)
            }
            .onDelete { indexSet in
                Task {
                    for index in indexSet {
                        await viewModel.deleteUser(viewModel.users[index])
                    }
                }
            }
        }
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
        .alert("Error", isPresented: .constant(viewModel.errorMessage != nil)) {
            Button("OK") { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .task {
            await viewModel.loadUsers()
        }
    }
}

// Service protocol for dependency injection
protocol UserServiceProtocol {
    func fetchUsers() async throws -> [User]
    func deleteUser(_ id: UUID) async throws
}

class UserService: UserServiceProtocol {
    func fetchUsers() async throws -> [User] {
        let url = URL(string: "https://api.example.com/users")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([User].self, from: data)
    }

    func deleteUser(_ id: UUID) async throws {
        let url = URL(string: "https://api.example.com/users/\(id)")!
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        _ = try await URLSession.shared.data(for: request)
    }
}
```
</option>

<option name="The Composable Architecture (TCA)">
**When to use:** Complex apps with heavy state management, apps requiring time-travel debugging, teams prioritizing testability, apps with complex navigation flows

**Strengths:**
- Unidirectional data flow makes state changes predictable
- Exceptional testability - reducer tests are pure functions
- Built-in support for effects and dependencies
- Time-travel debugging capabilities
- Strong composition story for large features
- Stack-based and tree-based navigation support
- @Shared macro for state sharing across features

**Weaknesses:**
- Steep learning curve - requires learning reducers, stores, actions
- More boilerplate than MVVM or native approaches
- Can feel over-engineered for simple features
- External dependency (not Apple-provided)
- Scaling issues reported in very large multi-team apps

**Current status:** Version 1.13+ (actively maintained by Point-Free, 2024)

**Learning curve:** Hard - Redux concepts unfamiliar to many iOS developers

```swift
import ComposableArchitecture

// Feature definition
@Reducer
struct UserList {
    @ObservableState
    struct State {
        var users: [User] = []
        var isLoading = false
        var errorMessage: String?
    }

    enum Action {
        case loadUsers
        case usersResponse(Result<[User], Error>)
        case deleteUser(User)
        case deleteUserResponse(Result<Void, Error>)
    }

    @Dependency(\.userClient) var userClient

    var body: some Reducer<State, Action> {
        Reduce { state, action in
            switch action {
            case .loadUsers:
                state.isLoading = true
                state.errorMessage = nil
                return .run { send in
                    await send(.usersResponse(
                        Result { try await userClient.fetchUsers() }
                    ))
                }

            case let .usersResponse(.success(users)):
                state.isLoading = false
                state.users = users
                return .none

            case let .usersResponse(.failure(error)):
                state.isLoading = false
                state.errorMessage = error.localizedDescription
                return .none

            case let .deleteUser(user):
                return .run { send in
                    await send(.deleteUserResponse(
                        Result { try await userClient.deleteUser(user.id) }
                    ))
                }

            case .deleteUserResponse(.success):
                return .none

            case let .deleteUserResponse(.failure(error)):
                state.errorMessage = "Failed to delete user"
                return .none
            }
        }
    }
}

// View
struct UserListView: View {
    let store: StoreOf<UserList>

    var body: some View {
        List {
            ForEach(store.users) { user in
                UserRowView(user: user)
            }
            .onDelete { indexSet in
                for index in indexSet {
                    store.send(.deleteUser(store.users[index]))
                }
            }
        }
        .overlay {
            if store.isLoading {
                ProgressView()
            }
        }
        .alert(
            "Error",
            isPresented: .constant(store.errorMessage != nil)
        ) {
            Button("OK") { }
        } message: {
            Text(store.errorMessage ?? "")
        }
        .task {
            store.send(.loadUsers)
        }
    }
}

// Dependency client
struct UserClient {
    var fetchUsers: () async throws -> [User]
    var deleteUser: (UUID) async throws -> Void
}

extension UserClient: DependencyKey {
    static let liveValue = UserClient(
        fetchUsers: {
            let url = URL(string: "https://api.example.com/users")!
            let (data, _) = try await URLSession.shared.data(from: url)
            return try JSONDecoder().decode([User].self, from: data)
        },
        deleteUser: { id in
            let url = URL(string: "https://api.example.com/users/\(id)")!
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            _ = try await URLSession.shared.data(for: request)
        }
    )
}

extension DependencyValues {
    var userClient: UserClient {
        get { self[UserClient.self] }
        set { self[UserClient.self] = newValue }
    }
}
```
</option>

<option name="Clean Architecture with Feature Modules">
**When to use:** Large apps with multiple teams, apps expecting significant future growth, apps requiring strong architectural boundaries, enterprise applications

**Strengths:**
- Enforces clear separation of layers (Presentation, Domain, Data)
- Modules can be developed and tested independently
- Faster build times (only changed modules rebuild)
- Strong architectural boundaries prevent tangled dependencies
- Works well with Swift Package Manager
- Teams can work on features autonomously
- Easy to remove entire features (just delete the package)

**Weaknesses:**
- Significant upfront architectural investment
- Can be over-engineering for small teams or apps
- Requires discipline to maintain boundaries
- More complex dependency management

**Current status:** Industry best practice for large-scale apps (2024)

**Learning curve:** Hard - requires understanding of layers, boundaries, and modularization

```swift
// Domain Layer (Core business logic - no framework dependencies)
// Package: Domain

struct User: Identifiable {
    let id: UUID
    let name: String
    let email: String
}

protocol UserRepositoryProtocol {
    func fetchUsers() async throws -> [User]
    func deleteUser(_ id: UUID) async throws
}

// Data Layer (Infrastructure - API, database, etc.)
// Package: Data

import Foundation

public class UserRepository: UserRepositoryProtocol {
    private let apiClient: APIClient

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    public func fetchUsers() async throws -> [User] {
        let dtos: [UserDTO] = try await apiClient.get("/users")
        return dtos.map { $0.toDomain() }
    }

    public func deleteUser(_ id: UUID) async throws {
        try await apiClient.delete("/users/\(id)")
    }
}

struct UserDTO: Codable {
    let id: UUID
    let name: String
    let email: String

    func toDomain() -> User {
        User(id: id, name: name, email: email)
    }
}

// Presentation Layer (Feature module)
// Package: Features/UserList

import SwiftUI
import Observation
import Domain

@Observable
@MainActor
public class UserListViewModel {
    var users: [User] = []
    var isLoading = false
    var errorMessage: String?

    private let userRepository: UserRepositoryProtocol

    public init(userRepository: UserRepositoryProtocol) {
        self.userRepository = userRepository
    }

    func loadUsers() async {
        isLoading = true
        do {
            users = try await userRepository.fetchUsers()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

public struct UserListView: View {
    @State private var viewModel: UserListViewModel

    public init(viewModel: UserListViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        List(viewModel.users) { user in
            Text(user.name)
        }
        .task {
            await viewModel.loadUsers()
        }
    }
}

// App Layer (Composition root)
// Package: App

import SwiftUI

@main
struct MyApp: App {
    // Dependency container
    private let container = DependencyContainer()

    var body: some Scene {
        WindowGroup {
            UserListView(
                viewModel: container.makeUserListViewModel()
            )
        }
    }
}

class DependencyContainer {
    private lazy var apiClient = APIClient(baseURL: "https://api.example.com")

    private lazy var userRepository: UserRepositoryProtocol = {
        UserRepository(apiClient: apiClient)
    }()

    func makeUserListViewModel() -> UserListViewModel {
        UserListViewModel(userRepository: userRepository)
    }
}
```
</option>
</options>

<decision_tree>
## Choosing the Right Approach

**If building a simple app (under 10 screens, minimal business logic):** Use SwiftUI Native because architectural overhead isn't justified and SwiftUI's built-in patterns are sufficient.

**If using SwiftData extensively:** Use SwiftUI Native or consider Clean Architecture. Avoid MVVM because @Query requires views to manage data directly, conflicting with ViewModel patterns.

**If you need testability and moderate complexity (10-30 screens):** Use MVVM with @Observable because it provides clean separation, is industry-standard, and offers excellent testability with minimal overhead.

**If you have complex state management, navigation, or side effects:** Consider The Composable Architecture because its unidirectional data flow and built-in effect handling excel at managing complexity.

**If building a large app with multiple teams:** Use Clean Architecture with Feature Modules because it enforces boundaries, enables parallel development, and improves build times through modularization.

**If team is unfamiliar with iOS architectures:** Start with MVVM because it's the most widely understood pattern and has abundant learning resources.

**If prototyping or validating product-market fit:** Use SwiftUI Native because you can ship fastest and refactor to MVVM or Clean Architecture later when requirements stabilize.

**Default recommendation:** MVVM with @Observable for most production apps because it balances simplicity, testability, and scalability. Migrate to Clean Architecture with modules only when team size or app complexity demands it.

**Avoid MVVM when:** Using SwiftData heavily, or building very simple apps where the architectural overhead slows development without providing value.

**Avoid TCA when:** Team lacks Redux experience, building simple CRUD apps, or working in large multi-team environments where TCA's scaling limitations may surface.
</decision_tree>

<patterns>
## Common Patterns

<pattern name="Dependency Injection with Factory">
**Use when:** Need compile-time safe dependency injection without manual container setup

Factory is the current recommended DI library for Swift (2024). Import the library as "FactoryKit" to avoid naming conflicts.

**Implementation:**
```swift
// 1. Install Factory via SPM
// https://github.com/hmlongco/Factory
// Add package, select "FactoryKit" library

// 2. Define container with factories
import FactoryKit

extension Container {
    var apiClient: Factory<APIClient> {
        Factory(self) { APIClient(baseURL: "https://api.example.com") }
    }

    var userRepository: Factory<UserRepositoryProtocol> {
        Factory(self) { UserRepository(apiClient: self.apiClient()) }
    }

    var userListViewModel: Factory<UserListViewModel> {
        Factory(self) {
            UserListViewModel(userRepository: self.userRepository())
        }
            .scope(.shared) // Singleton if needed
    }
}

// 3. Inject in ViewModels using @Injected
@Observable
@MainActor
class UserListViewModel {
    @ObservationIgnored @Injected(\.userRepository)
    private var userRepository: UserRepositoryProtocol

    var users: [User] = []

    func loadUsers() async {
        users = try await userRepository.fetchUsers()
    }
}

// 4. Inject in Views using @Injected
struct UserListView: View {
    @State private var viewModel = Container.shared.userListViewModel()

    var body: some View {
        List(viewModel.users) { user in
            Text(user.name)
        }
    }
}

// 5. Override for testing
extension Container {
    var mockUserRepository: Factory<UserRepositoryProtocol> {
        Factory(self) { MockUserRepository() }
    }
}
```

**Considerations:**
- Use @ObservationIgnored for @Injected properties inside @Observable classes
- Factory 2.5+ supports Swift 6 strict concurrency
- Scopes: .singleton, .shared, .cached, .graph, .unique
- Register mock factories in test targets for easy testing
</pattern>

<pattern name="Environment-Based Dependency Injection">
**Use when:** Need SwiftUI-native dependency injection without external libraries

**Implementation:**
```swift
// 1. Define dependency key
struct UserRepositoryKey: EnvironmentKey {
    static let defaultValue: UserRepositoryProtocol = UserRepository()
}

extension EnvironmentValues {
    var userRepository: UserRepositoryProtocol {
        get { self[UserRepositoryKey.self] }
        set { self[UserRepositoryKey.self] = newValue }
    }
}

// 2. Provide dependency at app root
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.userRepository, UserRepository())
        }
    }
}

// 3. Inject in ViewModels
@Observable
@MainActor
class UserListViewModel {
    var users: [User] = []
    private let userRepository: UserRepositoryProtocol

    init(userRepository: UserRepositoryProtocol) {
        self.userRepository = userRepository
    }

    func loadUsers() async {
        users = try await userRepository.fetchUsers()
    }
}

// 4. Access in Views
struct UserListView: View {
    @Environment(\.userRepository) private var userRepository
    @State private var viewModel: UserListViewModel

    init() {
        // Can't access @Environment in init - use onAppear workaround
        _viewModel = State(initialValue: UserListViewModel(
            userRepository: UserRepository() // temporary
        ))
    }

    var body: some View {
        List(viewModel.users) { user in
            Text(user.name)
        }
        .onAppear {
            // Replace with environment-injected dependency
            viewModel = UserListViewModel(userRepository: userRepository)
            Task { await viewModel.loadUsers() }
        }
    }
}
```

**Considerations:**
- SwiftUI-native approach (no external dependencies)
- Can't access @Environment in init - requires workaround
- Better for simple apps; Factory scales better for complex DI
</pattern>

<pattern name="Repository Pattern for Data Access">
**Use when:** Abstracting data sources (API, database, cache) from business logic

**Implementation:**
```swift
// Protocol in Domain layer
protocol UserRepositoryProtocol {
    func fetchUsers() async throws -> [User]
    func getUser(id: UUID) async throws -> User
    func saveUser(_ user: User) async throws
    func deleteUser(id: UUID) async throws
}

// Implementation in Data layer
class UserRepository: UserRepositoryProtocol {
    private let apiClient: APIClient
    private let cache: CacheService

    init(apiClient: APIClient, cache: CacheService) {
        self.apiClient = apiClient
        self.cache = cache
    }

    func fetchUsers() async throws -> [User] {
        // Check cache first
        if let cached: [User] = cache.get(key: "users") {
            return cached
        }

        // Fetch from API
        let dtos: [UserDTO] = try await apiClient.get("/users")
        let users = dtos.map { $0.toDomain() }

        // Update cache
        cache.set(key: "users", value: users)

        return users
    }

    func getUser(id: UUID) async throws -> User {
        let dto: UserDTO = try await apiClient.get("/users/\(id)")
        return dto.toDomain()
    }

    func saveUser(_ user: User) async throws {
        let dto = UserDTO(from: user)
        try await apiClient.post("/users", body: dto)

        // Invalidate cache
        cache.remove(key: "users")
    }

    func deleteUser(id: UUID) async throws {
        try await apiClient.delete("/users/\(id)")
        cache.remove(key: "users")
    }
}

// DTO for API mapping
struct UserDTO: Codable {
    let id: UUID
    let name: String
    let email: String

    func toDomain() -> User {
        User(id: id, name: name, email: email)
    }

    init(from user: User) {
        self.id = user.id
        self.name = user.name
        self.email = user.email
    }
}
```

**Considerations:**
- Repository owns caching strategy
- DTOs map between API and domain models
- Protocol enables easy mocking for tests
- Keeps networking details out of ViewModels
</pattern>

<pattern name="Feature Flag Service">
**Use when:** Need to toggle features without app updates

**Implementation:**
```swift
// Feature flag service
@Observable
@MainActor
class FeatureFlagService {
    private(set) var flags: [String: Bool] = [:]

    func isEnabled(_ feature: FeatureFlag) -> Bool {
        flags[feature.rawValue] ?? feature.defaultValue
    }

    func enable(_ feature: FeatureFlag) {
        flags[feature.rawValue] = true
    }

    func disable(_ feature: FeatureFlag) {
        flags[feature.rawValue] = false
    }

    func loadRemoteFlags() async {
        // Fetch from remote config service
        // Update flags dictionary
    }
}

enum FeatureFlag: String {
    case newUserProfile = "new_user_profile"
    case darkModeToggle = "dark_mode_toggle"
    case experimentalSearch = "experimental_search"

    var defaultValue: Bool {
        switch self {
        case .newUserProfile: return false
        case .darkModeToggle: return true
        case .experimentalSearch: return false
        }
    }
}

// Use in views
struct ContentView: View {
    @Environment(\.featureFlags) private var featureFlags

    var body: some View {
        VStack {
            if featureFlags.isEnabled(.newUserProfile) {
                NewUserProfileView()
            } else {
                LegacyUserProfileView()
            }
        }
    }
}

// Environment setup
struct FeatureFlagKey: EnvironmentKey {
    static let defaultValue = FeatureFlagService()
}

extension EnvironmentValues {
    var featureFlags: FeatureFlagService {
        get { self[FeatureFlagKey.self] }
        set { self[FeatureFlagKey.self] = newValue }
    }
}
```

**Considerations:**
- Load remote flags at app startup
- Use @MainActor for thread-safe access
- Feature flags enable A/B testing and gradual rollouts
</pattern>

<pattern name="Coordinator Pattern for Navigation">
**Use when:** Need centralized navigation control separate from views

**Implementation:**
```swift
// Navigation coordinator
@Observable
@MainActor
class AppCoordinator {
    var navigationPath = NavigationPath()
    var presentedSheet: SheetDestination?

    func push(_ destination: Destination) {
        navigationPath.append(destination)
    }

    func pop() {
        navigationPath.removeLast()
    }

    func popToRoot() {
        navigationPath = NavigationPath()
    }

    func present(_ sheet: SheetDestination) {
        presentedSheet = sheet
    }

    func dismiss() {
        presentedSheet = nil
    }
}

enum Destination: Hashable {
    case userDetail(User)
    case settings
    case editProfile
}

enum SheetDestination: Identifiable {
    case addUser
    case filter

    var id: String {
        switch self {
        case .addUser: return "addUser"
        case .filter: return "filter"
        }
    }
}

// Root view with coordinator
struct RootView: View {
    @State private var coordinator = AppCoordinator()

    var body: some View {
        NavigationStack(path: $coordinator.navigationPath) {
            UserListView(coordinator: coordinator)
                .navigationDestination(for: Destination.self) { destination in
                    switch destination {
                    case .userDetail(let user):
                        UserDetailView(user: user, coordinator: coordinator)
                    case .settings:
                        SettingsView(coordinator: coordinator)
                    case .editProfile:
                        EditProfileView(coordinator: coordinator)
                    }
                }
        }
        .sheet(item: $coordinator.presentedSheet) { sheet in
            switch sheet {
            case .addUser:
                AddUserView(coordinator: coordinator)
            case .filter:
                FilterView(coordinator: coordinator)
            }
        }
    }
}

// Views use coordinator for navigation
struct UserListView: View {
    let coordinator: AppCoordinator

    var body: some View {
        List {
            ForEach(users) { user in
                Button(user.name) {
                    coordinator.push(.userDetail(user))
                }
            }
        }
        .toolbar {
            Button("Add") {
                coordinator.present(.addUser)
            }
        }
    }
}
```

**Considerations:**
- Coordinator owns all navigation state
- Testable - can verify navigation logic independently
- Works well with deep linking
- See navigation.md for more patterns
</pattern>
</patterns>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Massive ViewModels">
**Problem:** Putting all feature logic into a single ViewModel class

```swift
// DON'T: Massive ViewModel with 1000+ lines
@Observable
@MainActor
class UserViewModel {
    // User list logic
    var users: [User] = []
    func loadUsers() async { }
    func deleteUser() { }

    // User detail logic
    var selectedUser: User?
    func loadUserDetails() { }

    // Settings logic
    var notificationsEnabled = false
    func saveSettings() { }

    // Profile editing logic
    var editedName = ""
    var editedEmail = ""
    func updateProfile() { }

    // Search logic
    var searchQuery = ""
    var searchResults: [User] = []
    func search() { }

    // ... 900 more lines
}
```

**Why it's bad:**
- Hard to test (must mock entireViewModel for one feature)
- Poor cohesion (unrelated concerns mixed together)
- Difficult to navigate and understand
- High merge conflict risk in teams

**Instead:** Create feature-specific ViewModels

```swift
// DO: Separate ViewModels per feature
@Observable
@MainActor
class UserListViewModel {
    var users: [User] = []
    var isLoading = false

    func loadUsers() async { }
    func deleteUser(_ user: User) { }
}

@Observable
@MainActor
class UserDetailViewModel {
    var user: User
    var isEditing = false

    init(user: User) {
        self.user = user
    }

    func loadDetails() async { }
}

@Observable
@MainActor
class UserSearchViewModel {
    var query = ""
    var results: [User] = []

    func search() async { }
}
```
</anti_pattern>

<anti_pattern name="Using ObservableObject Instead of @Observable">
**Problem:** Still using the old ObservableObject protocol with @Published

```swift
// DON'T: Old ObservableObject pattern (pre-iOS 17)
class UserViewModel: ObservableObject {
    @Published var users: [User] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
}

struct UserListView: View {
    @StateObject private var viewModel = UserViewModel()
    // ...
}
```

**Why it's bad:**
- Worse performance (all @Published changes trigger view updates)
- More boilerplate (@Published everywhere)
- Forces use of @StateObject instead of @State
- Triggers unnecessary view redraws

**Instead:** Use @Observable macro (iOS 17+)

```swift
// DO: Modern @Observable pattern
import Observation

@Observable
@MainActor
class UserViewModel {
    var users: [User] = []
    var isLoading = false
    var errorMessage: String?
}

struct UserListView: View {
    @State private var viewModel = UserViewModel()

    var body: some View {
        // Only redraws when properties accessed in body change
        List(viewModel.users) { user in
            Text(user.name)
        }
    }
}
```

**Migration note:** If supporting iOS 16 or earlier, ObservableObject is still required. Use @Observable for iOS 17+ only projects.
</anti_pattern>

<anti_pattern name="Mixing SwiftData @Query with MVVM">
**Problem:** Trying to use @Query inside a ViewModel

```swift
// DON'T: @Query doesn't work in ViewModels
@Observable
@MainActor
class UserViewModel {
    @Query var users: [User] // ERROR: @Query only works in Views
}
```

**Why it's bad:**
- @Query requires SwiftUI view context
- Creates compile errors
- Forces awkward workarounds

**Instead:** Use @Query directly in views or avoid MVVM with SwiftData

```swift
// DO: Use @Query in views directly
struct UserListView: View {
    @Query(sort: \User.name) private var users: [User]

    var body: some View {
        List(users) { user in
            Text(user.name)
        }
    }
}

// OR: Use ModelContext directly in ViewModel if you need MVVM
@Observable
@MainActor
class UserViewModel {
    private let modelContext: ModelContext
    var users: [User] = []

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func loadUsers() {
        let descriptor = FetchDescriptor<User>(
            sortBy: [SortDescriptor(\User.name)]
        )
        users = (try? modelContext.fetch(descriptor)) ?? []
    }
}
```

**Best approach:** If using SwiftData heavily, prefer SwiftUI Native architecture over MVVM.
</anti_pattern>

<anti_pattern name="Initializing @Observable with @State Incorrectly">
**Problem:** Creating new ViewModel instance on every view redraw

```swift
// DON'T: Creates new instance every redraw
struct UserListView: View {
    @State private var viewModel = UserListViewModel() // Wrong!

    var body: some View {
        List(viewModel.users) { user in
            Text(user.name)
        }
    }
}
```

**Why it seems wrong:** Looks like it creates new instance on every redraw

**Why it's actually correct:** @State caches the instance across redraws. The initializer only runs on first render.

**Key insight:** With @Observable and @State, the apparent anti-pattern is actually the correct pattern. Unlike @StateObject (which requires @escaping closure workaround), @State with @Observable caches the value automatically.

**Still avoid:**
```swift
// DON'T: Creating without @State
struct UserListView: View {
    private let viewModel = UserListViewModel() // Wrong - recreated every time
}

// DON'T: Using @StateObject with @Observable
struct UserListView: View {
    @StateObject private var viewModel = UserListViewModel() // Wrong - use @State
}
```

**Do:**
```swift
// DO: Use @State with @Observable
struct UserListView: View {
    @State private var viewModel = UserListViewModel()
}

// DO: Or inject from parent
struct UserListView: View {
    let viewModel: UserListViewModel
}
```
</anti_pattern>

<anti_pattern name="Passing @Environment to ViewModels in init">
**Problem:** Trying to access @Environment values in view initializer

```swift
// DON'T: Can't access @Environment in init
struct UserListView: View {
    @Environment(\.userRepository) private var userRepository
    @State private var viewModel: UserListViewModel

    init() {
        // ERROR: Can't access userRepository here
        _viewModel = State(initialValue: UserListViewModel(
            userRepository: userRepository
        ))
    }
}
```

**Why it's bad:**
- @Environment not available until view is in the hierarchy
- Causes compile errors or runtime crashes
- Requires awkward workarounds

**Instead:** Use Factory for DI or pass dependencies explicitly

```swift
// DO: Use Factory for clean DI
import FactoryKit

extension Container {
    var userRepository: Factory<UserRepositoryProtocol> {
        Factory(self) { UserRepository() }
    }
}

@Observable
@MainActor
class UserListViewModel {
    @ObservationIgnored @Injected(\.userRepository)
    private var userRepository
}

struct UserListView: View {
    @State private var viewModel = UserListViewModel()
    // userRepository injected automatically by Factory
}

// OR: Pass from parent that has access
struct ParentView: View {
    @Environment(\.userRepository) private var userRepository

    var body: some View {
        UserListView(
            viewModel: UserListViewModel(userRepository: userRepository)
        )
    }
}
```
</anti_pattern>

<anti_pattern name="God Objects / Service Locators">
**Problem:** Creating one massive dependency container that knows about everything

```swift
// DON'T: God object with all dependencies
class AppDependencies {
    let apiClient: APIClient
    let userRepository: UserRepository
    let postRepository: PostRepository
    let authService: AuthService
    let cacheService: CacheService
    let analyticsService: AnalyticsService
    let pushService: PushService
    let locationService: LocationService
    // ... 50 more dependencies

    init() {
        // Complex initialization graph
    }
}

// Passed everywhere
struct UserListView: View {
    let dependencies: AppDependencies
}
```

**Why it's bad:**
- Views depend on entire app graph (not just what they need)
- Hard to test (must construct entire AppDependencies)
- Poor encapsulation
- Merge conflicts on AppDependencies class

**Instead:** Use Factory with containers or inject specific dependencies

```swift
// DO: Factory with automatic resolution
extension Container {
    var userRepository: Factory<UserRepositoryProtocol> {
        Factory(self) { UserRepository(apiClient: self.apiClient()) }
    }
}

@Observable
@MainActor
class UserListViewModel {
    @ObservationIgnored @Injected(\.userRepository)
    private var userRepository // Only knows about userRepository
}

// Or inject specific dependencies
struct UserListView: View {
    @State private var viewModel: UserListViewModel

    init(userRepository: UserRepositoryProtocol) {
        _viewModel = State(initialValue: UserListViewModel(
            userRepository: userRepository
        ))
    }
}
```
</anti_pattern>
</anti_patterns>

<project_structure>
## Recommended Project Structure

### Small Apps (5-15 screens, single developer)

```
MyApp/
├── MyApp.swift                 # @main App entry point
├── Models/
│   ├── User.swift
│   ├── Post.swift
│   └── Comment.swift
├── Views/
│   ├── UserList/
│   │   ├── UserListView.swift
│   │   └── UserRowView.swift
│   ├── UserDetail/
│   │   └── UserDetailView.swift
│   └── Settings/
│       └── SettingsView.swift
├── ViewModels/                 # If using MVVM
│   ├── UserListViewModel.swift
│   └── UserDetailViewModel.swift
├── Services/
│   ├── APIClient.swift
│   └── CacheService.swift
├── Utilities/
│   ├── Extensions.swift
│   └── Constants.swift
└── Resources/
    ├── Assets.xcassets
    └── Localizable.strings
```

**Key principles:**
- Flat structure with minimal nesting
- Group by feature (UserList, UserDetail) not layer
- ViewModels folder only if using MVVM
- Services for shared business logic

### Medium Apps (15-50 screens, 2-5 developers)

```
MyApp/
├── MyApp.swift
├── App/
│   ├── DependencyContainer.swift
│   └── AppCoordinator.swift
├── Features/
│   ├── Authentication/
│   │   ├── Views/
│   │   │   ├── LoginView.swift
│   │   │   └── SignupView.swift
│   │   ├── ViewModels/
│   │   │   └── AuthViewModel.swift
│   │   └── Models/
│   │       └── AuthState.swift
│   ├── UserList/
│   │   ├── Views/
│   │   │   ├── UserListView.swift
│   │   │   └── UserRowView.swift
│   │   ├── ViewModels/
│   │   │   └── UserListViewModel.swift
│   │   └── Models/
│   │       └── User.swift
│   ├── UserDetail/
│   │   ├── Views/
│   │   ├── ViewModels/
│   │   └── Models/
│   └── Settings/
│       ├── Views/
│       └── ViewModels/
├── Core/
│   ├── Networking/
│   │   ├── APIClient.swift
│   │   ├── Endpoint.swift
│   │   └── NetworkError.swift
│   ├── Persistence/
│   │   └── CacheService.swift
│   ├── Extensions/
│   │   ├── View+Extensions.swift
│   │   └── String+Extensions.swift
│   └── UI/
│       ├── LoadingView.swift
│       └── ErrorView.swift
└── Resources/
    ├── Assets.xcassets
    └── Localizable.strings
```

**Key principles:**
- Features folder with clear feature modules
- Each feature has Views/ViewModels/Models subfolders
- Core folder for shared infrastructure
- App folder for composition root
- Still single-target Xcode project

### Large Apps (50+ screens, 5+ developers, multi-platform)

Use Swift Package Manager with modular architecture:

```
MyApp/
├── App/
│   ├── MyApp/
│   │   ├── MyApp.swift
│   │   ├── DependencyContainer.swift
│   │   └── AppCoordinator.swift
│   └── MyApp.xcodeproj
├── Packages/
│   ├── Domain/
│   │   ├── Package.swift
│   │   └── Sources/Domain/
│   │       ├── Models/
│   │       │   ├── User.swift
│   │       │   └── Post.swift
│   │       └── Repositories/
│   │           ├── UserRepositoryProtocol.swift
│   │           └── PostRepositoryProtocol.swift
│   ├── Data/
│   │   ├── Package.swift
│   │   └── Sources/Data/
│   │       ├── Repositories/
│   │       │   ├── UserRepository.swift
│   │       │   └── PostRepository.swift
│   │       ├── Networking/
│   │       │   ├── APIClient.swift
│   │       │   └── DTOs/
│   │       └── Persistence/
│   │           └── CoreDataStack.swift
│   ├── FeatureUserList/
│   │   ├── Package.swift
│   │   └── Sources/FeatureUserList/
│   │       ├── Views/
│   │       │   ├── UserListView.swift
│   │       │   └── UserRowView.swift
│   │       └── ViewModels/
│   │           └── UserListViewModel.swift
│   ├── FeatureUserDetail/
│   │   ├── Package.swift
│   │   └── Sources/FeatureUserDetail/
│   │       └── ...
│   ├── FeatureSettings/
│   │   ├── Package.swift
│   │   └── Sources/FeatureSettings/
│   │       └── ...
│   ├── CoreUI/
│   │   ├── Package.swift
│   │   └── Sources/CoreUI/
│   │       ├── Components/
│   │       │   ├── LoadingView.swift
│   │       │   └── ErrorView.swift
│   │       ├── Extensions/
│   │       └── Theme/
│   └── CoreUtilities/
│       ├── Package.swift
│       └── Sources/CoreUtilities/
│           ├── Extensions/
│           └── Logging/
└── Tests/
    ├── DomainTests/
    ├── DataTests/
    ├── FeatureUserListTests/
    └── ...
```

**Package.swift example (FeatureUserList):**
```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FeatureUserList",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(
            name: "FeatureUserList",
            targets: ["FeatureUserList"]
        ),
    ],
    dependencies: [
        .package(path: "../Domain"),
        .package(path: "../CoreUI"),
    ],
    targets: [
        .target(
            name: "FeatureUserList",
            dependencies: [
                "Domain",
                "CoreUI",
            ]
        ),
        .testTarget(
            name: "FeatureUserListTests",
            dependencies: ["FeatureUserList"]
        ),
    ]
)
```

**Dependency hierarchy (bottom to top):**
```
App (top level - depends on everything)
├── Feature modules (depend on Domain, CoreUI, CoreUtilities)
├── Data (depends on Domain)
├── Domain (no dependencies - pure Swift)
├── CoreUI (depends on CoreUtilities)
└── CoreUtilities (no dependencies - pure Swift)
```

**Key principles:**
- Features are isolated SPM packages
- Each package can be opened and worked on independently
- Faster builds (only changed packages rebuild)
- Domain layer has no framework dependencies (pure Swift)
- Data layer implements Domain protocols
- Features depend only on Domain (not on each other)
- App layer composes everything

**Benefits:**
- Teams work on separate packages with minimal conflicts
- Removing features = delete package folder
- Faster SwiftUI previews (don't build unrelated code)
- Enforced architectural boundaries via dependencies
- Testable in isolation

**When to modularize:**
- More than 50 screens
- More than 5 developers
- Multiple platforms (iOS, macOS, watchOS)
- When build times exceed 2-3 minutes
</project_structure>

## Sources

- [Hacking with Swift: MVVM in SwiftUI](https://www.hackingwithswift.com/books/ios-swiftui/introducing-mvvm-into-your-swiftui-project)
- [Medium: Modern MVVM in SwiftUI 2025](https://medium.com/@minalkewat/modern-mvvm-in-swiftui-2025-the-clean-architecture-youve-been-waiting-for-72a7d576648e)
- [SwiftLee: MVVM Architectural Pattern](https://www.avanderlee.com/swiftui/mvvm-architectural-coding-pattern-to-structure-views/)
- [Medium: SwiftUI in 2025 - Forget MVVM](https://dimillian.medium.com/swiftui-in-2025-forget-mvvm-262ff2bbd2ed)
- [Alexey Naumov: Clean Architecture for SwiftUI](https://nalexn.github.io/clean-architecture-swiftui/)
- [Medium: 2025's Best SwiftUI Architecture](https://medium.com/@minalkewat/2025s-best-swiftui-architecture-mvvm-clean-feature-modules-3a369a22858c)
- [GitHub: Clean Architecture SwiftUI](https://github.com/nalexn/clean-architecture-swiftui)
- [Medium: MVVM with Organized Folder Structures](https://medium.com/@rogeriocpires_128/implementing-mvvm-in-swiftui-with-organized-folder-structures-bc86845eead8)
- [mokacoding: Dependency Injection in SwiftUI](https://mokacoding.com/blog/swiftui-dependency-injection/)
- [Lucas van Dongen: Managing Dependencies in SwiftUI](https://lucasvandongen.dev/dependency_injection_swift_swiftui.php)
- [GitHub: Factory - Swift Dependency Injection](https://github.com/hmlongco/Factory)
- [Jesse Squires: @Observable Macro Deep Dive](https://www.jessesquires.com/blog/2024/09/09/swift-observable-macro/)
- [SwiftLee: @Observable Performance](https://www.avanderlee.com/swiftui/observable-macro-performance-increase-observableobject/)
- [Apple: Migrating to @Observable](https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro)
- [Donny Wals: @Observable Explained](https://www.donnywals.com/observable-in-swiftui-explained/)
- [Nimble: Modularizing iOS Apps with SwiftUI and SPM](https://nimblehq.co/blog/modern-approach-modularize-ios-swiftui-spm)
- [Medium: Building Large-Scale Apps with SwiftUI](https://azamsharp.medium.com/building-large-scale-apps-with-swiftui-a-guide-to-modular-architecture-9c967be13001)
- [Medium: Modular SwiftUI Architecture](https://medium.com/@pavel-holec/swiftui-modular-architecture-9bb1647b70b8)
- [Better Programming: Factory Dependency Injection](https://betterprogramming.pub/factory-swift-dependency-injection-14da9b2b5d09)
- [Lucas van Dongen: DI Frameworks Compared](https://lucasvandongen.dev/di_frameworks_compared.php)
- [Medium: App vs Scene Protocol](https://medium.com/@ksjadhav2699/swiftui-app-vs-scene-protocol-1022e655a1fc)
- [Swift with Majid: Managing App in SwiftUI](https://swiftwithmajid.com/2020/08/19/managing-app-in-swiftui/)
- [GitHub: Swift Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture)
- [InfoQ: Swift Composable Architecture](https://www.infoq.com/news/2024/08/swift-composable-architecture/)
- [Rod Schmidt: TCA 3 Year Experience](https://rodschmidt.com/posts/composable-architecture-experience/)
