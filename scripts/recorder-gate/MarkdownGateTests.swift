import XCTest

final class MarkdownGateTests: XCTestCase {
    private let recorder = XCUIApplication(bundleIdentifier: "co.innosage.labs.airecorder")
    private let files = XCUIApplication(bundleIdentifier: "com.apple.DocumentsApp")
    private let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    private func match(_ app: XCUIApplication, _ label: String, _ kind: XCUIElement.ElementType,
                       partial: Bool = false) -> XCUIElement {
        let pattern = partial ? "label CONTAINS[c] %@ OR identifier CONTAINS[c] %@" : "label ==[c] %@ OR identifier == %@"
        return app.descendants(matching: kind).matching(NSPredicate(format: pattern, label, label)).firstMatch
    }

    private func systemControl(_ label: String, kind: XCUIElement.ElementType = .any,
                               timeout: TimeInterval = 5) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            for app in [recorder, files, springboard] {
                let control = match(app, label, kind)
                if control.exists && control.isHittable && control.isEnabled { return control }
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        } while Date() < deadline
        return nil
    }

    private func tap(_ title: String, partial: Bool = false) {
        let button = match(recorder, title, .button, partial: partial)
        XCTAssertTrue(button.waitForExistence(timeout: 8), "Missing \(title)")
        if !button.isHittable { recorder.swipeUp() }
        XCTAssertTrue(button.isEnabled && button.isHittable, "Unavailable \(title)")
        button.tap()
    }

    private func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
    }

    private func openSavePicker() throws {
        tap("Share transcript (.md)")
        if systemControl("Save to Files", timeout: 3) == nil { recorder.swipeUp() }
        try XCTUnwrap(systemControl("Save to Files", timeout: 8)).tap()
        XCTAssertNotNil(systemControl("DOCPicker.dismissButton", kind: .button, timeout: 6))
    }

    func testCancelAndSaveCommittedRevision() throws {
        continueAfterFailure = false
        recorder.launch()
        tap("Library")
        tap("Maple anchors.m4a", partial: true)
        tap("Open transcript", partial: true)
        XCTAssertTrue(match(recorder, "Saved revision café", .staticText, partial: true).waitForExistence(timeout: 8))
        tap("View original")
        XCTAssertTrue(match(recorder, "Original marker only", .staticText, partial: true).waitForExistence(timeout: 8))
        XCTAssertFalse(match(recorder, "Saved revision café", .staticText, partial: true).exists)

        try openSavePicker()
        try XCTUnwrap(systemControl("DOCPicker.dismissButton", kind: .button)).tap()
        if systemControl("Save to Files", timeout: 2) != nil {
            recorder.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)).tap()
        }
        XCTAssertNotNil(systemControl("Share transcript (.md)", kind: .button, timeout: 8))
        capture("markdown-cancellation-returned")

        try openSavePicker()
        for _ in 0..<3 {
            if match(recorder, "DOC.browsingRoot Source: com.apple.FileProvider.LocalStorage, Title: On My iPhone", .any).exists { break }
            if let local = systemControl("DOC.sidebar.item.On My iPhone", kind: .cell, timeout: 2) {
                local.tap()
            } else if let back = systemControl("BackButton", kind: .button, timeout: 2) {
                back.tap()
            }
        }
        XCTAssertTrue(match(recorder, "DOC.browsingRoot Source: com.apple.FileProvider.LocalStorage, Title: On My iPhone", .any).exists,
                      "The system Files picker must be at the local on-device destination")
        capture("markdown-save-to-files")
        try XCTUnwrap(systemControl("DOCPicker.actionButton", kind: .button, timeout: 8)).tap()
        XCTAssertNotNil(systemControl("Share transcript (.md)", kind: .button, timeout: 8))
        XCTAssertTrue(match(recorder, "Original marker only", .staticText, partial: true).exists)
        capture("markdown-returned-to-original")
    }
}
