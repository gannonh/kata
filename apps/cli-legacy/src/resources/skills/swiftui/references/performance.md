# SwiftUI Performance Reference

<overview>
SwiftUI's declarative, data-driven architecture provides automatic UI updates, but this comes with performance implications. Understanding the update cycle, view identity, and optimization strategies enables building responsive apps.

**Core Performance Model:**

1. **State Change**: A property wrapped with @State, @Observable, or similar changes
2. **Body Recomputation**: SwiftUI evaluates the view's body property
3. **Diffing**: SwiftUI compares new view hierarchy against previous
4. **Minimal Updates**: Only changed parts render to screen via Core Animation

**Key Principle**: SwiftUI only recomputes body when dependency values change. Mastering what triggers recomputation and how to minimize it is essential for performance.

**Performance Philosophy**: Profile before optimizing. SwiftUI includes automatic optimizations. Only intervene when profiling identifies actual bottlenecks. Premature optimization adds complexity without benefit.
</overview>

<view_identity>
**View Identity** determines how SwiftUI tracks views across updates. Identity affects state preservation, transitions, and performance.

## Two Types of Identity

### Structural Identity

SwiftUI identifies views by their position in the view hierarchy. Most common form of identity.

```swift
// Structural identity - views identified by position
VStack {
    Text("First")   // Identity: VStack > position 0
    Text("Second")  // Identity: VStack > position 1
}

// Problematic: branches change structural identity
if isLoggedIn {
    ProfileView()  // Identity: if branch > ProfileView
} else {
    LoginView()    // Identity: else branch > LoginView
}
```

**Best Practice**: Prefer conditional modifiers over branches to preserve identity:

```swift
// Bad - changes structural identity, loses state
if isExpanded {
    DetailView(expanded: true)
} else {
    DetailView(expanded: false)
}

// Good - preserves structural identity
DetailView(expanded: isExpanded)
```

### Explicit Identity

Use the `.id()` modifier to explicitly control identity. SwiftUI treats views with different IDs as completely distinct.

```swift
// Force view recreation by changing ID
ScrollView {
    ContentView()
        .id(selectedCategory) // New ID = destroy and recreate
}

// List items use Identifiable for explicit identity
struct Item: Identifiable {
    let id: UUID
    let name: String
}

List(items) { item in
    Text(item.name)  // SwiftUI tracks by item.id
}
```

**When to Use .id()**:

- Reset view state (form after submission, scroll position)
- Force view recreation when data fundamentally changes
- Ensure transitions work correctly

**Performance Impact**: Changing a view's ID destroys the old view and creates a new one, discarding all state. Expensive operation - use judiciously.

## Identity and State Preservation

SwiftUI maintains @State values as long as view identity remains stable:

```swift
struct CounterView: View {
    @State private var count = 0  // Preserved while identity stable

    var body: some View {
        VStack {
            Text("Count: \(count)")
            Button("Increment") { count += 1 }
        }
    }
}

// Branching destroys identity and @State
if showCounter {
    CounterView()  // count resets to 0 when toggled
}

// Better: preserve identity with opacity/hidden
CounterView()
    .opacity(showCounter ? 1 : 0)  // State preserved
```

## Debugging Identity

Use `Self._printChanges()` to see what triggers body recomputation:

```swift
var body: some View {
    let _ = Self._printChanges()  // Xcode console shows changed properties

    VStack {
        Text("Content")
    }
}
```
</view_identity>

<lazy_containers>
**Lazy containers** create views on-demand as they scroll into view, rather than creating all views upfront.

## Lazy Stack Types

```swift
// LazyVStack - vertical scrolling
ScrollView {
    LazyVStack(spacing: 16) {
        ForEach(items) { item in
            ItemRow(item: item)  // Created only when visible
        }
    }
}

// LazyHStack - horizontal scrolling
ScrollView(.horizontal) {
    LazyHStack(spacing: 16) {
        ForEach(items) { item in
            ItemCard(item: item)
        }
    }
}

// LazyVGrid - grid layout
ScrollView {
    LazyVGrid(columns: [
        GridItem(.adaptive(minimum: 150))
    ], spacing: 16) {
        ForEach(items) { item in
            ItemCard(item: item)
        }
    }
}

// LazyHGrid - horizontal grid
ScrollView(.horizontal) {
    LazyHGrid(rows: [
        GridItem(.fixed(100)),
        GridItem(.fixed(100))
    ], spacing: 16) {
        ForEach(items) { item in
            ItemCard(item: item)
        }
    }
}
```

## Performance Characteristics

**Benefits**:
- **Reduced Memory**: 80-90% less memory than non-lazy equivalents for large lists
- **Faster Load**: Milliseconds vs seconds for initial render
- **Smooth Scrolling**: Maintains 60fps even with hundreds of items

**Tradeoffs**:
- Views created lazily incur small bookkeeping overhead
- Once created, views stay in memory (not recycled like UITableView)
- For very large datasets (thousands of items), List provides view recycling

```swift
// Memory comparison for 200 items:
// VStack: ~300MB, 2-3 second load
// LazyVStack: ~40MB, <100ms load
// List: ~40MB with view recycling (better for 1000+ items)
```

## When to Use Lazy Containers

**Use LazyVStack/LazyHStack when**:
- Scrolling list with dozens to hundreds of items
- Items contain images, videos, or heavy views
- Custom animations and transitions required
- ScrollView directly wraps the stack

**Use List when**:
- Thousands of items (view recycling needed)
- Standard list appearance acceptable
- Platform-native behavior desired

**Avoid Lazy when**:
- Small number of items (< 20)
- All views fit on screen without scrolling
- Lazy overhead exceeds benefit (profile first)

```swift
// Decision example
struct ContentView: View {
    let items: [Item]

    var body: some View {
        ScrollView {
            if items.count > 50 {
                // Use lazy for large lists
                LazyVStack {
                    ForEach(items) { ItemRow(item: $0) }
                }
            } else {
                // Regular stack fine for small lists
                VStack {
                    ForEach(items) { ItemRow(item: $0) }
                }
            }
        }
    }
}
```

## Lazy Container Best Practices

**Design Lightweight Views**: Lazy loading doesn't eliminate cost of heavy views.

```swift
// Bad - heavy view defeats lazy loading benefits
struct ItemRow: View {
    let item: Item

    var body: some View {
        VStack {
            AsyncImage(url: item.imageURL) { image in
                image.resizable()  // No size limit - uses full resolution
            } placeholder: {
                ProgressView()
            }
            Text(item.longDescription)  // Renders all text upfront
        }
    }
}

// Good - lightweight view
struct ItemRow: View {
    let item: Item

    var body: some View {
        VStack {
            AsyncImage(url: item.imageURL) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(height: 200)  // Limit size
                    .clipped()
            } placeholder: {
                Color.gray.frame(height: 200)
            }
            Text(item.shortDescription)  // Just what's visible
        }
    }
}
```

**Pinned Views**: Use for sticky headers/footers.

```swift
LazyVStack(pinnedViews: [.sectionHeaders]) {
    ForEach(sections) { section in
        Section {
            ForEach(section.items) { item in
                ItemRow(item: item)
            }
        } header: {
            Text(section.title)
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.gray.opacity(0.2))
        }
    }
}
```
</lazy_containers>

<body_recomputation>
Understanding what triggers body recomputation and how to minimize it is critical for performance.

## What Triggers Body Evaluation

SwiftUI evaluates body when:

1. **@State property changes**: View owns the state
2. **@Binding updates**: Parent changed bound value
3. **@Observable property accessed in body changes**: Fine-grained observation
4. **ObservableObject publishes change**: Any @Published property (not fine-grained)
5. **@Environment value changes**: Environment changed
6. **Parent view recreates child**: Parent's body evaluated with different child value

```swift
struct ProfileView: View {
    @State private var name = "User"      // Change triggers body
    @State private var age = 25           // Change triggers body
    let id: UUID                          // Never changes - no trigger

    var body: some View {
        let _ = Self._printChanges()  // Debug what changed

        VStack {
            Text("Name: \(name)")  // Depends on name
            Text("Age: \(age)")    // Depends on age
        }
    }
}
```

## Minimizing Recomputation

### Extract Subviews

Move stable content into separate views to prevent recomputation:

```swift
// Bad - entire body recomputes on count change
struct ContentView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            ExpensiveHeaderView()      // Recomputes unnecessarily
            Text("Count: \(count)")
            Button("Increment") { count += 1 }
            ExpensiveFooterView()      // Recomputes unnecessarily
        }
    }
}

// Good - isolate expensive views
struct ContentView: View {
    @State private var count = 0

    var body: some View {
        VStack {
            StaticHeader()             // Separate view - stable identity
            CounterDisplay(count: count)  // Only this recomputes
            StaticFooter()             // Separate view - stable identity
        }
    }
}

struct StaticHeader: View {
    var body: some View {
        ExpensiveHeaderView()  // Body only called once
    }
}
```

### Avoid Expensive Computations in Body

```swift
// Bad - recalculates on every body evaluation
struct ListView: View {
    let items: [Item]

    var body: some View {
        let sortedItems = items.sorted { $0.date > $1.date }  // Expensive!
        List(sortedItems) { item in
            Text(item.name)
        }
    }
}

// Good - compute once, cache result
struct ListView: View {
    let items: [Item]

    private var sortedItems: [Item] {
        items.sorted { $0.date > $1.date }
    }

    var body: some View {
        List(sortedItems) { item in
            Text(item.name)
        }
    }
}

// Better - compute outside view if possible
struct ListView: View {
    let sortedItems: [Item]  // Parent sorted once

    var body: some View {
        List(sortedItems) { item in
            Text(item.name)
        }
    }
}
```

### Use Equatable for Custom Comparison

Tell SwiftUI exactly when to recompute by conforming to Equatable:

```swift
struct ItemDetailView: View, Equatable {
    let item: Item
    let metadata: Metadata  // Large, rarely changes

    static func == (lhs: ItemDetailView, rhs: ItemDetailView) -> Bool {
        lhs.item.id == rhs.item.id  // Only recompute if item ID changes
        // Ignores metadata changes
    }

    var body: some View {
        VStack {
            Text(item.name)
            Text(metadata.description)
        }
    }
}

// Use with .equatable() modifier
ParentView {
    ItemDetailView(item: item, metadata: metadata)
        .equatable()  // Uses custom == for comparison
}
```

### Scope Data Sources Appropriately

```swift
// Bad - entire hierarchy recomputes
struct AppView: View {
    @State private var settings = AppSettings()  // Top-level state

    var body: some View {
        NavigationStack {
            ContentView()  // Recomputes when settings change
                .environment(settings)
        }
    }
}

// Good - state lives close to where it's used
struct SettingsButton: View {
    @State private var showSettings = false  // Local state

    var body: some View {
        Button("Settings") { showSettings = true }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
    }
}
```

## Understanding Body Evaluation vs Rendering

**Critical distinction**: Body evaluation ≠ rendering to screen.

```swift
// Body evaluated frequently...
struct CounterView: View {
    @State private var count = 0

    var body: some View {
        // This code runs on every evaluation
        VStack {
            Text("Count: \(count)")  // ...but SwiftUI only renders if text changed
            Button("Increment") { count += 1 }
        }
    }
}
```

SwiftUI evaluates body, then diffs the result. If nothing changed, no rendering occurs. This is why expensive computations hurt even if output is identical.
</body_recomputation>

<observable_performance>
**@Observable** (iOS 17+) provides superior performance compared to ObservableObject through fine-grained change tracking.

## ObservableObject Limitations

```swift
// ObservableObject - coarse-grained updates
class UserSettings: ObservableObject {
    @Published var username = "User"
    @Published var theme = "Light"
    @Published var notifications = true
}

struct ProfileView: View {
    @ObservedObject var settings: UserSettings

    var body: some View {
        VStack {
            Text(settings.username)  // Only reads username...
        }
        // ...but body recomputes when theme or notifications change!
    }
}
```

**Problem**: If ANY @Published property changes, ALL views observing the object recompute, regardless of which properties they actually read.

## @Observable Solution

```swift
// @Observable - fine-grained updates
@Observable
class UserSettings {
    var username = "User"
    var theme = "Light"
    var notifications = true
}

struct ProfileView: View {
    @State var settings: UserSettings

    var body: some View {
        VStack {
            Text(settings.username)  // Only reads username...
        }
        // ...body only recomputes when username changes!
    }
}
```

**Benefit**: Body only evaluates when properties actually accessed in body change. Automatic, compiler-generated tracking.

## Performance Impact

Real-world measurements:

- **80-90% fewer body evaluations** for views reading subset of properties
- **No Combine overhead**: @Observable uses Swift's observation system, not Combine
- **Automatic optimization**: No manual effort to minimize updates

```swift
// Performance comparison
@Observable
class DataStore {
    var items: [Item] = []       // Changes frequently
    var settings: Settings = .default  // Changes rarely
}

struct ItemListView: View {
    @State var store: DataStore

    var body: some View {
        // With ObservableObject: recomputes on settings change (unnecessary)
        // With @Observable: only recomputes on items change (correct)
        List(store.items) { item in
            ItemRow(item: item)
        }
    }
}
```

## Migration Guidelines

**Use @Observable for new code**. It's simpler and faster:

```swift
// Old pattern - remove
class ViewModel: ObservableObject {
    @Published var name = ""
    @Published var count = 0
}

struct OldView: View {
    @StateObject private var viewModel = ViewModel()  // ObservableObject
}

// New pattern - use
@Observable
class ViewModel {
    var name = ""
    var count = 0
}

struct NewView: View {
    @State private var viewModel = ViewModel()  // @Observable
}
```

**Key differences**:

1. No ObservableObject conformance
2. No @Published wrapper
3. Use @State (not @StateObject) for ownership
4. Use @Bindable for bindings

```swift
@Observable
class FormData {
    var name = ""
    var email = ""
}

struct FormView: View {
    @State private var formData = FormData()

    var body: some View {
        Form {
            // Need @Bindable for bindings
            TextField("Name", text: $formData.name)
            TextField("Email", text: $formData.email)
        }
    }
}

// Alternative: @Bindable parameter
struct FormFields: View {
    @Bindable var formData: FormData

    var body: some View {
        Form {
            TextField("Name", text: $formData.name)
            TextField("Email", text: $formData.email)
        }
    }
}
```

## Important: @State Behavior Difference

Critical difference between @StateObject and @State:

```swift
// ObservableObject with @StateObject
class OldModel: ObservableObject {
    init() { print("OldModel init") }
}

struct OldView: View {
    @StateObject private var model = OldModel()
    // Prints "OldModel init" ONCE - @StateObject preserves across view recreations
}

// @Observable with @State
@Observable
class NewModel {
    init() { print("NewModel init") }
}

struct NewView: View {
    @State private var model = NewModel()
    // Prints "NewModel init" on EVERY view recreation!
    // SwiftUI preserves the instance, but re-runs initializer
}
```

**Best practice**: Only use @State for @Observable at the view that creates the instance. Pass to child views without @State:

```swift
struct ParentView: View {
    @State private var model = DataModel()  // Owner uses @State

    var body: some View {
        ChildView(model: model)  // Child receives plain reference
    }
}

struct ChildView: View {
    let model: DataModel  // NOT @State

    var body: some View {
        Text(model.name)  // Still reactive - automatic observation
    }
}
```
</observable_performance>

<images>
Image loading and rendering are common performance bottlenecks. SwiftUI provides AsyncImage for remote images, but requires careful optimization.

## AsyncImage Basics

```swift
// Basic AsyncImage
AsyncImage(url: URL(string: "https://example.com/image.jpg")) { image in
    image
        .resizable()
        .aspectRatio(contentMode: .fill)
} placeholder: {
    ProgressView()
}
```

## Critical Issue: AsyncImage Does Not Cache

**Important**: AsyncImage does NOT cache images between screen loads. Scrolling an image off-screen and back may trigger a new network request.

```swift
// Problem: re-downloads on scroll
ScrollView {
    LazyVStack {
        ForEach(items) { item in
            AsyncImage(url: item.imageURL) { image in
                image.resizable()
            } placeholder: {
                ProgressView()
            }
            // Scrolls off screen -> image released
            // Scrolls back on screen -> downloads again!
        }
    }
}
```

## Solution 1: Configure URLCache

AsyncImage uses URLSession.shared, which respects URLCache. Configure cache size:

```swift
// In @main App init
@main
struct MyApp: App {
    init() {
        // Configure URLCache for AsyncImage
        URLCache.shared.memoryCapacity = 50_000_000   // 50 MB memory
        URLCache.shared.diskCapacity = 1_000_000_000  // 1 GB disk
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

**Limitation**: URLCache respects HTTP cache headers. If server doesn't provide appropriate headers, caching may not work as expected.

## Solution 2: Build Custom Cached AsyncImage

Use NSCache for in-memory caching with custom control:

```swift
// Image cache manager
@Observable
class ImageCache {
    static let shared = ImageCache()
    private var cache = NSCache<NSString, UIImage>()

    func get(url: String) -> UIImage? {
        cache.object(forKey: url as NSString)
    }

    func set(url: String, image: UIImage) {
        cache.setObject(image, forKey: url as NSString)
    }
}

// Cached AsyncImage view
struct CachedAsyncImage<Content: View, Placeholder: View>: View {
    let url: URL?
    let content: (Image) -> Content
    let placeholder: () -> Placeholder

    @State private var image: UIImage?

    var body: some View {
        Group {
            if let image {
                content(Image(uiImage: image))
            } else {
                placeholder()
                    .task {
                        await loadImage()
                    }
            }
        }
    }

    private func loadImage() async {
        guard let url else { return }

        // Check cache first
        if let cached = ImageCache.shared.get(url: url.absoluteString) {
            image = cached
            return
        }

        // Download if not cached
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let downloaded = UIImage(data: data) {
                ImageCache.shared.set(url: url.absoluteString, image: downloaded)
                image = downloaded
            }
        } catch {
            print("Failed to load image: \(error)")
        }
    }
}
```

## Solution 3: Use Third-Party Libraries

For production apps, consider mature image loading libraries:

- **Nuke**: High-performance image loading with aggressive caching
- **Kingfisher**: Feature-rich with SwiftUI support
- **SDWebImage**: Battle-tested, widely used

```swift
// Example with third-party library
import Nuke
import NukeUI

LazyImage(url: item.imageURL) { state in
    if let image = state.image {
        image.resizable().aspectRatio(contentMode: .fill)
    } else {
        ProgressView()
    }
}
```

## Image Sizing Best Practices

**Always specify image dimensions** to prevent SwiftUI from using full resolution:

```swift
// Bad - loads full resolution image
AsyncImage(url: imageURL) { image in
    image.resizable()  // Loads 4K image for 100x100 display
}

// Good - constrains size
AsyncImage(url: imageURL) { image in
    image
        .resizable()
        .aspectRatio(contentMode: .fill)
        .frame(width: 100, height: 100)  // Limits memory usage
        .clipped()
}

// Better - serve appropriately sized images
// Use CDN or server-side resizing to deliver thumbnails, not full resolution
AsyncImage(url: item.thumbnailURL) { image in  // 200x200 version
    image
        .resizable()
        .aspectRatio(contentMode: .fill)
        .frame(width: 100, height: 100)
}
```

## Prefetching for Scrolling

Prefetch images just before they become visible:

```swift
struct OptimizedImageList: View {
    let items: [Item]

    var body: some View {
        ScrollView {
            LazyVStack {
                ForEach(items) { item in
                    CachedAsyncImage(url: item.imageURL) { image in
                        image.resizable()
                    } placeholder: {
                        Color.gray
                    }
                    .onAppear {
                        // Prefetch next items
                        prefetchNextImages(after: item)
                    }
                }
            }
        }
    }

    private func prefetchNextImages(after item: Item) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let nextItems = items.dropFirst(index + 1).prefix(3)

        Task {
            for nextItem in nextItems {
                // Start download without displaying
                _ = try? await URLSession.shared.data(from: nextItem.imageURL)
            }
        }
    }
}
```
</images>

<instruments>
Xcode's Instruments app provides powerful profiling for SwiftUI performance analysis.

## Starting a Profile Session

1. Build in Release mode: Product > Profile (Cmd+I)
2. Select **SwiftUI** template (Xcode 16+) or **Time Profiler** (earlier versions)
3. **Always profile on real device**, never simulator

```bash
# Release mode optimizations match production
# Simulator performance doesn't reflect real device
```

## SwiftUI Instruments Template (Xcode 16+)

The SwiftUI template includes specialized tracks:

### 1. Update Groups Lane

Shows when SwiftUI is performing update work. If CPU spikes when this lane is empty, the bottleneck is outside SwiftUI (networking, data processing, etc.).

### 2. View Body Lane

Tracks how often view body properties are evaluated.

**Key metrics**:
- **Count**: Number of times body evaluated
- **Avg Duration**: Average time per evaluation
- **Total Duration**: Cumulative time

**What to look for**:
- Views with high count but low duration: Unnecessary evaluations (fix with Equatable, extract subviews)
- Views with high duration: Expensive computations in body (move outside body)

### 3. View Properties Lane

Shows every view property change. Property updates are more frequent than body updates (SwiftUI batches multiple property changes into single body update).

**Use to identify**:
- Properties updating more frequently than expected
- Cascading updates from parent to children

### 4. Core Animation Commits Lane

Shows when SwiftUI commits changes to Core Animation for rendering. Expensive commits indicate actual pixel changes on screen.

**Correlation**:
- Many body evaluations + few commits = good (SwiftUI diffing working)
- Many commits = actual rendering work (investigate why so many pixel changes)

### 5. Time Profiler Lane

Shows CPU usage by function. Reveals which code is running and how long.

**How to use**:
1. Record profile session
2. Stop after representative user interaction
3. Look for heavy call stacks
4. Drill into SwiftUI view types to find bottlenecks

## Analyzing Body Evaluations

After profiling, Instruments shows "All Updates Summary":

```swift
// Example summary
ViewType               Count    Avg Duration    Total Duration
------------------------------------------------------------------
ProductListView        456      2.3ms          1,048ms
ProductCard            2,340    0.8ms          1,872ms
HeaderView             1        0.2ms          0.2ms
```

**Interpretation**:
- ProductListView: 456 evaluations in one session is suspicious - should be much fewer
- ProductCard: High count expected (many instances), but 0.8ms average is acceptable
- HeaderView: 1 evaluation is ideal for static content

## Finding Excessive Updates

Use Cmd+1 or select "Summary: All Updates" from jump bar:

```swift
// Views updating the most appear at top
// Click view name -> see what triggered updates
```

Look for:
- Static views updating repeatedly (should be 1-2 times)
- Views updating when dependencies haven't changed
- Cascading updates (parent change triggers all children)

## Debugging with _printChanges()

Combine Instruments with runtime debugging:

```swift
struct ProblematicView: View {
    @State private var count = 0
    @State private var name = "Test"

    var body: some View {
        let _ = Self._printChanges()  // Prints to Xcode console

        VStack {
            Text("Count: \(count)")
            Text("Name: \(name)")
        }
    }
}

// Console output when count changes:
// ProblematicView: @self, @identity, _count changed.
```

## Common Findings and Solutions

| Finding | Cause | Solution |
|---------|-------|----------|
| Header view updates 100+ times | Parent state change | Extract to separate view |
| Image view high duration | Full resolution loading | Constrain frame size |
| List scrolling causes body storm | Expensive row computations | Move computation outside body |
| State changes cause app-wide updates | Top-level state | Move state closer to usage |

## Weekly Profiling Practice

Profile incrementally to catch performance regressions early:

```swift
// Profiling routine
1. Profile baseline before changes
2. Implement feature
3. Profile again
4. Compare metrics
5. Fix regressions before merging
```

Small, consistent profiling catches issues when they're easy to fix, rather than debugging performance problems across large changesets.
</instruments>

<optimization_strategies>
Specific techniques for optimizing SwiftUI performance.

## 1. Task Prioritization with Priority

Control async task priority to keep UI responsive:

```swift
struct DataLoadingView: View {
    @State private var essentialData: [Item] = []
    @State private var optionalData: [Detail] = []

    var body: some View {
        VStack {
            List(essentialData) { item in
                ItemRow(item: item)
            }
        }
        .task(priority: .high) {
            // Load critical data first
            essentialData = await dataStore.loadEssentialData()
        }
        .task(priority: .low) {
            // Load nice-to-have data later
            optionalData = await dataStore.loadOptionalData()
        }
    }
}
```

## 2. Pagination for Large Datasets

Load data in chunks as user scrolls:

```swift
struct PaginatedListView: View {
    @State private var items: [Item] = []
    @State private var page = 1
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            LazyVStack {
                ForEach(items) { item in
                    ItemRow(item: item)
                        .onAppear {
                            loadMoreIfNeeded(currentItem: item)
                        }
                }

                if isLoading {
                    ProgressView()
                }
            }
        }
        .task {
            await loadPage()
        }
    }

    private func loadMoreIfNeeded(currentItem: Item) {
        guard let index = items.firstIndex(where: { $0.id == currentItem.id }) else { return }

        // Load next page when reaching last 5 items
        if index >= items.count - 5 && !isLoading {
            Task {
                await loadPage()
            }
        }
    }

    private func loadPage() async {
        guard !isLoading else { return }
        isLoading = true

        let newItems = await dataStore.loadItems(page: page)
        items.append(contentsOf: newItems)
        page += 1

        isLoading = false
    }
}
```

## 3. Debouncing Expensive Updates

Delay expensive operations while user is typing:

```swift
struct SearchView: View {
    @State private var searchText = ""
    @State private var searchResults: [Item] = []
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        VStack {
            TextField("Search", text: $searchText)
                .onChange(of: searchText) { oldValue, newValue in
                    // Cancel previous search
                    searchTask?.cancel()

                    // Debounce: wait 300ms before searching
                    searchTask = Task {
                        try? await Task.sleep(for: .milliseconds(300))
                        guard !Task.isCancelled else { return }
                        await performSearch(query: newValue)
                    }
                }

            List(searchResults) { result in
                Text(result.name)
            }
        }
    }

    private func performSearch(query: String) async {
        searchResults = await searchService.search(query)
    }
}
```

## 4. Drawing Performance with Canvas

For complex custom drawing, use Canvas instead of GeometryReader and Path:

```swift
// Slow - triggers relayout frequently
struct SlowGraph: View {
    let data: [Double]

    var body: some View {
        GeometryReader { geometry in
            Path { path in
                // Complex path drawing
                for (index, value) in data.enumerated() {
                    let x = CGFloat(index) * geometry.size.width / CGFloat(data.count)
                    let y = geometry.size.height * (1 - CGFloat(value))
                    if index == 0 {
                        path.move(to: CGPoint(x: x, y: y))
                    } else {
                        path.addLine(to: CGPoint(x: x, y: y))
                    }
                }
            }
            .stroke(Color.blue, lineWidth: 2)
        }
    }
}

// Fast - optimized drawing
struct FastGraph: View {
    let data: [Double]

    var body: some View {
        Canvas { context, size in
            var path = Path()
            for (index, value) in data.enumerated() {
                let x = CGFloat(index) * size.width / CGFloat(data.count)
                let y = size.height * (1 - CGFloat(value))
                if index == 0 {
                    path.move(to: CGPoint(x: x, y: y))
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }
            context.stroke(path, with: .color(.blue), lineWidth: 2)
        }
    }
}
```

## 5. Reduce Modifier Overhead

Combine modifiers when possible:

```swift
// Multiple modifier evaluations
Text("Hello")
    .foregroundStyle(.blue)
    .font(.headline)
    .padding()
    .background(.gray)
    .cornerRadius(8)

// Combined where possible - no performance gain in most cases,
// but clearer code. SwiftUI optimizes modifier chains automatically.
// Real optimization: avoid conditional modifiers if value doesn't change.

// Inefficient - creates new modifier on every body evaluation
.opacity(isVisible ? 1.0 : 1.0)  // Condition always results in same value

// Efficient - only apply when needed
.opacity(isVisible ? 1.0 : 0.0)
```

## 6. PreferenceKey for Bottom-Up Communication

Use PreferenceKey instead of @Binding for child-to-parent data flow when performance matters:

```swift
struct SizePreferenceKey: PreferenceKey {
    static var defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        value = nextValue()
    }
}

struct ParentView: View {
    @State private var childSize: CGSize = .zero

    var body: some View {
        VStack {
            Text("Child size: \(childSize.width) x \(childSize.height)")

            ChildView()
                .onPreferenceChange(SizePreferenceKey.self) { size in
                    childSize = size
                }
        }
    }
}

struct ChildView: View {
    var body: some View {
        Text("Hello")
            .background(
                GeometryReader { geometry in
                    Color.clear.preference(
                        key: SizePreferenceKey.self,
                        value: geometry.size
                    )
                }
            )
    }
}
```
</optimization_strategies>

<decision_tree>
When to investigate performance and what to optimize.

## Should You Optimize?

```
Is there a user-facing performance issue?
├─ No → Don't optimize
└─ Yes → Continue

Have you profiled with Instruments?
├─ No → Profile first (never optimize without data)
└─ Yes → Continue

Did profiling identify a specific bottleneck?
├─ No → Issue might not be SwiftUI (check networking, data layer)
└─ Yes → Continue

Is the bottleneck in SwiftUI view updates?
├─ No → Optimize data layer, networking, image loading
└─ Yes → Continue to optimization strategies
```

## Optimization Priority

**1. High Impact, Low Effort**:
- Switch VStack to LazyVStack for long lists
- Configure URLCache for AsyncImage
- Extract static subviews from frequently updating views

**2. High Impact, Medium Effort**:
- Replace ObservableObject with @Observable
- Implement pagination for large datasets
- Add custom Equatable to expensive views

**3. Medium Impact, Low Effort**:
- Debounce text field updates
- Use task priority for non-critical work
- Constrain image sizes with frame modifiers

**4. Medium Impact, High Effort**:
- Build custom cached image loading
- Rewrite complex views to reduce body complexity
- Implement view recycling for very large datasets

**5. Low Priority** (only if profiling shows specific issue):
- Optimize modifier ordering
- Use Canvas for complex drawing
- PreferenceKey instead of Binding

## Red Flags Requiring Optimization

| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| Scrolling stutters | Heavy row views | Profile, use lazy loading, simplify rows |
| Typing lags | Expensive search on every keystroke | Debounce, move work off main thread |
| Navigation slow | Loading all data upfront | Implement pagination, async loading |
| App hangs on launch | Too much work in view init | Move to task, use loading states |
| Memory growing unbounded | Images not releasing | Implement image cache with limits |

## Performance Targets

**Scrolling**: Maintain 60fps (16.67ms per frame)
- Budget ~10ms for SwiftUI updates
- Budget ~6ms for rendering

**Interactions**: Respond within 100ms
- User perceives instant response < 100ms
- 100-300ms feels sluggish
- \> 300ms feels broken

**Launch**: Show content within 1 second
- Use skeleton screens / placeholders
- Load critical content first, optional content later
</decision_tree>

<anti_patterns>
Common performance mistakes and how to avoid them.

## 1. Using @State with Reference Types

**Problem**: @State creates new instance on every view recreation when used with classes.

```swift
// Wrong - creates new instance repeatedly
struct BadView: View {
    @State private var viewModel = ViewModel()  // ViewModel is a class

    var body: some View {
        Text(viewModel.text)
    }
}

// Correct - use @Observable and @State for iOS 17+
@Observable
class ViewModel {
    var text = "Hello"
}

struct GoodView: View {
    @State private var viewModel = ViewModel()

    var body: some View {
        Text(viewModel.text)
    }
}

// Alternative for iOS 16- - use @StateObject with ObservableObject
class LegacyViewModel: ObservableObject {
    @Published var text = "Hello"
}

struct LegacyView: View {
    @StateObject private var viewModel = LegacyViewModel()

    var body: some View {
        Text(viewModel.text)
    }
}
```

## 2. Overusing AnyView

**Problem**: Type erasure prevents SwiftUI from diffing efficiently, forcing complete view recreation.

```swift
// Wrong - loses type information
func makeView(type: ViewType) -> some View {
    switch type {
    case .text:
        return AnyView(Text("Hello"))
    case .image:
        return AnyView(Image(systemName: "star"))
    }
}

// Correct - preserve types with @ViewBuilder
@ViewBuilder
func makeView(type: ViewType) -> some View {
    switch type {
    case .text:
        Text("Hello")
    case .image:
        Image(systemName: "star")
    }
}

// Alternative - use Group for conditional views
var body: some View {
    Group {
        if showText {
            Text("Hello")
        } else {
            Image(systemName: "star")
        }
    }
}
```

## 3. Creating New Objects in Body

**Problem**: Every body evaluation creates new instances, preventing SwiftUI from recognizing stable values.

```swift
// Wrong - creates new DateFormatter on every body evaluation
struct BadDateView: View {
    let date: Date

    var body: some View {
        let formatter = DateFormatter()  // New instance every time!
        formatter.dateStyle = .medium
        return Text(formatter.string(from: date))
    }
}

// Correct - create once, reuse
struct GoodDateView: View {
    let date: Date

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        return f
    }()

    var body: some View {
        Text(Self.formatter.string(from: date))
    }
}

// Alternative - use built-in formatters
struct BetterDateView: View {
    let date: Date

    var body: some View {
        Text(date, style: .date)  // SwiftUI handles formatting
    }
}
```

## 4. Branching on View State Instead of Modifiers

**Problem**: Branches change structural identity, losing state and triggering transitions.

```swift
// Wrong - structural identity changes on toggle
struct BadToggleView: View {
    @State private var isExpanded = false

    var body: some View {
        if isExpanded {
            ExpandedContentView()  // Destroyed on collapse
        } else {
            CollapsedContentView()  // Destroyed on expand
        }
    }
}

// Correct - preserve identity with conditional modifiers
struct GoodToggleView: View {
    @State private var isExpanded = false

    var body: some View {
        ContentView(isExpanded: isExpanded)  // Same view, different state
    }
}

// Alternative - use opacity/frame to hide
struct AlternativeToggleView: View {
    @State private var isExpanded = false

    var body: some View {
        VStack {
            HeaderView()

            DetailView()
                .frame(height: isExpanded ? nil : 0)  // Collapse without destroying
                .opacity(isExpanded ? 1 : 0)
        }
    }
}
```

## 5. Excessive GeometryReader Usage

**Problem**: GeometryReader recalculates on every layout change, triggering cascade of updates.

```swift
// Wrong - unnecessary GeometryReader
struct BadLayout: View {
    var body: some View {
        GeometryReader { geometry in
            VStack {
                Text("Width: \(geometry.size.width)")
                    .frame(width: geometry.size.width * 0.8)  // Could use .frame(maxWidth:)
            }
        }
    }
}

// Correct - use frame modifiers
struct GoodLayout: View {
    var body: some View {
        VStack {
            Text("Responsive width")
                .frame(maxWidth: .infinity)  // Fills available space
                .padding(.horizontal)  // 80% width effect
        }
    }
}

// Use GeometryReader only when truly needed
struct ValidGeometryUse: View {
    var body: some View {
        GeometryReader { geometry in
            // Valid: need actual size for custom drawing
            CustomShape(size: geometry.size)
        }
    }
}
```

## 6. Not Using Lazy Containers for Long Lists

**Problem**: Non-lazy stacks create all views immediately, consuming excessive memory.

```swift
// Wrong - loads all 1000 items immediately
ScrollView {
    VStack {
        ForEach(0..<1000) { index in
            HeavyItemView(index: index)  // All 1000 created at once
        }
    }
}

// Correct - lazy loading
ScrollView {
    LazyVStack {
        ForEach(0..<1000) { index in
            HeavyItemView(index: index)  // Created as scrolled into view
        }
    }
}
```

## 7. Performing Expensive Work on Main Thread

**Problem**: Blocking main thread makes UI unresponsive.

```swift
// Wrong - expensive work blocks UI
struct BadDataView: View {
    @State private var data: [Item] = []

    var body: some View {
        List(data) { item in
            Text(item.name)
        }
        .onAppear {
            // Blocks UI while loading
            data = loadDataFromDisk()  // Expensive!
        }
    }
}

// Correct - async work off main thread
struct GoodDataView: View {
    @State private var data: [Item] = []
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                ProgressView()
            } else {
                List(data) { item in
                    Text(item.name)
                }
            }
        }
        .task {
            // Runs on background thread
            data = await loadDataAsync()
            isLoading = false
        }
    }
}
```

## 8. Using ObservableObject Without Scoping Published Properties

**Problem**: Views recompute when any @Published property changes, even ones they don't use.

```swift
// Problematic - view recomputes on all changes
class AppState: ObservableObject {
    @Published var userProfile: User?       // Changes rarely
    @Published var unreadCount: Int = 0     // Changes frequently
    @Published var networkStatus: Status = .online  // Changes frequently
}

struct ProfileView: View {
    @ObservedObject var appState: AppState

    var body: some View {
        // Only uses userProfile, but recomputes on unreadCount changes!
        Text(appState.userProfile?.name ?? "")
    }
}

// Solution 1: Use @Observable (iOS 17+) for fine-grained observation
@Observable
class AppState {
    var userProfile: User?       // ProfileView only observes this
    var unreadCount: Int = 0
    var networkStatus: Status = .online
}

// Solution 2: Split into focused ObservableObjects
class UserState: ObservableObject {
    @Published var profile: User?
}

class NotificationState: ObservableObject {
    @Published var unreadCount: Int = 0
}

struct ProfileView: View {
    @ObservedObject var userState: UserState  // Only observes relevant state

    var body: some View {
        Text(userState.profile?.name ?? "")
    }
}
```

These anti-patterns account for the majority of SwiftUI performance issues. Profiling with Instruments reveals which patterns affect your specific app.
</anti_patterns>

---

## Sources

- [Optimizing SwiftUI Performance: Best Practices](https://medium.com/@garejakirit/optimizing-swiftui-performance-best-practices-93b9cc91c623)
- [Demystify SwiftUI performance - WWDC23](https://developer.apple.com/videos/play/wwdc2023/10160/)
- [Making our production SwiftUI app 100x faster — Clay](https://clay.earth/stories/production-swiftui-performance-increase)
- [How the SwiftUI View Lifecycle and Identity work - DoorDash Engineering](https://doordash.engineering/2022/05/31/how-the-swiftui-view-lifecycle-and-identity-work/)
- [Identity in SwiftUI - Geek Culture](https://medium.com/geekculture/identity-in-swiftui-6aacf8f587d9)
- [Demystify SwiftUI - WWDC21](https://developer.apple.com/videos/play/wwdc2021/10022/)
- [id(_): Identifying SwiftUI Views - The SwiftUI Lab](https://swiftui-lab.com/swiftui-id/)
- [How to use Instruments to profile your SwiftUI code - Hacking with Swift](https://www.hackingwithswift.com/quick-start/swiftui/how-to-use-instruments-to-profile-your-swiftui-code-and-identify-slow-layouts)
- [Profiling SwiftUI app using Instruments - Swift with Majid](https://swiftwithmajid.com/2021/01/20/profiling-swiftui-app-using-instruments/)
- [@Observable Macro performance increase over ObservableObject](https://www.avanderlee.com/swiftui/observable-macro-performance-increase-observableobject/)
- [@Observable vs ObservableObject in SwiftUI - Malcolm Hall](https://www.malcolmhall.com/2024/04/22/observable-vs-observableobject-in-swiftui/)
- [Tuning Lazy Stacks and Grids in SwiftUI: A Performance Guide](https://medium.com/@wesleymatlock/tuning-lazy-stacks-and-grids-in-swiftui-a-performance-guide-2fb10786f76a)
- [Tips and Considerations for Using Lazy Containers in SwiftUI](https://fatbobman.com/en/posts/tips-and-considerations-for-using-lazy-containers-in-swiftui/)
- [List or LazyVStack - Choosing the Right Lazy Container in SwiftUI](https://fatbobman.com/en/posts/list-or-lazyvstack/)
- [Optimizing AsyncImage in SwiftUI: Build a Custom Cached Solution](https://medium.com/@sviatoslav.kliuchev/improve-asyncimage-in-swiftui-5aae28f1a331)
- [AsyncImage in SwiftUI: Loading Images from URLs with Caching](https://matteomanferdini.com/swiftui-asyncimage/)
- [SwiftUI Performance and Stability: Avoiding the Most Costly Mistakes](https://dev.to/arshtechpro/swiftui-performance-and-stability-avoiding-the-most-costly-mistakes-234c)
- [Common SwiftUI Mistakes - Hacking with Swift](https://www.hackingwithswift.com/articles/224/common-swiftui-mistakes-and-how-to-fix-them)
- [Avoiding having to recompute values within SwiftUI views - Swift by Sundell](https://www.swiftbysundell.com/articles/avoiding-swiftui-value-recomputation/)
- [Optimizing SwiftUI: Reducing Body Recalculation and Minimizing @State Updates](https://medium.com/@wesleymatlock/optimizing-swiftui-reducing-body-recalculation-and-minimizing-state-updates-8f7944253725)
- [How to Avoid Repeating SwiftUI View Updates](https://fatbobman.com/en/posts/avoid_repeated_calculations_of_swiftui_views/)
