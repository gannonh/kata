<overview>
SwiftData is Apple's modern persistence framework introduced at WWDC 2023, built on Core Data but with a Swift-native API. It provides declarative data modeling, automatic persistence, and seamless SwiftUI integration with minimal boilerplate.

**Key insight:** SwiftData eliminates the complexity of Core Data while maintaining its power. Where Core Data requires NSManagedObject subclasses, fetch request controllers, and entity descriptions, SwiftData uses Swift macros (@Model, @Query) and modern Swift features like #Predicate for compile-time validation.

**Minimum deployment:** iOS 17, macOS 14, watchOS 10, tvOS 17, visionOS 1.0

**When to read this file:**
- Persisting app data locally or syncing with iCloud
- Defining data models and relationships
- Querying and filtering stored data
- Migrating from Core Data to SwiftData
- Before reading: architecture.md (understand app structure), state-management.md (understand @Observable)
- Read alongside: platform-integration.md (for CloudKit integration details)
</overview>

<model_definition>
## Defining Models

**@Model macro:**
```swift
import SwiftData

@Model
class Item {
    var name: String
    var timestamp: Date
    var isCompleted: Bool

    init(name: String) {
        self.name = name
        self.timestamp = Date()
        self.isCompleted = false
    }
}
```

The @Model macro transforms a Swift class into a SwiftData model. SwiftData automatically persists all stored properties.

**Supported property types:**
- Basic types: String, Int, Double, Bool, Date, UUID, URL, Data
- Codable types (stored as JSON)
- Collections: [String], [Int], etc.
- Relationships to other @Model types
- Optionals of any above type

**@Attribute options:**
```swift
@Model
class User {
    @Attribute(.unique) var id: UUID
    @Attribute(.externalStorage) var profileImage: Data
    @Attribute(.spotlight) var displayName: String
    @Attribute(.allowsCloudEncryption) var sensitiveInfo: String

    var email: String

    init(id: UUID = UUID(), displayName: String, email: String) {
        self.id = id
        self.displayName = displayName
        self.email = email
        self.profileImage = Data()
        self.sensitiveInfo = ""
    }
}
```

**@Transient for non-persisted properties:**
```swift
@Model
class Task {
    var title: String
    var createdAt: Date

    @Transient var isEditing: Bool = false

    var ageInDays: Int {
        Calendar.current.dateComponents([.day], from: createdAt, to: Date()).day ?? 0
    }

    init(title: String) {
        self.title = title
        self.createdAt = Date()
    }
}
```
</model_definition>

<relationships>
## Relationships

**One-to-many:**
```swift
@Model
class Folder {
    var name: String
    @Relationship(deleteRule: .cascade) var items: [Item] = []

    init(name: String) {
        self.name = name
    }
}

@Model
class Item {
    var name: String
    var folder: Folder?

    init(name: String, folder: Folder? = nil) {
        self.name = name
        self.folder = folder
    }
}
```

**Delete rules:**
- `.cascade` - deletes related objects
- `.nullify` - sets relationship to nil (default)
- `.deny` - prevents deletion if relationship exists
- `.noAction` - does nothing (use with caution)

**Inverse relationships:**
```swift
@Model
class Author {
    var name: String
    @Relationship(inverse: \Book.author) var books: [Book] = []

    init(name: String) {
        self.name = name
    }
}
```
</relationships>

<model_container>
## ModelContainer and ModelContext

**Setting up container in App:**
```swift
import SwiftUI
import SwiftData

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Item.self, Folder.self])
    }
}
```

**Custom configuration:**
```swift
let config = ModelConfiguration(
    schema: Schema([Item.self, Folder.self]),
    url: URL.documentsDirectory.appending(path: "MyApp.store"),
    cloudKitDatabase: .automatic
)

let container = try ModelContainer(
    for: Item.self,
    configurations: config
)
```

**Accessing context in views:**
```swift
@Environment(\.modelContext) private var context
```
</model_container>

<querying>
## Querying Data

**@Query in views:**
```swift
@Query var items: [Item]

// With sorting
@Query(sort: \Item.timestamp, order: .reverse) var items: [Item]

// With filtering
@Query(filter: #Predicate<Item> { $0.isCompleted == false }) var items: [Item]
```

**Dynamic queries:**
```swift
struct SearchableItemList: View {
    @Query var items: [Item]

    init(searchText: String) {
        let predicate = #Predicate<Item> { item in
            searchText.isEmpty || item.name.localizedStandardContains(searchText)
        }
        _items = Query(filter: predicate)
    }
}
```

**FetchDescriptor for context queries:**
```swift
let descriptor = FetchDescriptor<Item>(
    predicate: #Predicate { $0.isCompleted },
    sortBy: [SortDescriptor(\.timestamp)]
)
let items = try context.fetch(descriptor)
```
</querying>

<crud_operations>
## CRUD Operations

**Create:**
```swift
let item = Item(name: "New Item")
context.insert(item)
```

**Update:**
```swift
item.name = "Updated Name"
// Changes auto-save
```

**Delete:**
```swift
context.delete(item)
```

**Manual save:**
```swift
try context.save()
```
</crud_operations>

<cloudkit_sync>
## CloudKit Sync

**Enable in container:**
```swift
let config = ModelConfiguration(cloudKitDatabase: .automatic)
```

**CloudKit constraints:**
- Cannot use @Attribute(.unique) with CloudKit
- All properties need defaults or be optional
- Relationships must be optional
- Private database only
</cloudkit_sync>

<migration>
## Schema Migration

**Lightweight migration (automatic):**
- Adding properties with defaults
- Removing properties
- Renaming with @Attribute(originalName:)

**Schema versioning:**
```swift
enum SchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] { [Item.self] }
}
```
</migration>

<decision_tree>
## Choosing Your Approach

**New project, iOS 17+ only:** SwiftData
**Need iOS 16 support:** Core Data
**Existing Core Data project:** Keep Core Data unless full migration planned
**Need CloudKit:** SwiftData (simpler) or Core Data (more control)
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Using @Query outside SwiftUI views">
**Problem:** @Query requires SwiftUI environment
**Instead:** Use FetchDescriptor with explicit context in view models
</anti_pattern>

<anti_pattern name="Using @Attribute(.unique) with CloudKit">
**Problem:** Silently breaks CloudKit sync
**Instead:** Handle uniqueness in app logic
</anti_pattern>

<anti_pattern name="Transient properties in predicates">
**Problem:** Compiles but crashes at runtime
**Instead:** Use persisted properties for filtering
</anti_pattern>
</anti_patterns>
