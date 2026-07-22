import Foundation
import AppKit
import ApplicationServices

let bundleId = "com.openai.chat"
let axRoleAttribute = kAXRoleAttribute as CFString
let axSubroleAttribute = kAXSubroleAttribute as CFString
let axTitleAttribute = kAXTitleAttribute as CFString
let axDescriptionAttribute = kAXDescriptionAttribute as CFString
let axChildrenAttribute = kAXChildrenAttribute as CFString
let axValueAttribute = kAXValueAttribute as CFString
let axSelectedTextAttribute = kAXSelectedTextAttribute as CFString

func trustPrompted() -> Bool {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    return AXIsProcessTrustedWithOptions(options)
}

func attr(_ element: AXUIElement, _ name: CFString) -> AnyObject? {
    var value: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(element, name, &value)
    return err == .success ? value as AnyObject? : nil
}

func attrString(_ element: AXUIElement, _ name: CFString) -> String? {
    attr(element, name) as? String
}

func attrArray(_ element: AXUIElement, _ name: CFString) -> [AXUIElement] {
    (attr(element, name) as? [AXUIElement]) ?? []
}

func isEditable(_ element: AXUIElement) -> Bool {
    var settable: DarwinBoolean = false
    let valueSettable = AXUIElementIsAttributeSettable(element, axValueAttribute, &settable) == .success && settable.boolValue
    let selectedTextSettable = AXUIElementIsAttributeSettable(element, axSelectedTextAttribute, &settable) == .success && settable.boolValue
    return valueSettable || selectedTextSettable
}

func dumpTree(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 4) {
    let role = attrString(element, axRoleAttribute) ?? "?"
    let subrole = attrString(element, axSubroleAttribute) ?? "-"
    let title = attrString(element, axTitleAttribute) ?? attrString(element, axDescriptionAttribute) ?? ""
    let indent = String(repeating: "  ", count: depth)
    print("\(indent)- role=\(role) subrole=\(subrole) title=\(title)")
    guard depth < maxDepth else { return }
    for child in attrArray(element, axChildrenAttribute) {
        dumpTree(child, depth: depth + 1, maxDepth: maxDepth)
    }
}

func findEditable(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 8) -> AXUIElement? {
    let role = attrString(element, axRoleAttribute) ?? ""
    if ["AXTextField", "AXTextArea", "AXTextView", "AXSearchField"].contains(role), isEditable(element) {
        return element
    }
    guard depth < maxDepth else { return nil }
    for child in attrArray(element, axChildrenAttribute) {
        if let found = findEditable(child, depth: depth + 1, maxDepth: maxDepth) {
            return found
        }
    }
    return nil
}

guard trustPrompted() else {
    fputs("Accessibility trust is not enabled. Grant macOS Accessibility permissions and rerun.\n", stderr)
    exit(2)
}

let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
if apps.isEmpty {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    task.arguments = ["-na", "/Applications/ChatGPT Classic.app"]
    try task.run()
    task.waitUntilExit()
    Thread.sleep(forTimeInterval: 4)
}

guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId).first else {
    fputs("ChatGPT Classic is not running.\n", stderr)
    exit(1)
}

app.activate(options: [.activateIgnoringOtherApps, .activateAllWindows])
Thread.sleep(forTimeInterval: 2)

let axApp = AXUIElementCreateApplication(app.processIdentifier)
print("pid=\(app.processIdentifier)")
print("windows:")
dumpTree(axApp)

if let editable = findEditable(axApp) {
    var current: CFTypeRef?
    AXUIElementCopyAttributeValue(editable, axValueAttribute, &current)
    let before = (current as? String) ?? ""
    print("editable_role=\(attrString(editable, axRoleAttribute) ?? "?")")
    print("before=\(before)")
    exit(0)
}

print("No editable AXTextField/AXTextArea/AXTextView found.")
exit(4)
