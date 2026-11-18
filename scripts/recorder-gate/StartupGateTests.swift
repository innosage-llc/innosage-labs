import XCTest

// Attach to the normal launch; never launch/activate, capture or request input.
final class StartupGateTests: XCTestCase {
    func testRecordHome() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "co.innosage.labs.airecorder")
        let env = ProcessInfo.processInfo.environment
        let launched = try XCTUnwrap(Double(env["LABS85_LAUNCH_UPTIME"] ?? ""))
        let ready = app.buttons["Start recording"].firstMatch
        var window = StabilityWindow(launchedAt: launched)
        var announced = false
        while true {
            let started = ProcessInfo.processInfo.systemUptime
            let foreground = app.state == .runningForeground
            let visible = ready.exists && ready.isHittable
            let completed = ProcessInfo.processInfo.systemUptime
            let complete = try window.record(started: started, completed: completed, foreground: foreground, ready: visible)
            if window.readyAt != nil && !announced { print("LABS85_READY"); announced = true }
            if complete { break } // only a successful completing query ends the window
            Thread.sleep(forTimeInterval: 0.1)
        }
        let readyAt = try XCTUnwrap(window.readyAt)
        let responseStarted = ProcessInfo.processInfo.systemUptime
        app.buttons["Library"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Your recordings live here"].waitForExistence(timeout: 2))
        app.buttons["Record"].firstMatch.tap()
        XCTAssertTrue(ready.waitForExistence(timeout: 2) && ready.isHittable)
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertLessThanOrEqual(ProcessInfo.processInfo.systemUptime - responseStarted, 10, "Responsiveness deadline")
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Record home after stability and navigation"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        // Exact sample times are retained in xctest.log and parsed by the host.
        let samples = window.completedAt.filter { $0 >= readyAt }.map { ($0 - launched) * 1000 }
        let data = try JSONSerialization.data(withJSONObject: ["ready_ms": (readyAt-launched)*1000, "stable_ms": window.stableDuration*1000, "max_gap_ms": window.maxGap*1000, "observed_max_gap_ms": window.maxObservedGap*1000, "samples_ms": samples])
        print("LABS85_OBSERVATION_JSON \(String(decoding: data, as: UTF8.self))")
    }
}
