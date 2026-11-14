# Native iOS defaults candidate · issue51

State: VERIFYING; native iOS NOT BUILT / 0 of 5 captured.

Owner authorized a separate default-only iOS task following Android approval, then official Xcode/Simulator installation. No physical phone, signing/account/security change, deployment/TestFlight, paid provider calls or broader issue51 closure.

Base: fresh main40d95184a1e7c903b3994818767e59357bbf7392. Existing draft PR52/codex/labs51-iphone-candidate atbc3dfe5 remains untouched. This bounded successor reconciles its unsupported-uploader and native adapter concepts with current Android shell/central recording control. No stale branch merge or equivalent new issue.

- [x] Isolated Hub/Labs worktrees; preserve all existing checkouts/devices/gitlinks.
- [x] UI router and canonical Design source; discovered physical Design dependency gate PASS, Expo skillsa9e5bd3 verified330 files. No discovery repair.
- [x] Installed Expo58.0.23, UI58.0.27 inventory and types plus matching official SDK58 docs.
- [x] Native SwiftUI root TabView/NavigationStack and service DetailShell; state remains in RecorderScreen.
- [x] iOS actions/record control/Picker/Switch/seek with Android controls preserved.
- [x] Remove transitive Compose import from TranscriptSummary; iOS exported sourcemap contains0 Android-only modules.
- [x] Guard Android-only audio notification API; iOS microphone recovery text.
- [x] Disable unsupported iOS Pro key validation/upload before reservation; keep saved results readable and staging switch-off available.
- [x] typecheck; Node24 provider/navigation tests; iOS/Android Hermes exports; iOS/Android prebuild.
- [x] Android native Release lint PASS (JDK17, offline, no device);291 tasks. Existing tests23+16 PASS. Final iOS/Android sourcemaps contain0 foreign-platform native modules.
- [x] Independent read-only source review; fixed notification and misleading Pro action findings.
- [ ] Actual Simulator native build/default capture. Official Xcode27.2 download in progress; local CocoaPods absent. Generated project/export do not establish native functionality.

See examples/ai-recorder/IOS_DEFAULTS.md for source/component decisions and minimal actual-device-free verification.
