<overview>
SwiftUI wraps UIKit on iOS and AppKit on macOS. Interoperability enables using UIKit/AppKit features not yet available in SwiftUI, and incrementally adopting SwiftUI in existing projects.

**Bridging patterns:**
- **SwiftUI → UIKit/AppKit**: UIViewRepresentable, NSViewRepresentable, UIViewControllerRepresentable
- **UIKit/AppKit → SwiftUI**: UIHostingController, NSHostingController/NSHostingView
- **Coordinator pattern**: Bridge delegates and target-action patterns to SwiftUI

**When to read this:**
- Wrapping UIKit views not available in SwiftUI
- Embedding SwiftUI in existing UIKit apps
- Handling delegate-based APIs
</overview>

<uiview_representable>
## UIViewRepresentable

**Basic structure:**
```swift
struct CustomTextField: UIViewRepresentable {
    @Binding var text: String

    func makeUIView(context: Context) -> UITextField {
        let textField = UITextField()
        textField.delegate = context.coordinator
        return textField
    }

    func updateUIView(_ uiView: UITextField, context: Context) {
        if uiView.text != text {
            uiView.text = text
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UITextFieldDelegate {
        var parent: CustomTextField

        init(_ parent: CustomTextField) {
            self.parent = parent
        }

        func textFieldDidChangeSelection(_ textField: UITextField) {
            parent.text = textField.text ?? ""
        }
    }
}
```

**Lifecycle:**
- `makeUIView` - called once when created
- `updateUIView` - called when SwiftUI state changes
- `dismantleUIView` - optional cleanup
</uiview_representable>

<uiviewcontroller_representable>
## UIViewControllerRepresentable

```swift
struct ImagePicker: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    @Environment(\.dismiss) var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ImagePicker

        init(_ parent: ImagePicker) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            parent.image = info[.originalImage] as? UIImage
            parent.dismiss()
        }
    }
}
```
</uiviewcontroller_representable>

<nsview_representable>
## NSViewRepresentable (macOS)

Same pattern as UIViewRepresentable:

```swift
struct ColorWell: NSViewRepresentable {
    @Binding var color: NSColor

    func makeNSView(context: Context) -> NSColorWell {
        let colorWell = NSColorWell()
        colorWell.target = context.coordinator
        colorWell.action = #selector(Coordinator.colorDidChange(_:))
        return colorWell
    }

    func updateNSView(_ nsView: NSColorWell, context: Context) {
        nsView.color = color
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject {
        var parent: ColorWell

        init(_ parent: ColorWell) {
            self.parent = parent
        }

        @objc func colorDidChange(_ sender: NSColorWell) {
            parent.color = sender.color
        }
    }
}
```
</nsview_representable>

<hosting_controller>
## UIHostingController

**Embedding SwiftUI in UIKit:**
```swift
class MainViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        let swiftUIView = MySwiftUIView()
        let hostingController = UIHostingController(rootView: swiftUIView)

        addChild(hostingController)
        view.addSubview(hostingController.view)

        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hostingController.didMove(toParent: self)
    }
}
```
</hosting_controller>

<coordinator_pattern>
## Coordinator Pattern

**When to use:**
- Handling delegate callbacks
- Managing target-action patterns
- Bridging imperative events to SwiftUI

**Structure:**
```swift
func makeCoordinator() -> Coordinator {
    Coordinator(self)
}

class Coordinator: NSObject, SomeDelegate {
    var parent: ParentView

    init(_ parent: ParentView) {
        self.parent = parent
    }
}
```
</coordinator_pattern>

<decision_tree>
## When to Use Interop

**Use UIKit/AppKit when:**
- SwiftUI lacks the feature
- Performance critical scenarios
- Integrating existing code

**Stay with pure SwiftUI when:**
- SwiftUI has native support
- Xcode Previews matter
- Cross-platform code needed
</decision_tree>

<anti_patterns>
## What NOT to Do

<anti_pattern name="UIKit by default">
**Problem:** Using UIViewRepresentable when SwiftUI works
**Instead:** Check if SwiftUI added the feature
</anti_pattern>

<anti_pattern name="Skipping Coordinator">
**Problem:** Handling delegates without Coordinator
**Instead:** Always use Coordinator for delegate patterns
</anti_pattern>

<anti_pattern name="Memory leaks in hosting">
**Problem:** Not managing child view controller properly
**Instead:** addChild → addSubview → didMove(toParent:)
</anti_pattern>
</anti_patterns>
