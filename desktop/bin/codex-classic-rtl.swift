import Foundation
import AppKit
import ApplicationServices
import CoreGraphics

let bundleId = "com.openai.chat"
let proofText = "سلام"

let args = Set(CommandLine.arguments.dropFirst())
let shouldProof = args.contains("--proof")
let shouldSend = args.contains("--send")
let shouldRestore = args.contains("--restore")
let shouldWait = args.contains("--wait") || shouldProof || shouldSend || shouldRestore
let stateURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("codex-classic-rtl-state.txt")

let axRole = kAXRoleAttribute as CFString
let axSubrole = kAXSubroleAttribute as CFString
let axTitle = kAXTitleAttribute as CFString
let axDescription = kAXDescriptionAttribute as CFString
let axChildren = kAXChildrenAttribute as CFString
let axValue = kAXValueAttribute as CFString
let axSelectedText = kAXSelectedTextAttribute as CFString
let axSelectedTextRange = kAXSelectedTextRangeAttribute as CFString
let axWindowNumber = "AXWindowNumber" as CFString

func trustPrompted() -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}

func attr(_ element: AXUIElement, _ name: CFString) -> AnyObject? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, name, &value)
    return result == .success ? value as AnyObject? : nil
}

func attrString(_ element: AXUIElement, _ name: CFString) -> String? {
    attr(element, name) as? String
}

func attrArray(_ element: AXUIElement, _ name: CFString) -> [AXUIElement] {
    (attr(element, name) as? [AXUIElement]) ?? []
}

func actionNames(_ element: AXUIElement) -> [String] {
    var actions: CFArray?
    guard AXUIElementCopyActionNames(element, &actions) == .success else { return [] }
    return (actions as? [String]) ?? []
}

func attributeNames(_ element: AXUIElement) -> [String] {
    var attributes: CFArray?
    guard AXUIElementCopyAttributeNames(element, &attributes) == .success else { return [] }
    return (attributes as? [String]) ?? []
}

func isEditable(_ element: AXUIElement) -> Bool {
    var settable: DarwinBoolean = false
    let valueSettable = AXUIElementIsAttributeSettable(element, axValue, &settable) == .success && settable.boolValue
    let selectedTextSettable = AXUIElementIsAttributeSettable(element, axSelectedText, &settable) == .success && settable.boolValue
    let selectedRangeSettable = AXUIElementIsAttributeSettable(element, axSelectedTextRange, &settable) == .success && settable.boolValue
    return valueSettable || selectedTextSettable || selectedRangeSettable
}

func dumpTree(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 5) {
    let indent = String(repeating: "  ", count: depth)
    let role = attrString(element, axRole) ?? "?"
    let subrole = attrString(element, axSubrole) ?? "-"
    let title = attrString(element, axTitle) ?? attrString(element, axDescription) ?? ""
    let value = attr(element, axValue).map { "\($0)" } ?? ""
    print("\(indent)- role=\(role) subrole=\(subrole) title=\(title) value=\(value)")
    guard depth < maxDepth else { return }
    for child in attrArray(element, axChildren) {
        dumpTree(child, depth: depth + 1, maxDepth: maxDepth)
    }
}

func dumpTextNodes(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 10) {
    let role = attrString(element, axRole) ?? ""
    let title = attrString(element, axTitle) ?? ""
    let value = attr(element, axValue).map { "\($0)" } ?? ""
    let description = attrString(element, axDescription) ?? ""
    if ["AXStaticText", "AXTextField", "AXTextArea", "AXTextView", "AXWebArea"].contains(role) || !title.isEmpty || !value.isEmpty || !description.isEmpty {
        let indent = String(repeating: "  ", count: depth)
        print("\(indent)text_node role=\(role) title=\(title) value=\(value) description=\(description)")
    }
    guard depth < maxDepth else { return }
    for child in attrArray(element, axChildren) {
        dumpTextNodes(child, depth: depth + 1, maxDepth: maxDepth)
    }
}

func findEditable(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 8) -> AXUIElement? {
    let role = attrString(element, axRole) ?? ""
    if ["AXTextField", "AXTextArea", "AXTextView", "AXSearchField"].contains(role), isEditable(element) {
        return element
    }
    guard depth < maxDepth else { return nil }
    for child in attrArray(element, axChildren) {
        if let found = findEditable(child, depth: depth + 1, maxDepth: maxDepth) {
            return found
        }
    }
    return nil
}

func findButtons(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 8) -> [AXUIElement] {
    var result: [AXUIElement] = []
    let role = attrString(element, axRole) ?? ""
    if role == "AXButton" { result.append(element) }
    guard depth < maxDepth else { return result }
    for child in attrArray(element, axChildren) {
        result.append(contentsOf: findButtons(child, depth: depth + 1, maxDepth: maxDepth))
    }
    return result
}

func launchIfNeeded() {
    if NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).isEmpty {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        task.arguments = ["-na", "/Applications/ChatGPT Classic.app"]
        try? task.run()
        task.waitUntilExit()
        Thread.sleep(forTimeInterval: 3)
    }
}

func waitForWindow(_ app: NSRunningApplication, timeout: TimeInterval = 15) {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        if !attrArray(axApp, kAXWindowsAttribute as CFString).isEmpty {
            return
        }
        Thread.sleep(forTimeInterval: 0.5)
    }
}

func waitForEditable(_ app: NSRunningApplication, timeout: TimeInterval = 15) -> AXUIElement? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        if let editable = findEditable(axApp) {
            return editable
        }
        Thread.sleep(forTimeInterval: 0.5)
    }
    return nil
}

func activateApp(_ app: NSRunningApplication) {
    app.activate(options: [.activateAllWindows])
    Thread.sleep(forTimeInterval: 2)
}

func sendReturnKey() {
    let source = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: true)
    let up = CGEvent(keyboardEventSource: source, virtualKey: 36, keyDown: false)
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
}

func saveState(_ value: String) {
    try? value.write(to: stateURL, atomically: true, encoding: .utf8)
}

func loadState() -> String? {
    try? String(contentsOf: stateURL, encoding: .utf8)
}

guard trustPrompted() else {
    fputs("Accessibility permission is missing. Enable System Settings → Privacy & Security → Accessibility for /Library/Developer/CommandLineTools/usr/bin/swift, then rerun.\n", stderr)
    exit(2)
}

launchIfNeeded()

guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first else {
    fputs("ChatGPT Classic is not running.\n", stderr)
    exit(1)
}

activateApp(app)
if shouldWait {
    waitForWindow(app)
}

let axApp = AXUIElementCreateApplication(app.processIdentifier)
let windows = attrArray(axApp, kAXWindowsAttribute as CFString)
print("helper_executable=/Library/Developer/CommandLineTools/usr/bin/swift")
print("pid=\(app.processIdentifier)")
print("windows_count=\(windows.count)")
for window in windows {
    dumpTree(window)
    dumpTextNodes(window)
    if let number = attr(window, axWindowNumber) {
        print("window_number=\(number)")
    }
}

guard let editable = waitForEditable(app) ?? findEditable(axApp) else {
    fputs("No editable AXTextArea/AXTextField/AXTextView found.\n", stderr)
    exit(4)
}

let editableRole = attrString(editable, axRole) ?? "?"
let editableSubrole = attrString(editable, axSubrole) ?? "-"
let beforeValue = attr(editable, axValue).map { "\($0)" } ?? ""
print("editable_role=\(editableRole)")
print("editable_subrole=\(editableSubrole)")
print("editable_attributes=\(attributeNames(editable).sorted())")
print("editable_actions=\(actionNames(editable).sorted())")
print("before_value=\(beforeValue)")

if shouldProof || shouldSend || shouldRestore {
    if shouldProof && !shouldRestore {
        saveState(beforeValue)
    }

    let targetValue = shouldRestore ? (loadState() ?? "") : proofText
    let setResult = AXUIElementSetAttributeValue(editable, axValue, targetValue as CFTypeRef)
    Thread.sleep(forTimeInterval: 0.4)
    let afterValue = attr(editable, axValue).map { "\($0)" } ?? ""
    print("set_result=\(setResult.rawValue)")
    print("after_value=\(afterValue)")
    print("selected_text=\(attr(editable, axSelectedText).map { "\($0)" } ?? "")")
    print("selected_range=\(attr(editable, axSelectedTextRange).map { "\($0)" } ?? "")")

    if shouldSend && !shouldRestore {
        sendReturnKey()
        print("return_sent=true")
    }
}

exit(0)
