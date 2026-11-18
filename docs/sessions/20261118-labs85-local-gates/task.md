# #85 implementation checkpoint

Original accountable lead, sole implementation/test owner. Baseline main: 282a2081b303ac63af19de836ab5f9246c06e902, after the separately authorized #52/#83 integrations. This task does not modify #91/#84 worktrees/refs or #63.

Implemented modular local candidate/CI/startup/merge commands for #86–#90, genuine shared Web launch/navigation with native-only capability boundaries, controlled runtime faults, loopback-only pinned preview and offline merge-command spies. See scripts/recorder-gate/README.md for commands and exact limits.

Targeted verification before local commit: gate/controller/aggregate/integration fixtures pass; product TypeScript and 74 JS tests pass; existing 38 iOS helper fixtures pass; Web production export passes. Installed CocoaPods xcodeproj 1.28.1 successfully generated the XCTest target/dependency/shared scheme in a synthetic Xcode project. XCTest Swift source typechecks against the installed iOS Simulator SDK/Swift overlay. Initial direct Swift invocation omitted the XCTest Swift overlay search path and failed; the corrected SDK-bound typecheck passed. No Simulator or application launch is inferred from these checks.

Native runtime evidence remains NOT RUN: this native execution context denies ADB listener/Simulator service/loopback access. No alternate executor, permission bypass, paid provider, device capture, external preview, Actions/cloud CI, push, PR mutation or merge. Exact source/artifact/runtime receipts, real green/red starts and screenshots must still be obtained under supported native authorization. Independent exact-head Sol HIGH review must resolve a fresh same-host catalog and inspect the final candidate before gate/merge eligibility. Do not merge or close #85 from fixture/export evidence.

Hub continuity source: docs/sessions/20261118-labs85-v5-local-gates in the task-owned Hub workspace. No private source, Brain, skill instructions, host identifiers or credentials are copied here.

Exact-source offline CI subsequently passed on the first local integration candidate (6 command stages). An evidence repair now preserves stdout AND stderr, exit status and monotonic command duration in applicable-ci.json even on a failing stage; this includes Python unittest's stderr summary. Web treats only an optional favicon.ico/other 404 as noncritical; failed entry/scripts/styles/images/fonts still fail. These repairs require refreshed exact-source evidence; no live/review result is carried forward.

Final offline repair fixtures: 42 gate/controller/aggregate/integration/platform fixtures PASS, including actual driver failures for missing native targets/unavailable Web tool. Independent review catalog initialization is BLOCKED by native Codex SQLite state access; no review inference turn was sent and no stale/fallback route is used. Native runtime denials remain binding. The branch stays local and unmerged.
