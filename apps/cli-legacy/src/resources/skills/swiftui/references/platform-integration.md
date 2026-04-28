<overview>
SwiftUI enables true multiplatform development: write once, adapt per platform. A single codebase can target iOS, iPadOS, macOS, watchOS, tvOS, and visionOS while respecting each platform's unique conventions and capabilities.

**Key insight:** SwiftUI's declarative syntax works everywhere, but each platform has distinct interaction models. iOS uses touch and gestures, macOS has precise mouse input and keyboard shortcuts, watchOS centers on the Digital Crown, and visionOS introduces spatial computing with gaze and hand tracking.

**When to read this:**
- Building multiplatform apps with shared logic but platform-specific UI
- Implementing macOS menu bar utilities or Settings windows
- Creating watchOS complications or Digital Crown interactions
- Developing visionOS apps with immersive spaces and ornaments
- Adapting layouts responsively across iPhone, iPad, and Mac
</overview>

<platform_conditionals>
## Platform Conditionals

**Compile-time platform checks:**
```swift
#if os(iOS)
// iOS-only code
#elseif os(macOS)
// macOS-only code
#elseif os(watchOS)
// watchOS-only code
#elseif os(visionOS)
// visionOS-only code
#endif
```

**Runtime API availability:**
```swift
if #available(iOS 17, macOS 14, *) {
    // Use iOS 17+/macOS 14+ API
}
```

**Target environment:**
```swift
#if targetEnvironment(simulator)
// Running in simulator
#endif

#if canImport(UIKit)
// UIKit available
#endif
```
</platform_conditionals>

<ios_specifics>
## iOS-Specific Features

**Navigation patterns:**
- Tab bar at bottom
- Full-screen covers
- Pull-to-refresh with .refreshable

**System integration:**
- Push notifications
- Widgets and Live Activities
- App Intents / Siri

**Device variations:**
```swift
@Environment(\.horizontalSizeClass) var horizontalSizeClass

if horizontalSizeClass == .regular {
    // iPad layout
}
```
</ios_specifics>

<macos_specifics>
## macOS-Specific Features

**Window management:**
```swift
WindowGroup("Main") { ContentView() }
    .defaultSize(width: 800, height: 600)

Window("Settings") { SettingsView() }

Settings { SettingsView() }
```

**MenuBarExtra:**
```swift
MenuBarExtra("App Name", systemImage: "star") {
    MenuBarContentView()
}
.menuBarExtraStyle(.window)
```

**Commands:**
```swift
.commands {
    CommandGroup(replacing: .newItem) {
        Button("New Document") { }
    }
    CommandMenu("Custom") {
        Button("Action") { }
    }
}
```
</macos_specifics>

<watchos_specifics>
## watchOS-Specific Features

**Digital Crown:**
```swift
@State private var crownValue: Double = 0.0

VStack { Text("\(crownValue)") }
    .focusable()
    .digitalCrownRotation($crownValue)
```

**Always-on display:**
```swift
@Environment(\.isLuminanceReduced) var isLuminanceReduced
```
</watchos_specifics>

<visionos_specifics>
## visionOS-Specific Features

**Immersive spaces:**
```swift
ImmersiveSpace(id: "immersive") {
    RealityView { content in
        // 3D content
    }
}
```

**Window styles:**
```swift
.windowStyle(.volumetric)
```

**Ornaments:**
```swift
.ornament(attachmentAnchor: .scene(.bottom)) {
    BottomControls()
}
```
</visionos_specifics>

<responsive_design>
## Responsive Design

**Size classes:**
```swift
@Environment(\.horizontalSizeClass) var horizontalSizeClass
@Environment(\.verticalSizeClass) var verticalSizeClass
```

**ViewThatFits (iOS 16+):**
```swift
ViewThatFits {
    WideLayout()
    CompactLayout()
}
```

**containerRelativeFrame (iOS 17+):**
```swift
.containerRelativeFrame(.horizontal) { length, axis in
    length * 0.8
}
```
</responsive_design>

<decision_tree>
## Platform Strategy

**Shared codebase structure:**
- Models, ViewModels, Services: All platforms
- Views: Platform-specific where needed

**When to use conditionals:**
- Platform-exclusive APIs
- Different navigation patterns
- Different default sizes
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Scattered #if os() conditionals">
**Problem:** Platform checks everywhere
**Instead:** Extract to platform-specific files
</anti_pattern>

<anti_pattern name="Ignoring platform idioms">
**Problem:** iOS patterns on macOS
**Instead:** Respect each platform's conventions
</anti_pattern>

<anti_pattern name="Testing only in simulator">
**Problem:** Missing real device behaviors
**Instead:** Test on physical devices
</anti_pattern>
</anti_patterns>
