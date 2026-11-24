import CoreFoundation
import XCTest

private final class LaunchSignal {
    private let lock = NSLock()
    private var ready = false
    var received: Bool {
        lock.lock()
        defer { lock.unlock() }
        return ready
    }
    func mark() {
        lock.lock()
        ready = true
        lock.unlock()
    }
}

// Attach to the normal launch; never launch/activate, capture or request input.
final class StartupGateTests: XCTestCase {
    func testRecordHome() throws {
        continueAfterFailure = false
        let armedAt = ProcessInfo.processInfo.systemUptime
        let signal = try XCTUnwrap(ProcessInfo.processInfo.environment["LABS85_LAUNCH_NOTIFICATION"])
        let name = CFNotificationName(rawValue: signal as CFString)
        let listener = LaunchSignal()
        let opaque = Unmanaged.passUnretained(listener).toOpaque()
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterAddObserver(center, opaque, { _, context, _, _, _ in
            if let context {
                Unmanaged<LaunchSignal>.fromOpaque(context).takeUnretainedValue().mark()
            }
        }, name.rawValue, nil, .deliverImmediately)
        defer {
            CFNotificationCenterRemoveObserver(center, opaque, name, nil)
            withExtendedLifetime(listener) {}
        }
        FileHandle.standardOutput.write(Data("LABS85_XCTEST_ARMED\n".utf8))
        while !listener.received {
            guard ProcessInfo.processInfo.systemUptime - armedAt <= 40 else {
                throw StabilityWindow.Invalid.readiness
            }
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.1))
        }
        // Time in XCTest setup does not replace the host's actual start clock.
        var attached: XCUIApplication?
        var previous: XCUIApplication.State?
        while ProcessInfo.processInfo.systemUptime - armedAt <= 45 {
            let candidate = XCUIApplication(bundleIdentifier: "co.innosage.labs.airecorder")
            let state = candidate.state
            if state != previous {
                FileHandle.standardOutput.write(Data("LABS85_ATTACH_STATE \(state.rawValue)\n".utf8))
                previous = state
            }
            if state == .runningForeground {
                attached = candidate
                break
            }
            Thread.sleep(forTimeInterval: 0.15)
        }
        let app = try XCTUnwrap(attached, "No foreground product process after the normal launch")
        let ready = app.buttons["Start recording"].firstMatch
        var window = StabilityWindow(launchedAt: ProcessInfo.processInfo.systemUptime)
        var announced = false
        while true {
            let started = ProcessInfo.processInfo.systemUptime
            let foreground = app.state == .runningForeground
            let visible = ready.exists && ready.isHittable
            let completed = ProcessInfo.processInfo.systemUptime
            let complete = try window.record(started: started, completed: completed, foreground: foreground, ready: visible)
            if window.readyAt != nil && !announced {
                FileHandle.standardOutput.write(Data("LABS85_READY\n".utf8))
                announced = true
            }
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
        let samples = window.completedAt.filter { $0 >= readyAt }.map { $0 * 1000 }
        let data = try JSONSerialization.data(withJSONObject: ["clock": "system_uptime_ms", "ready_ms": readyAt*1000, "stable_ms": window.stableDuration*1000, "max_gap_ms": window.maxGap*1000, "observed_max_gap_ms": window.maxObservedGap*1000, "samples_ms": samples])
        FileHandle.standardOutput.write(Data("LABS85_OBSERVATION_JSON \(String(decoding: data, as: UTF8.self))\n".utf8))
    }
}
