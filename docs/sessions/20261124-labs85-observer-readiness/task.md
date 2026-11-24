# iOS startup gate observer timing (#85, blocks #127)

Two valid builds reached their first XCTest query after the existing 30-second
deadline. Both failed closed with no merge attempt. Start and arm the same
attach-only XCTest before the product's normal cold launch; require and record
host-bound accessibility timing. Retain the 30-second readiness deadline,
five-second stability observation, continuity, fail-before-merge, and no bypass.

The first native pre-arm run launched the actual app promptly after arming,
and the app reported activation, but XCTest held the prelaunch application
proxy as not running. The new observer arms without constructing the proxy;
the host independently verifies no existing PID, then owns normal launch.
Use a per-run randomized Darwin notification from the same Simulator only
after the normal launch has returned its PID; XCTest registers with Core Foundation before arming,
and waits for the notification before obtaining a UI proxy. No fixed delay estimates a
launch acknowledgement. Missing/stale acknowledgement times out without green.
