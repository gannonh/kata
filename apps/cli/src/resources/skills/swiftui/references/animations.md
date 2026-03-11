<overview>
SwiftUI animations are declarative and state-driven. When state changes, SwiftUI automatically animates views from old to new values. Your role is to control timing curves, duration, and which state changes trigger animations.

Key insight: Animations are automatic when state changes - you control timing/curve, not the mechanics.

This file covers:
- Implicit vs explicit animations
- Spring animations (iOS 17+ duration/bounce API)
- Transitions for appearing/disappearing views
- matchedGeometryEffect for hero animations
- PhaseAnimator and KeyframeAnimator (iOS 17+)
- Gesture-driven animations

See also:
- navigation.md for NavigationStack transitions
- performance.md for animation optimization strategies
</overview>

<implicit_animations>
## Implicit Animations (.animation modifier)

Implicit animations apply whenever an animatable property changes on a view. Always specify which value triggers the animation using the `value:` parameter to prevent unexpected animations.

**Basic usage:**
```swift
struct ContentView: View {
    @State private var scale: CGFloat = 1.0

    var body: some View {
        Circle()
            .fill(.blue)
            .scaleEffect(scale)
            .animation(.spring(), value: scale)
            .onTapGesture {
                scale = scale == 1.0 ? 1.5 : 1.0
            }
    }
}
```

**Animation types:**
- `.default` - System default spring animation
- `.linear(duration:)` - Constant speed from start to finish
- `.easeIn(duration:)` - Starts slow, accelerates
- `.easeOut(duration:)` - Starts fast, decelerates
- `.easeInOut(duration:)` - Slow start and end, fast middle
- `.spring()` - iOS 17+ spring with default parameters
- `.bouncy` - Preset spring with high bounce
- `.snappy` - Preset spring with quick, slight bounce
- `.smooth` - Preset spring with no bounce

**Value-specific animation:**
```swift
struct MultiPropertyView: View {
    @State private var rotation: Double = 0
    @State private var scale: CGFloat = 1.0

    var body: some View {
        Rectangle()
            .fill(.red)
            .scaleEffect(scale)
            .rotationEffect(.degrees(rotation))
            .animation(.spring(), value: rotation)  // Only animate rotation
            .animation(.easeInOut, value: scale)    // Different animation for scale
    }
}
```

**Why always use value: parameter:**
- Prevents unexpected animations on unrelated state changes
- Device rotation won't trigger animations
- More predictable behavior
- Better performance (only tracks specific value)
</implicit_animations>

<explicit_animations>
## Explicit Animations (withAnimation)

Explicit animations only affect properties that depend on values changed inside the `withAnimation` closure. Preferred for user-triggered actions.

**Basic usage:**
```swift
struct ContentView: View {
    @State private var isExpanded = false

    var body: some View {
        VStack {
            if isExpanded {
                Text("Details")
                    .transition(.opacity)
            }

            Button("Toggle") {
                withAnimation(.spring()) {
                    isExpanded.toggle()
                }
            }
        }
    }
}
```

**Completion handlers (iOS 17+):**
```swift
Button("Animate") {
    withAnimation(.easeInOut(duration: 1.0)) {
        offset.y = 200
    } completion: {
        // Animation finished - safe to perform next action
        showNextStep = true
    }
}
```

**Transaction-based:**
```swift
var transaction = Transaction(animation: .spring())
transaction.disablesAnimations = true  // Temporarily disable animations

withTransaction(transaction) {
    someState.toggle()
}
```

**Removing animations temporarily:**
```swift
withAnimation(nil) {
    // Changes happen immediately without animation
    resetState()
}
```
</explicit_animations>

<spring_animations>
## Spring Animations

Springs are the default animation in SwiftUI. They feel natural because they mimic real-world physics.

**Modern spring parameters (iOS 17+):**
```swift
// Duration and bounce control
.spring(duration: 0.5, bounce: 0.3)

// No bounce with blend duration for smooth transitions
.spring(duration: 0.5, bounce: 0, blendDuration: 0.2)

// With initial velocity for gesture-driven animations
.spring(duration: 0.6, bounce: 0.4)
```

**Bounce parameter:**
- `-1.0` to `1.0` range
- `0` = no bounce (critically damped)
- `0.3` to `0.5` = natural bounce
- `0.7` to `1.0` = exaggerated bounce
- Negative values create "anticipation" (overshoots in opposite direction first)

**Presets (iOS 17+):**
```swift
.bouncy        // High bounce - playful, attention-grabbing
.snappy        // Quick with slight bounce - feels responsive
.smooth        // No bounce - elegant, sophisticated
```

**Tuning workflow:**
1. Start with duration that feels right
2. Adjust bounce to set character/feeling
3. Use presets first, then customize if needed

**Legacy spring (still works):**
```swift
// For backward compatibility or precise control
.spring(response: 0.5, dampingFraction: 0.7, blendDuration: 0)
```

**When to use springs:**
- User interactions (button presses, drags)
- Most UI state changes
- Default choice unless you need precise timing
</spring_animations>

<transitions>
## Transitions

Transitions control how views appear and disappear. Applied with `.transition()` modifier, animated by wrapping insertion/removal in `withAnimation`.

**Built-in transitions:**
```swift
struct TransitionsDemo: View {
    @State private var showDetail = false

    var body: some View {
        VStack {
            if showDetail {
                Text("Detail")
                    .transition(.opacity)        // Fade in/out
                // .transition(.slide)           // Slide from leading edge
                // .transition(.scale)           // Grow/shrink from center
                // .transition(.move(edge: .bottom))  // Slide from bottom
                // .transition(.push(from: .leading)) // Push from leading (iOS 16+)
            }

            Button("Toggle") {
                withAnimation {
                    showDetail.toggle()
                }
            }
        }
    }
}
```

**Combining transitions:**
```swift
// Both opacity and scale together
.transition(.opacity.combined(with: .scale))

// Different insertion and removal
.transition(.asymmetric(
    insertion: .move(edge: .leading).combined(with: .opacity),
    removal: .move(edge: .trailing).combined(with: .opacity)
))
```

**Custom transitions:**
```swift
struct RotateModifier: ViewModifier {
    let rotation: Double

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees(rotation))
            .opacity(rotation == 0 ? 1 : 0)
    }
}

extension AnyTransition {
    static var pivot: AnyTransition {
        .modifier(
            active: RotateModifier(rotation: -90),
            identity: RotateModifier(rotation: 0)
        )
    }
}

// Usage
Text("Pivoting in")
    .transition(.pivot)
```

**Identity vs insertion/removal:**
- `identity` = final state when view is visible
- `active` = state during transition (appearing/disappearing)
</transitions>

<matched_geometry>
## matchedGeometryEffect

Synchronizes geometry between two views with the same ID, creating hero animations. Views don't need to be in the same container.

**Basic hero animation:**
```swift
struct HeroDemo: View {
    @State private var isExpanded = false
    @Namespace private var animation

    var body: some View {
        VStack {
            if !isExpanded {
                // Thumbnail state
                Circle()
                    .fill(.blue)
                    .frame(width: 60, height: 60)
                    .matchedGeometryEffect(id: "circle", in: animation)
                    .onTapGesture {
                        withAnimation(.spring()) {
                            isExpanded = true
                        }
                    }
            } else {
                // Expanded state
                VStack {
                    Circle()
                        .fill(.blue)
                        .frame(width: 200, height: 200)
                        .matchedGeometryEffect(id: "circle", in: animation)

                    Button("Close") {
                        withAnimation(.spring()) {
                            isExpanded = false
                        }
                    }
                }
            }
        }
    }
}
```

**Creating namespace:**
```swift
@Namespace private var animation  // Property wrapper creates unique namespace
```

**isSource parameter:**
Controls which view provides geometry during transition.

```swift
// Example: Grid to detail view
struct ContentView: View {
    @State private var selectedItem: Item?
    @Namespace private var namespace

    var body: some View {
        ZStack {
            // Grid view
            LazyVGrid(columns: columns) {
                ForEach(items) { item in
                    ItemCard(item: item)
                        .matchedGeometryEffect(
                            id: item.id,
                            in: namespace,
                            isSource: selectedItem == nil  // Source when detail not shown
                        )
                        .onTapGesture {
                            selectedItem = item
                        }
                }
            }

            // Detail view
            if let item = selectedItem {
                DetailView(item: item)
                    .matchedGeometryEffect(
                        id: item.id,
                        in: namespace,
                        isSource: selectedItem != nil  // Source when detail shown
                    )
            }
        }
        .animation(.spring(), value: selectedItem)
    }
}
```

**Properties parameter:**
Control what gets matched.

```swift
.matchedGeometryEffect(
    id: "shape",
    in: namespace,
    properties: .frame  // Only match frame, not position
)

// Options: .frame, .position, .size
```

**Common pitfalls:**
- **Both views must exist simultaneously** during animation - use conditional rendering carefully
- **Same ID required** - use stable identifiers (UUIDs, database IDs)
- **Need explicit animation** - wrap state changes in `withAnimation`
- **ZStack coordination** - often need ZStack to ensure both views render during transition
</matched_geometry>

<phased_animations>
## Phased Animations (iOS 17+)

PhaseAnimator automatically cycles through animation phases. Ideal for loading indicators, attention-grabbing effects, or multi-step sequences.

**PhaseAnimator with continuous cycling:**
```swift
struct PulsingCircle: View {
    var body: some View {
        PhaseAnimator([false, true]) { isLarge in
            Circle()
                .fill(.red)
                .scaleEffect(isLarge ? 1.5 : 1.0)
                .opacity(isLarge ? 0.5 : 1.0)
        } animation: { phase in
            .easeInOut(duration: 1.0)
        }
    }
}
```

**PhaseAnimator with enum phases:**
```swift
enum LoadingPhase: CaseIterable {
    case initial, loading, success

    var scale: CGFloat {
        switch self {
        case .initial: 1.0
        case .loading: 1.2
        case .success: 1.5
        }
    }

    var color: Color {
        switch self {
        case .initial: .gray
        case .loading: .blue
        case .success: .green
        }
    }
}

struct LoadingButton: View {
    var body: some View {
        PhaseAnimator(LoadingPhase.allCases) { phase in
            Circle()
                .fill(phase.color)
                .scaleEffect(phase.scale)
        } animation: { phase in
            switch phase {
            case .initial: .easeIn(duration: 0.3)
            case .loading: .easeInOut(duration: 0.5)
            case .success: .spring(duration: 0.6, bounce: 0.4)
            }
        }
    }
}
```

**Trigger-based PhaseAnimator:**
```swift
struct TriggerDemo: View {
    @State private var triggerValue = 0

    var body: some View {
        VStack {
            PhaseAnimator([0, 1, 2], trigger: triggerValue) { phase in
                RoundedRectangle(cornerRadius: 12)
                    .fill(.blue)
                    .frame(width: 100 + CGFloat(phase * 50), height: 100)
                    .offset(x: CGFloat(phase * 20))
            }

            Button("Animate") {
                triggerValue += 1
            }
        }
    }
}
```

**Use cases:**
- Loading spinners and progress indicators
- Attention-grabbing call-to-action buttons
- Celebratory success animations
- Idle state animations
- Tutorial highlights
</phased_animations>

<keyframe_animations>
## Keyframe Animations (iOS 17+)

KeyframeAnimator provides frame-by-frame control over complex animations. More powerful than PhaseAnimator when you need precise timing and multiple simultaneous property changes.

**Basic KeyframeAnimator:**
```swift
struct AnimationValues {
    var scale = 1.0
    var rotation = 0.0
    var opacity = 1.0
}

struct KeyframeDemo: View {
    @State private var trigger = false

    var body: some View {
        KeyframeAnimator(
            initialValue: AnimationValues(),
            trigger: trigger
        ) { values in
            Rectangle()
                .fill(.purple)
                .scaleEffect(values.scale)
                .rotationEffect(.degrees(values.rotation))
                .opacity(values.opacity)
                .frame(width: 100, height: 100)
        } keyframes: { _ in
            KeyframeTrack(\.scale) {
                SpringKeyframe(1.5, duration: 0.3)
                CubicKeyframe(0.8, duration: 0.2)
                CubicKeyframe(1.0, duration: 0.2)
            }

            KeyframeTrack(\.rotation) {
                LinearKeyframe(180, duration: 0.4)
                CubicKeyframe(360, duration: 0.3)
            }

            KeyframeTrack(\.opacity) {
                CubicKeyframe(0.5, duration: 0.3)
                CubicKeyframe(1.0, duration: 0.4)
            }
        }
        .onTapGesture {
            trigger.toggle()
        }
    }
}
```

**Keyframe types:**

```swift
// Linear - constant speed interpolation
LinearKeyframe(targetValue, duration: 0.5)

// Cubic - smooth Bezier curve
CubicKeyframe(targetValue, duration: 0.5)

// Spring - physics-based bounce
SpringKeyframe(targetValue, duration: 0.5, spring: .bouncy)

// Move - jump immediately to value
MoveKeyframe(targetValue)
```

**Complex multi-property animation:**
```swift
struct AnimationState {
    var position: CGPoint = .zero
    var color: Color = .blue
    var size: CGFloat = 50
}

KeyframeAnimator(initialValue: AnimationState(), trigger: animate) { state in
    Circle()
        .fill(state.color)
        .frame(width: state.size, height: state.size)
        .position(state.position)
} keyframes: { _ in
    KeyframeTrack(\.position) {
        CubicKeyframe(CGPoint(x: 200, y: 100), duration: 0.4)
        SpringKeyframe(CGPoint(x: 200, y: 300), duration: 0.6)
        CubicKeyframe(CGPoint(x: 0, y: 0), duration: 0.5)
    }

    KeyframeTrack(\.color) {
        CubicKeyframe(.red, duration: 0.5)
        CubicKeyframe(.green, duration: 0.5)
        CubicKeyframe(.blue, duration: 0.5)
    }

    KeyframeTrack(\.size) {
        SpringKeyframe(100, duration: 0.6, spring: .bouncy)
        CubicKeyframe(50, duration: 0.4)
    }
}
```

**When to use KeyframeAnimator:**
- Complex choreographed animations
- Precise timing control needed
- Multiple properties animating with different curves
- Path-based animations
- Recreating motion design prototypes
</keyframe_animations>

<gesture_animations>
## Gesture-Driven Animations

Interactive animations that respond to user input in real-time.

**DragGesture with spring animation:**
```swift
struct DraggableCard: View {
    @State private var offset: CGSize = .zero

    var body: some View {
        RoundedRectangle(cornerRadius: 20)
            .fill(.blue)
            .frame(width: 200, height: 300)
            .offset(offset)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        offset = value.translation
                    }
                    .onEnded { _ in
                        withAnimation(.spring(duration: 0.5, bounce: 0.3)) {
                            offset = .zero
                        }
                    }
            )
    }
}
```

**Interruptible animations:**
```swift
struct InterruptibleView: View {
    @State private var position: CGFloat = 0

    var body: some View {
        Circle()
            .fill(.red)
            .frame(width: 60, height: 60)
            .offset(y: position)
            .animation(.spring(), value: position)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        // Interrupts ongoing animation immediately
                        position = value.translation.height
                    }
                    .onEnded { value in
                        // Determine snap point based on velocity
                        let velocity = value.predictedEndLocation.y - value.location.y

                        if abs(velocity) > 500 {
                            position = velocity > 0 ? 300 : -300
                        } else {
                            position = 0
                        }
                    }
            )
    }
}
```

**GestureState for automatic reset:**
```swift
struct GestureStateExample: View {
    @GestureState private var dragOffset: CGSize = .zero
    @State private var permanentOffset: CGSize = .zero

    var body: some View {
        Rectangle()
            .fill(.purple)
            .frame(width: 100, height: 100)
            .offset(x: permanentOffset.width + dragOffset.width,
                   y: permanentOffset.height + dragOffset.height)
            .gesture(
                DragGesture()
                    .updating($dragOffset) { value, state, _ in
                        state = value.translation
                    }
                    .onEnded { value in
                        withAnimation(.spring()) {
                            permanentOffset.width += value.translation.width
                            permanentOffset.height += value.translation.height
                        }
                    }
            )
    }
}
```

**Combining gestures with animations:**
```swift
struct SwipeToDelete: View {
    @State private var offset: CGFloat = 0
    @State private var isDeleted = false

    var body: some View {
        if !isDeleted {
            HStack {
                Text("Swipe to delete")
                Spacer()
            }
            .padding()
            .background(.white)
            .offset(x: offset)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        if value.translation.width < 0 {
                            offset = value.translation.width
                        }
                    }
                    .onEnded { value in
                        if offset < -100 {
                            withAnimation(.easeOut(duration: 0.3)) {
                                offset = -500
                            } completion: {
                                isDeleted = true
                            }
                        } else {
                            withAnimation(.spring()) {
                                offset = 0
                            }
                        }
                    }
            )
        }
    }
}
```

**Velocity-based animations:**
```swift
struct VelocityDrag: View {
    @State private var offset: CGSize = .zero

    var body: some View {
        Circle()
            .fill(.green)
            .frame(width: 80, height: 80)
            .offset(offset)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        offset = value.translation
                    }
                    .onEnded { value in
                        let velocity = value.velocity

                        // Use velocity magnitude to determine spring response
                        let speed = sqrt(velocity.width * velocity.width +
                                       velocity.height * velocity.height)

                        let animation: Animation = speed > 1000
                            ? .spring(duration: 0.4, bounce: 0.5)
                            : .spring(duration: 0.6, bounce: 0.3)

                        withAnimation(animation) {
                            offset = .zero
                        }
                    }
            )
    }
}
```
</gesture_animations>

<decision_tree>
## Choosing the Right Animation

**Simple state change:**
- Use `.animation(.default, value: state)` for single property changes
- Implicit animation is simplest approach

**User-triggered change:**
- Use `withAnimation { }` for button taps, user actions
- Explicit animation provides better control
- Use completion handlers (iOS 17+) for sequential actions

**View appearing/disappearing:**
- Use `.transition()` for conditional views
- Combine with `withAnimation` to trigger
- Consider `.asymmetric()` for different in/out animations

**Shared element between screens:**
- Use `matchedGeometryEffect` for hero animations
- Requires both views to exist during transition
- Best with `@Namespace` and explicit animations

**Multi-step sequence:**
- Use `PhaseAnimator` (iOS 17+) for simple phase-based sequences
- Great for loading states, idle animations
- Trigger-based for user-initiated sequences

**Complex keyframed motion:**
- Use `KeyframeAnimator` (iOS 17+) for precise timing
- Multiple properties with independent curves
- Recreating motion design specs

**User-controlled motion:**
- Use `DragGesture` + animation for interactive elements
- `@GestureState` for automatic state reset
- Consider velocity for natural physics

**Performance tips:**
- Animate opacity, scale, offset (cheap)
- Avoid animating frame size, padding (expensive)
- Use `.drawingGroup()` for complex hierarchies being animated
- Avoid animating during scroll (competes with scroll performance)
- Profile with Instruments if animations drop frames
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="Animation without value parameter">
**Problem:**
```swift
.animation(.spring())  // No value parameter
```

**Why it's bad:**
Animates every property change, including device rotation, parent view updates, and unrelated state changes. Creates unexpected animations and performance issues.

**Instead:**
```swift
.animation(.spring(), value: specificState)
```
</anti_pattern>

<anti_pattern name="Animating layout-heavy properties">
**Problem:**
```swift
withAnimation {
    frameWidth = 300  // Triggers layout recalculation
    padding = 20      // Triggers layout recalculation
}
```

**Why it's bad:**
Frame size and padding changes force SwiftUI to recalculate layout, which is expensive. Can cause stuttering on complex views.

**Instead:**
```swift
withAnimation {
    scale = 1.5        // Cheap transform
    opacity = 0.5      // Cheap property
    offset = CGSize(width: 20, height: 0)  // Cheap transform
}
```
</anti_pattern>

<anti_pattern name="matchedGeometryEffect without namespace">
**Problem:**
```swift
Circle()
    .matchedGeometryEffect(id: "circle", in: ???)  // Forgot @Namespace
```

**Why it's bad:**
Won't compile. Namespace is required to coordinate geometry matching.

**Instead:**
```swift
@Namespace private var animation

Circle()
    .matchedGeometryEffect(id: "circle", in: animation)
```
</anti_pattern>

<anti_pattern name="Nested withAnimation blocks">
**Problem:**
```swift
withAnimation(.easeIn) {
    withAnimation(.spring()) {
        state = newValue
    }
}
```

**Why it's bad:**
Inner animation is ignored. Only outer animation applies. Creates confusion about which animation runs.

**Instead:**
```swift
withAnimation(.spring()) {
    state = newValue
}
```
</anti_pattern>

<anti_pattern name="Transition without withAnimation">
**Problem:**
```swift
if showDetail {
    DetailView()
        .transition(.slide)  // Transition defined but not triggered
}
```

**Why it's bad:**
View appears/disappears instantly. Transition is never applied without animation context.

**Instead:**
```swift
Button("Toggle") {
    withAnimation {
        showDetail.toggle()
    }
}
```
</anti_pattern>

<anti_pattern name="Animating computed properties">
**Problem:**
```swift
var computedValue: Double {
    return stateA * stateB
}

.animation(.spring(), value: computedValue)
```

**Why it's bad:**
Computed properties can change for many reasons. Animation triggers on any dependency change, not just intentional updates.

**Instead:**
```swift
.animation(.spring(), value: stateA)
.animation(.spring(), value: stateB)
```
</anti_pattern>

<anti_pattern name="matchedGeometryEffect with overlapping views">
**Problem:**
```swift
// Both views exist at same time with same ID
GridItem()
    .matchedGeometryEffect(id: item.id, in: namespace)

DetailItem()
    .matchedGeometryEffect(id: item.id, in: namespace)
```

**Why it's bad:**
Without proper `isSource` configuration, SwiftUI doesn't know which view's geometry to use. Creates unpredictable animations.

**Instead:**
```swift
GridItem()
    .matchedGeometryEffect(id: item.id, in: namespace, isSource: selectedItem == nil)

DetailItem()
    .matchedGeometryEffect(id: item.id, in: namespace, isSource: selectedItem != nil)
```
</anti_pattern>
</anti_patterns>
