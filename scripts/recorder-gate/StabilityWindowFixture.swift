import Foundation

// Offline tests exercise the exact struct compiled into the XCTest target.
@main struct StabilityWindowFixture {
    static func main() throws {
        let mode = CommandLine.arguments[1]
        var w = StabilityWindow(launchedAt: 0)
        _ = try w.record(started: 0, completed: 0, foreground: true, ready: true)
        if mode == "healthy" {
            for i in 1...50 {
                let at = Double(i) / 10
                let complete = try w.record(started: at, completed: at, foreground: true, ready: true)
                precondition(complete == (i == 50))
            }
            precondition(w.stableDuration == 5)
            print("PASS healthy 5 seconds completed by 51 successful samples")
            return
        }
        _ = try w.record(started: 0.1, completed: 0.1, foreground: true, ready: true)
        do {
            switch mode {
            case "runner-pause": _ = try w.record(started: 6.1, completed: 6.1, foreground: true, ready: true)
            case "query-stall": _ = try w.record(started: 0.2, completed: 6.2, foreground: true, ready: true)
            case "disappeared": _ = try w.record(started: 0.2, completed: 0.2, foreground: true, ready: false)
            case "background": _ = try w.record(started: 0.2, completed: 0.2, foreground: false, ready: true)
            case "clock": _ = try w.record(started: 0.05, completed: 0.2, foreground: true, ready: true)
            default: fatalError("unknown fixture")
            }
            fatalError("interrupted observation was accepted")
        } catch { print("REJECT \(mode) \(error)") }
    }
}
