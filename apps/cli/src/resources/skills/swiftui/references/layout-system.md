<overview>
SwiftUI's layout system operates fundamentally differently from UIKit/Auto Layout. Instead of constraints, SwiftUI uses a **propose-measure-place** model:

1. **Propose**: Parent offers child a size
2. **Measure**: Child chooses its own size (parent must respect this)
3. **Place**: Parent positions child in its coordinate space

This creates a declarative, predictable layout system where conflicts are impossible. SwiftUI always produces a valid layout.

**Read this file when:**
- Choosing between layout containers (HStack, VStack, Grid, etc.)
- Dealing with complex positioning requirements
- Performance tuning layouts with large datasets
- Understanding GeometryReader usage and alternatives

**See also:**
- `performance.md` for layout performance optimization strategies
- `architecture.md` for structuring complex view hierarchies
</overview>

<layout_containers>
## Layout Containers

<container name="HStack">
**Purpose:** Horizontal arrangement of views from left to right (or right to left in RTL languages)

**Behavior:** Proposes equal width to all children, then distributes remaining space based on flexibility. Children choose their own heights.

**Alignment:** Default is `.center` vertically. Options: `.top`, `.center`, `.bottom`, `.firstTextBaseline`, `.lastTextBaseline`

**Spacing:** Default is system-defined (typically 8pt). Override with `spacing:` parameter or `.none` for zero spacing.

```swift
// Common usage with custom spacing and alignment
HStack(alignment: .top, spacing: 12) {
    Image(systemName: "person.circle")
        .font(.largeTitle)

    VStack(alignment: .leading, spacing: 4) {
        Text("Username")
            .font(.headline)
        Text("Online")
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    Spacer() // Pushes content to leading edge

    Button("Follow") { }
}
.padding()
```

**Performance:** Lightweight. All children are created immediately (not lazy).
</container>

<container name="VStack">
**Purpose:** Vertical arrangement of views from top to bottom

**Behavior:** Proposes equal height to all children, then distributes remaining space. Children choose their own widths.

**Alignment:** Default is `.center` horizontally. Options: `.leading`, `.center`, `.trailing`

**Spacing:** Default is system-defined. Override with `spacing:` parameter.

```swift
// Card layout with multiple sections
VStack(alignment: .leading, spacing: 16) {
    Text("Title")
        .font(.headline)

    Text("Body text that can span multiple lines and will wrap naturally within the available width.")
        .font(.body)
        .foregroundStyle(.secondary)

    HStack {
        Spacer()
        Button("Action") { }
    }
}
.padding()
.background(.background.secondary)
.clipShape(RoundedRectangle(cornerRadius: 12))
```

**Performance:** Lightweight. All children are created immediately.
</container>

<container name="ZStack">
**Purpose:** Layering views on the Z-axis (depth), drawing from back to front

**Behavior:** Proposes full available size to all children. Final size is the union of all child sizes. Later views draw on top of earlier views.

**Alignment:** Default is `.center` both horizontally and vertically. Options include `.topLeading`, `.bottomTrailing`, etc.

```swift
// Profile picture with badge
ZStack(alignment: .bottomTrailing) {
    AsyncImage(url: profileURL) { image in
        image
            .resizable()
            .scaledToFill()
    } placeholder: {
        Color.gray
    }
    .frame(width: 100, height: 100)
    .clipShape(Circle())

    // Notification badge
    Circle()
        .fill(.red)
        .frame(width: 24, height: 24)
        .overlay {
            Text("3")
                .font(.caption2.bold())
                .foregroundStyle(.white)
        }
        .offset(x: 4, y: 4)
}
```

**Performance:** Lightweight. Avoid excessive layering for complex effects (use `.overlay()` or `.background()` instead when appropriate).
</container>

<container name="LazyVStack">
**Purpose:** Vertical stack with deferred view creation - only creates views when they scroll into view

**When to use:**
- Lists with hundreds or thousands of items
- Items with expensive initialization (images, complex views)
- Memory-constrained scenarios

**Difference from VStack:**
- VStack creates all children immediately
- LazyVStack creates children on-demand as they appear
- LazyVStack requires a ScrollView parent
- LazyVStack calculates layout incrementally

```swift
ScrollView {
    LazyVStack(spacing: 12, pinnedViews: [.sectionHeaders]) {
        Section {
            ForEach(items) { item in
                ItemRow(item: item)
                    .frame(height: 60)
            }
        } header: {
            Text("Section Header")
                .font(.headline)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.ultraThinMaterial)
        }
    }
}
```

**Performance:**
- Superior for long lists (only renders visible views)
- Slight overhead per view creation
- Use `.id()` modifier to control view identity/reuse

**See also:** LazyHStack for horizontal lazy loading
</container>

<container name="LazyVGrid / LazyHGrid">
**Purpose:** Grid layouts with lazy loading - creates cells only when visible

**GridItem types:**
- `.fixed(width)`: Exactly the specified width
- `.flexible(minimum:maximum:)`: Grows to fill space within bounds
- `.adaptive(minimum:maximum:)`: Creates as many columns as fit

```swift
// Photo grid with adaptive columns
ScrollView {
    LazyVGrid(
        columns: [GridItem(.adaptive(minimum: 120, maximum: 200))],
        spacing: 12
    ) {
        ForEach(photos) { photo in
            AsyncImage(url: photo.url) { image in
                image
                    .resizable()
                    .scaledToFill()
            } placeholder: {
                Color.gray.opacity(0.3)
            }
            .frame(height: 120)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
    .padding()
}

// Fixed column layout (3 columns)
let columns = [
    GridItem(.flexible()),
    GridItem(.flexible()),
    GridItem(.flexible())
]

LazyVGrid(columns: columns, spacing: 16) {
    ForEach(items) { item in
        ItemCard(item: item)
    }
}
```

**Performance:**
- Only creates visible cells (significant memory savings)
- Best for image galleries, product catalogs, large datasets
- On macOS, performance may drop below UIKit CollectionView for very large datasets (see performance.md)
- Consider pagination for datasets over 1000 items

**When NOT to use:** Small grids (< 20 items) - use Grid instead for simpler code
</container>

<container name="Grid (iOS 16+)">
**Purpose:** Non-lazy grid with explicit row/column control and advanced alignment

**When to use:**
- Small datasets where all items can be in memory
- Need precise row/column control
- Need GridRow for custom row styling
- Need alignment across cells in different rows

**Difference from LazyVGrid:**
- Grid creates all cells immediately
- Grid gives more layout control (GridRow, cell spanning)
- Grid supports baseline alignment across rows
- Grid is simpler for static content

```swift
// Form-like layout with alignment
Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
    GridRow {
        Text("Name:")
            .gridColumnAlignment(.trailing)
        TextField("Enter name", text: $name)
    }

    GridRow {
        Text("Email:")
            .gridColumnAlignment(.trailing)
        TextField("Enter email", text: $email)
    }

    GridRow {
        Color.clear
            .gridCellUnsizedAxes(.horizontal)

        Button("Submit") { }
            .gridCellColumns(1)
    }
}
.padding()

// Spanning cells
Grid {
    GridRow {
        Text("Header")
            .gridCellColumns(3) // Spans 3 columns
            .font(.headline)
    }

    GridRow {
        ForEach(1...3, id: \.self) { num in
            Text("Cell \(num)")
        }
    }
}
```

**Performance:** All cells created immediately. Keep under 100 items or use LazyVGrid.
</container>
</layout_containers>

<geometry_reader>
## GeometryReader

**Purpose:** Access parent's proposed size and safe area insets for custom layout calculations

**When to use:**
- Custom drawing or graphics that need exact dimensions
- Complex animations requiring precise positioning
- Creating custom layout effects not possible with standard containers
- Reading coordinate spaces for gesture calculations

**When NOT to use:**
- Simple relative sizing → use `.frame(maxWidth: .infinity)` or `Spacer()`
- Container-relative frames → use `containerRelativeFrame()` (iOS 17+)
- Adaptive layouts → use `ViewThatFits` (iOS 16+)
- Safe area queries → use safe area modifiers directly

```swift
// Correct usage: Custom circular progress
GeometryReader { geometry in
    ZStack {
        Circle()
            .stroke(Color.gray.opacity(0.3), lineWidth: 10)

        Circle()
            .trim(from: 0, to: progress)
            .stroke(Color.blue, style: StrokeStyle(lineWidth: 10, lineCap: .round))
            .rotationEffect(.degrees(-90))
            .animation(.easeInOut, value: progress)
    }
    .frame(width: geometry.size.width, height: geometry.size.width)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
}
.aspectRatio(1, contentMode: .fit)

// Correct usage: Reading coordinate spaces
struct DragView: View {
    @State private var location: CGPoint = .zero

    var body: some View {
        GeometryReader { geometry in
            Circle()
                .fill(.blue)
                .frame(width: 50, height: 50)
                .position(location)
                .gesture(
                    DragGesture(coordinateSpace: .named("container"))
                        .onChanged { value in
                            location = value.location
                        }
                )
        }
        .coordinateSpace(name: "container")
    }
}
```

**Pitfalls:**

1. **Expands to fill all available space**: GeometryReader acts like `Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)`, which breaks layouts in ScrollViews and can cause infinite height calculations

2. **Breaks ScrollView behavior**: Inside ScrollView, GeometryReader tries to fill infinite space, causing layout loops and broken scrolling

3. **Overused for simple tasks**: Most GeometryReader usage can be replaced with simpler solutions

4. **Deep nesting causes unpredictable behavior**: Nested GeometryReaders compound layout issues

5. **Performance overhead**: Rebuilds view on every geometry change

**Alternatives to GeometryReader:**

```swift
// ❌ BAD: Using GeometryReader for container-relative sizing
GeometryReader { geometry in
    Rectangle()
        .frame(width: geometry.size.width * 0.5)
}

// ✅ GOOD: Use containerRelativeFrame (iOS 17+)
Rectangle()
    .containerRelativeFrame(.horizontal) { width, _ in
        width * 0.5
    }

// ✅ GOOD: Use frame modifiers
Rectangle()
    .frame(maxWidth: .infinity)
    .padding(.horizontal, .infinity) // Creates 50% width

// ❌ BAD: GeometryReader for adaptive layouts
GeometryReader { geometry in
    if geometry.size.width > 600 {
        HStack { content }
    } else {
        VStack { content }
    }
}

// ✅ GOOD: Use ViewThatFits (iOS 16+)
ViewThatFits {
    HStack { content }
    VStack { content }
}
```

**Using GeometryReader safely:**

```swift
// Use in .background() or .overlay() to avoid affecting layout
Text("Hello")
    .background(
        GeometryReader { geometry in
            Color.clear
                .onAppear {
                    print("Size: \(geometry.size)")
                }
        }
    )
```

**See also:** `performance.md` for GeometryReader performance considerations
</geometry_reader>

<custom_layout>
## Custom Layout Protocol (iOS 16+)

**When to use:**
- Standard containers cannot achieve the desired layout
- Flow/tag layouts (wrapping items like a text paragraph)
- Radial/circular arrangements
- Custom grid behaviors (masonry, Pinterest-style)
- Complex alignment requirements across multiple views

**Protocol requirements:**
1. `sizeThatFits(proposal:subviews:cache:)`: Calculate and return container size
2. `placeSubviews(in:proposal:subviews:cache:)`: Position each subview

**Optional:**
- `makeCache(subviews:)`: Create shared computation cache
- `updateCache(_:subviews:)`: Update cache when subviews change
- `explicitAlignment(of:in:proposal:subviews:cache:)`: Define custom alignment guides

```swift
// Complete FlowLayout example (tag cloud, wrapping items)
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Cache
    ) -> CGSize {
        let rows = computeRows(proposal: proposal, subviews: subviews)

        let width = proposal.replacingUnspecifiedDimensions().width
        let height = rows.reduce(0) { $0 + $1.height + spacing } - spacing

        return CGSize(width: width, height: height)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout Cache
    ) {
        let rows = computeRows(proposal: proposal, subviews: subviews)

        var y = bounds.minY
        for row in rows {
            var x = bounds.minX

            for index in row.subviewIndices {
                let subview = subviews[index]
                let size = subview.sizeThatFits(.unspecified)

                subview.place(
                    at: CGPoint(x: x, y: y),
                    proposal: ProposedViewSize(size)
                )

                x += size.width + spacing
            }

            y += row.height + spacing
        }
    }

    // Cache structure for performance
    struct Cache {
        var rows: [Row] = []
    }

    struct Row {
        var subviewIndices: [Int]
        var height: CGFloat
    }

    private func computeRows(
        proposal: ProposedViewSize,
        subviews: Subviews
    ) -> [Row] {
        let width = proposal.replacingUnspecifiedDimensions().width
        var rows: [Row] = []
        var currentRow: [Int] = []
        var currentX: CGFloat = 0
        var currentHeight: CGFloat = 0

        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)

            if currentX + size.width > width && !currentRow.isEmpty {
                // Start new row
                rows.append(Row(subviewIndices: currentRow, height: currentHeight))
                currentRow = []
                currentX = 0
                currentHeight = 0
            }

            currentRow.append(index)
            currentX += size.width + spacing
            currentHeight = max(currentHeight, size.height)
        }

        if !currentRow.isEmpty {
            rows.append(Row(subviewIndices: currentRow, height: currentHeight))
        }

        return rows
    }
}

// Usage
FlowLayout(spacing: 12) {
    ForEach(tags, id: \.self) { tag in
        Text(tag)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.blue.opacity(0.2))
            .clipShape(Capsule())
    }
}

// Radial layout example
struct RadialLayout: Layout {
    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let radius = min(bounds.width, bounds.height) / 2.5
        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        let angle = (2 * .pi) / Double(subviews.count)

        for (index, subview) in subviews.enumerated() {
            let theta = angle * Double(index) - .pi / 2
            let x = center.x + radius * cos(theta)
            let y = center.y + radius * sin(theta)

            subview.place(
                at: CGPoint(x: x, y: y),
                anchor: .center,
                proposal: .unspecified
            )
        }
    }
}
```

**Use cases:**
- **Flow/tag layout**: Wrapping items like tags, badges, or chips
- **Radial layout**: Circular menu, dial controls
- **Masonry grid**: Pinterest-style uneven grid
- **Custom calendar**: Week views with variable heights
- **Waterfall layout**: Staggered grid with varying item heights

**See also:**
- Apple's official documentation: [Composing custom layouts with SwiftUI](https://developer.apple.com/documentation/swiftui/composing_custom_layouts_with_swiftui)
- `performance.md` for Layout protocol caching strategies
</custom_layout>

<alignment_guides>
## Alignment and Alignment Guides

**Built-in alignments:**
- **Vertical**: `.leading`, `.center`, `.trailing`
- **Horizontal**: `.top`, `.center`, `.bottom`, `.firstTextBaseline`, `.lastTextBaseline`

**How alignment works:** When containers like HStack or VStack align children, they use alignment guides. Each view exposes alignment guide values, and the container aligns those values across children.

**Custom alignment guides:**

```swift
// Define custom vertical alignment
extension VerticalAlignment {
    private struct MidAccountAndName: AlignmentID {
        static func defaultValue(in context: ViewDimensions) -> CGFloat {
            context[VerticalAlignment.center]
        }
    }

    static let midAccountAndName = VerticalAlignment(MidAccountAndName.self)
}

// Use custom alignment
HStack(alignment: .midAccountAndName) {
    VStack(alignment: .trailing) {
        Text("Full Name:")
        Text("Address:")
        Text("Account Number:")
            .alignmentGuide(.midAccountAndName) { d in
                d[VerticalAlignment.center]
            }
    }

    VStack(alignment: .leading) {
        Text("John Doe")
        Text("123 Main St")
        Text("98765-4321")
            .alignmentGuide(.midAccountAndName) { d in
                d[VerticalAlignment.center]
            }
    }
}

// Adjusting alignment dynamically
Image(systemName: "arrow.up")
    .alignmentGuide(.leading) { d in
        d[.leading] - 50 // Shift left by 50 points
    }
```

**Preference keys for custom alignment:**

Preference keys allow child views to communicate layout information up the hierarchy.

```swift
// Define preference key for collecting bounds
struct BoundsPreferenceKey: PreferenceKey {
    static var defaultValue: [String: Anchor<CGRect>] = [:]

    static func reduce(
        value: inout [String: Anchor<CGRect>],
        nextValue: () -> [String: Anchor<CGRect]]
    ) {
        value.merge(nextValue(), uniquingKeysWith: { $1 })
    }
}

// Use anchorPreference to collect child bounds
struct HighlightableView: View {
    @State private var highlightedFrame: CGRect?

    var body: some View {
        VStack(spacing: 20) {
            Text("First")
                .padding()
                .background(Color.blue.opacity(0.3))
                .anchorPreference(
                    key: BoundsPreferenceKey.self,
                    value: .bounds
                ) {
                    ["first": $0]
                }

            Text("Second")
                .padding()
                .background(Color.green.opacity(0.3))
                .anchorPreference(
                    key: BoundsPreferenceKey.self,
                    value: .bounds
                ) {
                    ["second": $0]
                }
        }
        .overlayPreferenceValue(BoundsPreferenceKey.self) { preferences in
            GeometryReader { geometry in
                if let anchor = preferences["first"],
                   let frame = highlightedFrame {
                    Rectangle()
                        .stroke(Color.red, lineWidth: 2)
                        .frame(width: frame.width, height: frame.height)
                        .position(x: frame.midX, y: frame.midY)
                }
            }
        }
        .onPreferenceChange(BoundsPreferenceKey.self) { preferences in
            // React to preference changes
        }
    }
}
```

**Practical use cases:**
- Aligning labels across separate VStacks
- Syncing baseline alignment in complex layouts
- Cross-highlighting related views
- Creating connection lines between views

**See also:**
- [The SwiftUI Lab: Alignment Guides](https://swiftui-lab.com/alignment-guides/)
- [Swift with Majid: Layout alignment](https://fatbobman.com/en/posts/layout-alignment/)
</alignment_guides>

<safe_areas>
## Safe Area Handling

SwiftUI respects safe areas by default (avoiding notches, home indicator, status bar).

**Three key modifiers:**

### `ignoresSafeArea(_:edges:)`
**When to use:** Extend backgrounds or images edge-to-edge while keeping content safe

```swift
// Background that extends to edges
ZStack {
    Color.blue
        .ignoresSafeArea() // Goes edge-to-edge

    VStack {
        Text("Content")
        Spacer()
    }
    .padding() // Content stays in safe area
}

// Ignore only specific edges
ScrollView {
    content
}
.ignoresSafeArea(.container, edges: .bottom)

// Ignore keyboard safe area
TextField("Message", text: $message)
    .ignoresSafeArea(.keyboard)
```

**Regions:**
- `.container`: Device edges, status bar, home indicator
- `.keyboard`: Soft keyboard area
- `.all`: Both container and keyboard

**Edges:** `.top`, `.bottom`, `.leading`, `.trailing`, `.horizontal`, `.vertical`, `.all`

### `safeAreaInset(edge:alignment:spacing:content:)`
**When to use:** Add custom bars (toolbars, tab bars) that shrink the safe area for other content

```swift
// Custom bottom toolbar
ScrollView {
    ForEach(items) { item in
        ItemRow(item: item)
    }
}
.safeAreaInset(edge: .bottom, spacing: 0) {
    HStack {
        Button("Action 1") { }
        Spacer()
        Button("Action 2") { }
    }
    .padding()
    .background(.ultraThinMaterial)
}

// Multiple insets stack
ScrollView {
    content
}
.safeAreaInset(edge: .top) {
    SearchBar()
}
.safeAreaInset(edge: .bottom) {
    BottomBar()
}

// Inset with custom alignment
List(messages) { message in
    MessageRow(message: message)
}
.safeAreaInset(edge: .bottom, alignment: .trailing) {
    Button(action: compose) {
        Image(systemName: "plus.circle.fill")
            .font(.largeTitle)
    }
    .padding()
}
```

**Key behavior:** Unlike `ignoresSafeArea`, this **shrinks** the safe area so other views avoid it.

### `safeAreaPadding(_:_:)` (iOS 17+)
**When to use:** Extend safe area by a fixed amount without providing a view

```swift
// Add padding to safe area
ScrollView {
    content
}
.safeAreaPadding(.horizontal, 20)
.safeAreaPadding(.bottom, 60)

// Equivalent to safeAreaInset but cleaner when you don't need a view
```

**Difference from `.padding()`:**
- `.padding()` adds space but doesn't affect safe area calculations
- `.safeAreaPadding()` extends the safe area itself

### Accessing safe area values

```swift
// Read safe area insets
GeometryReader { geometry in
    let safeArea = geometry.safeAreaInsets

    VStack {
        Text("Top: \(safeArea.top)")
        Text("Bottom: \(safeArea.bottom)")
    }
}
```

**See also:** [Managing safe area in SwiftUI](https://swiftwithmajid.com/2021/11/03/managing-safe-area-in-swiftui/)
</safe_areas>

<decision_tree>
## Choosing the Right Layout

**Simple horizontal arrangement:**
- Use `HStack` with alignment and spacing parameters
- Use `Spacer()` to push content to edges

**Simple vertical arrangement:**
- Use `VStack` with alignment and spacing parameters
- Consider `LazyVStack` if list exceeds 50+ items

**Overlapping views:**
- Use `ZStack` for basic layering
- Use `.overlay()` or `.background()` for single overlay/underlay
- Consider Custom Layout for complex Z-ordering logic

**Long scrolling list:**
- Use `LazyVStack` inside `ScrollView` for variable content
- Use `List` for standard iOS list appearance with built-in features (swipe actions, separators)
- Vertical scrolling: `ScrollView { LazyVStack { } }`
- Horizontal scrolling: `ScrollView(.horizontal) { LazyHStack { } }`

**Grid of items:**
- **Small grid (< 20 items):** Use `Grid` for full control
- **Large grid:** Use `LazyVGrid` or `LazyHGrid`
- **Fixed columns:** `LazyVGrid(columns: [GridItem(.flexible()), ...])`
- **Adaptive columns:** `LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))])`

**Need parent size:**
- **iOS 17+:** Use `containerRelativeFrame()` for size relative to container
- **iOS 16+:** Use `ViewThatFits` for adaptive layouts
- **Custom drawing/gestures:** Use `GeometryReader` sparingly
- **Simple fills:** Use `.frame(maxWidth: .infinity)`

**Adaptive layout (changes based on space):**
- Use `ViewThatFits` (iOS 16+) to switch between layouts
- Use size classes with `@Environment(\.horizontalSizeClass)`

**Complex custom layout:**
- Implement Custom Layout protocol (iOS 16+)
- Use for: flow layouts, radial layouts, masonry grids
- Provides full control over sizing and positioning

**Performance considerations:**

| Scenario | Recommendation | Reason |
|----------|---------------|--------|
| Static grid < 20 items | Grid | Simpler, all layout upfront |
| Dynamic list 50+ items | LazyVStack | Only renders visible |
| Photo gallery 100+ items | LazyVGrid | Memory efficient |
| Constantly changing list | LazyVStack with `.id()` | Controls view identity |
| macOS high FPS requirement | UIKit/AppKit wrapper | SwiftUI grids cap at ~90fps |
| Complex nesting 5+ levels | Custom Layout | Better control, fewer containers |

**See also:** `performance.md` for detailed performance tuning strategies
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="GeometryReader for everything">
**Problem:** Using GeometryReader when simpler solutions exist

**Example:**
```swift
// ❌ Overcomplicated
GeometryReader { geometry in
    Rectangle()
        .frame(width: geometry.size.width * 0.8)
}

// ✅ Simple and correct
Rectangle()
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 40) // Creates inset
```

**Why it's bad:**
- GeometryReader expands to fill all space, breaking layouts
- Causes performance overhead
- Makes code harder to understand
- Often causes issues in ScrollViews

**Instead:**
- Use `.frame(maxWidth: .infinity)` for full width
- Use `containerRelativeFrame()` (iOS 17+) for proportional sizing
- Use `ViewThatFits` (iOS 16+) for adaptive layouts
- Reserve GeometryReader for actual coordinate-space needs
</anti_pattern>

<anti_pattern name="Nested Stacks explosion">
**Problem:** Excessive nesting of HStack/VStack creating deep hierarchies

**Example:**
```swift
// ❌ Too many nested stacks
VStack {
    HStack {
        VStack {
            HStack {
                VStack {
                    Text("Title")
                    Text("Subtitle")
                }
            }
        }
    }
}

// ✅ Flattened with proper modifiers
VStack(alignment: .leading, spacing: 4) {
    Text("Title")
        .font(.headline)
    Text("Subtitle")
        .font(.subheadline)
        .foregroundStyle(.secondary)
}
```

**Why it's bad:**
- Harder to read and maintain
- Unnecessary view hierarchy depth
- Can impact performance with many views
- Makes alignment more complex

**Instead:**
- Use alignment and spacing parameters instead of wrapper stacks
- Extract complex views into separate components
- Use Grid for form-like layouts
- Consider Custom Layout for truly complex arrangements
</anti_pattern>

<anti_pattern name="LazyVStack without ScrollView">
**Problem:** Using LazyVStack outside a ScrollView

**Example:**
```swift
// ❌ LazyVStack needs a scrollable container
LazyVStack {
    ForEach(items) { item in
        Text(item.name)
    }
}

// ✅ Correct usage
ScrollView {
    LazyVStack {
        ForEach(items) { item in
            Text(item.name)
        }
    }
}

// ✅ Or just use VStack if not scrolling
VStack {
    ForEach(items) { item in
        Text(item.name)
    }
}
```

**Why it's bad:**
- LazyVStack requires a scrollable parent to know when to load views
- Without scrolling, there's no benefit to lazy loading
- Can cause unexpected layout behavior

**Instead:**
- Always wrap LazyVStack/LazyHStack in ScrollView
- If not scrolling, use regular VStack/HStack
</anti_pattern>

<anti_pattern name="Fixed GridItem sizes everywhere">
**Problem:** Using `.fixed()` GridItem when flexible sizing would work better

**Example:**
```swift
// ❌ Fixed sizes break on different screen sizes
LazyVGrid(columns: [
    GridItem(.fixed(150)),
    GridItem(.fixed(150))
]) {
    ForEach(items) { item in
        ItemView(item: item)
    }
}

// ✅ Adaptive sizing
LazyVGrid(columns: [
    GridItem(.adaptive(minimum: 150, maximum: 200))
]) {
    ForEach(items) { item in
        ItemView(item: item)
    }
}

// ✅ Flexible columns
LazyVGrid(columns: [
    GridItem(.flexible()),
    GridItem(.flexible())
]) {
    ForEach(items) { item in
        ItemView(item: item)
    }
}
```

**Why it's bad:**
- Doesn't adapt to different screen sizes (iPhone SE vs iPad)
- Creates horizontal scrolling or cut-off content
- Not responsive to orientation changes

**Instead:**
- Use `.flexible()` to let items share space proportionally
- Use `.adaptive()` to fit as many items as possible
- Reserve `.fixed()` for specific design requirements (icons, avatars)
</anti_pattern>

<anti_pattern name="Spacer() abuse">
**Problem:** Using multiple Spacers when alignment parameters would be clearer

**Example:**
```swift
// ❌ Confusing spacer usage
HStack {
    Spacer()
    Text("Centered?")
    Spacer()
    Spacer()
}

// ✅ Clear alignment
HStack {
    Spacer()
    Text("Centered")
    Spacer()
}

// ✅ Even better - use alignment
HStack {
    Text("Centered")
}
.frame(maxWidth: .infinity)

// ✅ For trailing alignment
HStack {
    Spacer()
    Text("Trailing")
}
```

**Why it's bad:**
- Multiple spacers create ambiguous spacing
- Harder to reason about layout
- Can cause unexpected behavior with different content sizes

**Instead:**
- Use single Spacer() for clear intent
- Use frame modifiers with alignment
- Use stack alignment parameters
</anti_pattern>

<anti_pattern name="Mixing lazy and non-lazy inappropriately">
**Problem:** Using LazyVStack for small lists or VStack for huge lists

**Example:**
```swift
// ❌ Lazy overhead for tiny list
ScrollView {
    LazyVStack {
        ForEach(0..<5) { i in
            Text("Item \(i)")
        }
    }
}

// ✅ Just use VStack
ScrollView {
    VStack {
        ForEach(0..<5) { i in
            Text("Item \(i)")
        }
    }
}

// ❌ Regular stack for huge list
VStack {
    ForEach(0..<1000) { i in
        ExpensiveView(index: i)
    }
}

// ✅ Lazy for performance
ScrollView {
    LazyVStack {
        ForEach(0..<1000) { i in
            ExpensiveView(index: i)
        }
    }
}
```

**Why it's bad:**
- Lazy containers add overhead for small datasets
- Non-lazy containers create all views upfront (memory/performance hit)

**Instead:**
- **< 20 simple items:** Use VStack/HStack
- **20-50 items:** Test both; likely VStack is fine
- **> 50 items or complex views:** Use LazyVStack/LazyHStack
- **Large images/media:** Always use lazy
</anti_pattern>

<anti_pattern name="ViewThatFits with fixed frames">
**Problem:** Providing fixed frames to ViewThatFits children, defeating its purpose

**Example:**
```swift
// ❌ Fixed frames prevent ViewThatFits from working
ViewThatFits {
    HStack {
        content
    }
    .frame(width: 600) // Prevents fitting logic

    VStack {
        content
    }
    .frame(width: 300)
}

// ✅ Let views size naturally
ViewThatFits {
    HStack {
        content
    }

    VStack {
        content
    }
}
```

**Why it's bad:**
- ViewThatFits needs to measure ideal sizes to choose the right view
- Fixed frames override this measurement
- Defeats the entire purpose of adaptive layout

**Instead:**
- Let child views size themselves naturally
- Use maxWidth/maxHeight if needed, not fixed sizes
- Trust ViewThatFits to pick the right layout
</anti_pattern>

</anti_patterns>

**Sources:**
Research for this reference included:
- [SwiftUI Layout System (kean.blog)](https://kean.blog/post/swiftui-layout-system)
- [Custom Layouts in SwiftUI (Medium)](https://medium.com/@wesleymatlock/custom-layouts-in-swiftui-a-deep-dive-into-the-layout-protocol-5edc691cd4fb)
- [A guide to the SwiftUI layout system (Swift by Sundell)](https://www.swiftbysundell.com/articles/swiftui-layout-system-guide-part-1/)
- [Creating custom layouts with Layout protocol (Hacking with Swift)](https://www.hackingwithswift.com/quick-start/swiftui/how-to-create-a-custom-layout-using-the-layout-protocol)
- [Apple Developer: Composing custom layouts with SwiftUI](https://developer.apple.com/documentation/swiftui/composing_custom_layouts_with_swiftui)
- [Custom Layout in SwiftUI (Sarunw)](https://sarunw.com/posts/swiftui-custom-layout/)
- [GeometryReader - Blessing or Curse? (fatbobman)](https://fatbobman.com/en/posts/geometryreader-blessing-or-curse/)
- [Mastering GeometryReader in SwiftUI (DEV Community)](https://dev.to/qmshahzad/mastering-geometryreader-in-swiftui-from-basics-to-advanced-layout-control-5akk)
- [SwiftUI Grid, LazyVGrid, LazyHGrid (avanderlee)](https://www.avanderlee.com/swiftui/grid-lazyvgrid-lazyhgrid-gridviews/)
- [Tuning Lazy Stacks and Grids Performance Guide (Medium)](https://medium.com/@wesleymatlock/tuning-lazy-stacks-and-grids-in-swiftui-a-performance-guide-2fb10786f76a)
- [containerRelativeFrame Modifier (fatbobman)](https://fatbobman.com/en/posts/mastering-the-containerrelativeframe-modifier-in-swiftui/)
- [ViewThatFits adaptive layout (Hacking with Swift)](https://www.hackingwithswift.com/quick-start/swiftui/how-to-create-an-adaptive-layout-with-viewthatfits)
- [Mastering ViewThatFits (fatbobman)](https://fatbobman.com/en/posts/mastering-viewthatfits/)
- [Alignment Guides in SwiftUI (The SwiftUI Lab)](https://swiftui-lab.com/alignment-guides/)
- [Managing safe area in SwiftUI (Swift with Majid)](https://swiftwithmajid.com/2021/11/03/managing-safe-area-in-swiftui/)
- [Mastering Safe Area in SwiftUI (fatbobman)](https://fatbobman.com/en/posts/safearea/)
