import Foundation

// Successful accessibility query completion times, never sleep/runner elapsed
// time alone, establish the five-second window. Shared with offline Swift tests.
struct StabilityWindow {
    enum Invalid: Error { case clock, queryDeadline, coverageGap, readiness, foreground, disappeared }
    let launchedAt: TimeInterval
    let readyTimeout: TimeInterval
    let duration: TimeInterval
    let maxGap: TimeInterval
    private(set) var readyAt: TimeInterval?
    private(set) var completedAt: [TimeInterval] = []
    private(set) var maxObservedGap: TimeInterval = 0
    var stableDuration: TimeInterval { (completedAt.last ?? readyAt ?? 0) - (readyAt ?? completedAt.last ?? 0) }

    init(launchedAt: TimeInterval, readyTimeout: TimeInterval = 30, duration: TimeInterval = 5, maxGap: TimeInterval = 1.5) {
        self.launchedAt = launchedAt; self.readyTimeout = readyTimeout
        self.duration = duration; self.maxGap = maxGap
    }

    mutating func record(started: TimeInterval, completed: TimeInterval, foreground: Bool, ready: Bool) throws -> Bool {
        guard started.isFinite, completed.isFinite, started >= launchedAt,
              completed >= started, started >= (completedAt.last ?? launchedAt) else { throw Invalid.clock }
        guard completed - started <= maxGap else { throw Invalid.queryDeadline }
        guard foreground else { throw Invalid.foreground }
        if let previous = completedAt.last, readyAt != nil {
            let gap = completed - previous
            guard gap <= maxGap else { throw Invalid.coverageGap }
            maxObservedGap = max(maxObservedGap, gap)
        }
        if readyAt == nil {
            guard completed - launchedAt <= readyTimeout else { throw Invalid.readiness }
            if ready { readyAt = completed }
        } else if !ready { throw Invalid.disappeared }
        completedAt.append(completed)
        return readyAt != nil && stableDuration >= duration
    }
}
