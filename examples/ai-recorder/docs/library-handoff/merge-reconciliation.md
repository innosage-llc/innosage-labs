# Mainline reconciliation — 2026-11-14

Owner authorized squash merges of57,59 and Hub462, proceeding with known device/audio limits. PR57 merged as6cf9c604415ca4466adba80b936379b4292f09cf from independently reviewed936925ef5ea83137580c22b5c2491f7ab9a7fc09.

Only PR59 commits after original divergencea139eab were rebased onto that mainline. Conflicts were limited to the shared session task document and adjacent test-script additions; both contexts/test lists were retained. No application implementation conflict was resolved by choosing sides.

Recording/Library App.tsx, ActionButton, handoff reducer/tests, navigation/state ownership, theme/AppChrome and dependency lockfile remain byte-identical to original reviewed723ffbb. All other original tracked app-source files also remain unchanged except the explicitly carried predecessor recovery fix: Transcript.tsx plus new operationRecovery.ts/test, and test:transcript adds the five recovery regressions. These recovery files exactly match merged57. No unrelated57 diff is reintroduced relative to resulting main; full comparison remains available in PR59.

The original30 screenshots and additive12 TalkBack screenshots are unchanged and retain their exact original source/APK identities. They are not relabeled as captures of the recovery-fixed build. The recovery fixes are covered by local mocked/actual-handler tests, builds/lint and independent review; no live provider or device recovery validation is asserted. Final-head gate receipts and source/main mappings are recorded in the merge handoff.

Known spoken announcement, audible/physical quality, real-provider outage, process-death/disk-full/telephony and large-collection limits remain. Parent56 and implementation58 remain open for acceptance; no deployment or unspecified next work.
