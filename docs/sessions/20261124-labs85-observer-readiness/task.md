# iOS startup gate observer timing (#85, blocks #127)

Two valid builds reached their first XCTest query after the existing 30-second
deadline. Both failed closed with no merge attempt. Start and arm the same
attach-only XCTest before the product's normal cold launch; require and record
host-bound accessibility timing. Retain the 30-second readiness deadline,
five-second stability observation, continuity, fail-before-merge, and no bypass.
