import XCTest

final class LibraryImportTests: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "co.innosage.labs.airecorder")
    let tone = "Labs146Tone"
    let forged = "Labs146Forged"

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
        let tab = app.buttons.matching(NSPredicate(format: "label IN %@", ["Library", "folder"])).firstMatch
        XCTAssertTrue(tab.waitForExistence(timeout: 12))
        tab.tap()
    }

    var action: XCUIElement { app.buttons["Import audio"] }

    func matching(_ text: String, _ type: XCUIElement.ElementType = .any) -> XCUIElement {
        app.descendants(matching: type).matching(NSPredicate(format: "label BEGINSWITH[c] %@", text)).firstMatch
    }

    func select(_ filename: String) {
        action.tap()
        let file = matching(filename)
        if !file.waitForExistence(timeout: 2) {
            let browse = app.buttons["Browse"].firstMatch
            if browse.exists { browse.tap() }
            let local = matching("On My iPhone")
            if local.waitForExistence(timeout: 2) { local.tap() }
        }
        XCTAssertTrue(file.waitForExistence(timeout: 8), app.debugDescription)
        file.tap()
        let open = app.buttons["Open"].firstMatch
        if open.waitForExistence(timeout: 1), open.isEnabled { open.tap() }
    }

    func testCancelRepeatAndReject() {
        XCTAssertEqual(app.buttons.matching(identifier: "Import audio").count, 1)
        XCTAssertTrue(action.isHittable)
        let picture = XCTAttachment(screenshot: app.screenshot())
        picture.name = "Library import toolbar"
        picture.lifetime = .keepAlways
        add(picture)
        action.doubleTap()
        let cancel = app.buttons["Cancel"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 10))
        cancel.tap()
        XCTAssertTrue(action.waitForExistence(timeout: 6))
        select(forged)
        XCTAssertTrue(matching("Choose an M4A containing an MP4 audio track.").waitForExistence(timeout: 8))
        XCTAssertFalse(matching(forged, .button).exists)
    }

    func testFailedSave() {
        select(tone)
        XCTAssertTrue(matching("Could not import the audio.").waitForExistence(timeout: 8), app.debugDescription)
        XCTAssertFalse(matching(tone, .button).exists)
    }

    func testRetry() {
        select(tone)
        XCTAssertTrue(matching(tone, .button).waitForExistence(timeout: 8), app.debugDescription)
    }

    func testColdPlayback() {
        let row = matching(tone, .button)
        XCTAssertTrue(row.waitForExistence(timeout: 8))
        row.tap()
        let play = matching("Play " + tone, .button)
        XCTAssertTrue(play.waitForExistence(timeout: 8), app.debugDescription)
        play.tap()
        XCTAssertTrue(matching("Pause " + tone, .button).waitForExistence(timeout: 4))
    }
}
