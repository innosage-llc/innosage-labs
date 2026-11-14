# Task

- [x] Read UI entry; dependency check PASS at official revision a9e5bd3fa00b4e61f632e43f85da73aee1942582; overview then native-ui/ui.
- [x] Verify remote main c1cafcce07ef156418ba89528807188271923bef; create isolated task branch.
- [x] Investigate theme provenance and choose installed native control; see design.md.
- [x] Implement bounded launch simplification. Typecheck and existing 36 tests PASS; native/runtime gates in progress. Scoped issue #60 created after duplicate check.
- [x] Run final-source local source/build/runtime checks and independent code/visual review; see evidence README and review.md.
- [ ] Push final evidence and publish review-ready PR linked to #60.
- [ ] Stop for new owner UI and merge approval.

First Release runtime found installed Shape.Circle native defaults render a near-zero radius despite declaration documentation. Supply explicit radius1 and32 vertices; rerun final-source build/checks/review and replace candidate captures. Permission dialog and denied-flow exercise are genuine runtime, not mocks.

Independent visual review: first action and completion were clear. Correct saved-state retrieval grouping/emphasis by centering the existing native View in Library action with tonal styling. A transient navigation screenshot must be recaptured after settling. Permission recovery remains the authorized original Start recording/system prompt contract; no invented Settings/retry-save action. Small-screen scrolling intentionally clips offscreen content; stop/nav remain reachable and both scroll endpoints are documented, not a sticky-timer requirement. Final evidence and checks must bind the corrected source.

Final runtime implementation5068e16;36 tests/typecheck/offline Release/full lint PASS. Installed APK and embedded JS verified equal. Actual Release PNG manifest includes default/recording/saved/Library/manual playback/large text/small screen/permission/TalkBack focus. Source/render checks and NOT_RUN native fault cases are explicitly separated. Final fresh visual review retains bounded product suggestions for owner judgment; code review has no actionable findings. No remote workflows, provider calls, merge or deploy.
