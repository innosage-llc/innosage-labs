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
The randomized Darwin notification was posted successfully in the selected
Simulator but did not reach the attached XCTest there. For the next exact
candidate, use an exclusively created per-run file inside only that XCTest
runner sandbox. Verify the Simulator UUID and runner app data container before
writing the marker, and write it only after the normal launch returns its PID.
Missing/stale acknowledgement times out without green.
