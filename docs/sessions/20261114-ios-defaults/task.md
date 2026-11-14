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

## Latest-main reconciliation · 2026-11-14 23:42 UTC

Owner reports license acceptance complete; read-only checks confirm Xcode27.2/27B52 and iPhoneSimulator27.2 SDK now work without license error. CocoaPods1.17.0 and its Homebrew Ruby4.0.9 dependency installed successfully. No system Ruby/PATH files changed; shell Ruby remains2.6.10. Local Pod dependency preparation is running separately.

Fresh upstream main9bb86d2f8e56c58375c9247dcf5dc1e72405e2c3 merged into this isolated candidate without conflicts (not a GitHub PR merge). Android AppChrome and RecordControl.android remain byte-identical to main, including folder icon and the unified one-action control. Shared idle Ready duplication and saved copy follow main. iOS native record Button now owns circle+visible label as one action, and Library uses folder SFsymbol. Typecheck,39tests, both Hermes exports/opposite-platform graph checks and Android Release lint PASS; independent read-only review found no definite source findings. Native UI remains unverified.

CoreSimulator's system executable/framework is absent. Xcode outer signature verified valid; Gatekeeper accepts the bundled XcodeSystemResources.pkg as Apple Installer. Necessary approved installation using noninteractive sudo stopped with `sudo: a password is required` before installation. No password requested, no authentication bypass, no Simulator created. Runtime staging also exits70 because IDESimulatorFoundation cannot load the missing CoreSimulator framework. Owner must finish required Xcode system-component setup with administrator authentication on the Mac before native build/Simulator capture can proceed. License acceptance must not be repeated.
