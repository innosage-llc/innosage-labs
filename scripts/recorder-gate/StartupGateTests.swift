import XCTest

// Attached to the normally launched app. Never calls launch(), activate(), Start,
// recording, permission APIs or a provider. Process lifetime is also monitored
// outside XCTest by the local driver, beginning before simctl launch.
final class StartupGateTests: XCTestCase {
    func testRecordHome() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "co.innosage.labs.airecorder")
        let env = ProcessInfo.processInfo.environment
        let launched = try XCTUnwrap(Double(env["LABS85_LAUNCH_UPTIME"] ?? ""))
        let ready = app.buttons["Start recording"].firstMatch
        while ProcessInfo.processInfo.systemUptime - launched < 30 {
            XCTAssertEqual(app.state, .runningForeground)
            if ready.exists && ready.isHittable { break }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTAssertLessThanOrEqual(ProcessInfo.processInfo.systemUptime - launched, 30)
        XCTAssertTrue(ready.exists && ready.isHittable, "Record home not ready")
        let readyAt = ProcessInfo.processInfo.systemUptime
        print("LABS85_READY")
        var observations = 0
        repeat {
            XCTAssertEqual(app.state, .runningForeground)
            XCTAssertTrue(ready.exists && ready.isHittable, "Record control disappeared")
            observations += 1
            Thread.sleep(forTimeInterval: 0.1)
        } while ProcessInfo.processInfo.systemUptime - readyAt < 5
        // A harmless navigation round trip proves the normal app responds.
        app.buttons["Library"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Your recordings live here"].waitForExistence(timeout: 2))
        app.buttons["Record"].firstMatch.tap()
        XCTAssertTrue(ready.waitForExistence(timeout: 2) && ready.isHittable)
        XCTAssertEqual(app.state, .runningForeground)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Record home after stability and navigation"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        print("LABS85_OBSERVATION ready_ms=\((readyAt-launched)*1000) stable_ms=\((ProcessInfo.processInfo.systemUptime-readyAt)*1000) samples=\(observations)")
    }
}
