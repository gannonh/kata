<overview>
SwiftUI networking in 2025 is built around Swift's structured concurrency (async/await) with the @Observable macro for state management. Combine is primarily used for specialized reactive scenarios.

**When to use async/await:**
- Loading data when views appear (.task modifier)
- Sequential API calls with dependencies
- Error handling with do-catch
- Any new code requiring async operations

**When Combine is still useful:**
- Complex reactive pipelines (debouncing, throttling)
- Form validation with multiple interdependent fields
- Real-time data streams (websockets, timers)

**Core principle:** Use async/await by default. Add Combine only when reactive operators provide clear value.
</overview>

<task_modifier>
## The .task Modifier

**Basic usage:**
```swift
struct ArticleView: View {
    @State private var article: Article?
    let articleID: String

    var body: some View {
        content
            .task {
                article = try? await fetchArticle(id: articleID)
            }
    }
}
```

**With dependency (.task(id:)):**
```swift
struct SearchView: View {
    @State private var query = ""
    @State private var results: [Result] = []

    var body: some View {
        List(results) { result in Text(result.name) }
            .searchable(text: $query)
            .task(id: query) {
                guard !query.isEmpty else { return }
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                results = (try? await search(query: query)) ?? []
            }
    }
}
```

**Key behaviors:**
- Runs when view appears
- Auto-cancels on view disappear
- .task(id:) restarts when dependency changes
</task_modifier>

<async_await_patterns>
## Async/Await Patterns

**Loading with @Observable:**
```swift
@Observable
@MainActor
class ArticleViewModel {
    private(set) var state: LoadingState<Article> = .idle

    func load(id: String) async {
        state = .loading
        do {
            let article = try await apiClient.fetchArticle(id: id)
            state = .loaded(article)
        } catch is CancellationError {
            // Don't update state
        } catch {
            state = .failed(error)
        }
    }
}
```

**Parallel calls:**
```swift
func loadProfile(id: String) async throws -> Profile {
    let user = try await fetchUser(id: id)
    async let posts = fetchPosts(userID: user.id)
    async let followers = fetchFollowers(userID: user.id)
    return Profile(user: user, posts: try await posts, followers: try await followers)
}
```
</async_await_patterns>

<api_client_design>
## API Client Architecture

```swift
protocol APIClient {
    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T
}

@MainActor
final class ProductionAPIClient: APIClient {
    private let baseURL: URL
    private let session: URLSession

    func request<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        let request = try buildRequest(endpoint)
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}
```
</api_client_design>

<loading_states>
## Loading States

```swift
enum LoadingState<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(Error)

    var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}

struct AsyncContentView<Value, Content: View>: View {
    let state: LoadingState<Value>
    let retry: () async -> Void
    @ViewBuilder let content: (Value) -> Content

    var body: some View {
        switch state {
        case .idle: Color.clear
        case .loading: ProgressView()
        case .loaded(let value): content(value)
        case .failed(let error):
            ContentUnavailableView("Error", systemImage: "exclamationmark.triangle", description: Text(error.localizedDescription))
        }
    }
}
```
</loading_states>

<error_handling>
## Error Handling & Retry

**Basic retry:**
```swift
func fetchWithRetry<T>(maxRetries: Int = 3, operation: () async throws -> T) async throws -> T {
    var lastError: Error?
    for attempt in 0..<maxRetries {
        do {
            return try await operation()
        } catch {
            lastError = error
            if error is CancellationError { throw error }
            if attempt < maxRetries - 1 {
                try await Task.sleep(for: .seconds(pow(2, Double(attempt))))
            }
        }
    }
    throw lastError!
}
```
</error_handling>

<decision_tree>
## Choosing the Right Approach

**Tied to view lifecycle?** → .task or .task(id:)
**User-triggered?** → Wrap in explicit Task {}
**Need reactive operators?** → Combine
**Loading data?** → Use LoadingState enum
**Sequential calls?** → async/await naturally
**Parallel calls?** → async let or TaskGroup
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Ignoring CancellationError">
**Problem:** Showing error UI when task is cancelled
**Instead:** Catch CancellationError separately, don't update state
</anti_pattern>

<anti_pattern name="Task in .task">
**Problem:** Task { await loadData() } inside .task
**Instead:** .task already creates a Task
</anti_pattern>

<anti_pattern name="Missing @MainActor">
**Problem:** View model updates from background thread
**Instead:** Mark @Observable view models with @MainActor
</anti_pattern>

<anti_pattern name="ObservableObject for new code">
**Problem:** Using ObservableObject/@Published
**Instead:** Use @Observable macro (iOS 17+)
</anti_pattern>
</anti_patterns>
