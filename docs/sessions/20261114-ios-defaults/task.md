# Native iOS defaults candidate · issue51

State: BLOCKED_ON_HUMAN for native UI observation; candidate36edd2e native Release BUILT, installed and cold-launched / 0 of 5 qualified captures. One actual Record PNG remains pending; combined Android/iOS Recorder lifecycle unverified.

Owner authorized a separate default-only iOS task following Android approval, then official Xcode/Simulator installation. No physical phone, signing/account/security change, deployment/TestFlight, paid provider calls or broader issue51 closure.

Original base: main40d95184a1e7c903b3994818767e59357bbf7392; current reconciled main2dd7d341eb66d7d76b1951ae2c1a6fbfc2f64050. Existing draft PR52/codex/labs51-iphone-candidate atbc3dfe5 remains untouched. This bounded successor reconciles its unsupported-uploader and native adapter concepts with current Android shell/central recording control. No stale branch merge or equivalent new issue.

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
- [x] Xcode27.2/27B52, CocoaPods1.17.0/Ruby4.0.9, actual native Release build and installed-byte/process proof on iOS27.2/24B8117 arm64.
- [ ] Five native UI/default observations, combined Android/iOS lifecycle behavior and Penpot save/reopen. Device Hub component setup/admin prompt requires owner action; no authentication/security workaround.

See examples/ai-recorder/IOS_DEFAULTS.md for source/component decisions and minimal actual-device-free verification.

## Latest-main reconciliation · 2026-11-14 23:42 UTC

Owner reports license acceptance complete; read-only checks confirm Xcode27.2/27B52 and iPhoneSimulator27.2 SDK now work without license error. CocoaPods1.17.0 and its Homebrew Ruby4.0.9 dependency installed successfully. No system Ruby/PATH files changed; shell Ruby remains2.6.10. Local Pod dependency preparation is running separately.

Fresh upstream main9bb86d2f8e56c58375c9247dcf5dc1e72405e2c3 merged into this isolated candidate without conflicts (not a GitHub PR merge). Android AppChrome and RecordControl.android remain byte-identical to main, including folder icon and the unified one-action control. Shared idle Ready duplication and saved copy follow main. iOS native record Button now owns circle+visible label as one action, and Library uses folder SFsymbol. Typecheck,39tests, both Hermes exports/opposite-platform graph checks and Android Release lint PASS; independent read-only review found no definite source findings. Native UI remains unverified.

CoreSimulator's system executable/framework is absent. Xcode outer signature verified valid; Gatekeeper accepts the bundled XcodeSystemResources.pkg as Apple Installer. Necessary approved installation using noninteractive sudo stopped with `sudo: a password is required` before installation. No password requested, no authentication bypass, no Simulator created. Runtime staging also exits70 because IDESimulatorFoundation cannot load the missing CoreSimulator framework. Owner must finish required Xcode system-component setup with administrator authentication on the Mac before native build/Simulator capture can proceed. License acceptance must not be repeated.

## Reconcile merged67 ·2026-11-15

PR67 merged externally at07:18:26Z as2dd7d341eb66d7d76b1951ae2c1a6fbfc2f64050. Existing iOS candidate now reconciles its runtime-owned CaptureSession instead of reverting to screen-owned recorder lifecycle. Notification permission remains Android-only and microphone recovery copy receives the actual platform in the new owner. RootShell/platform controls preserved. This local merge is not GitHub PR merge/acceptance. Tests/build checks and independent review follow; actual combined Android/iOS lifecycle behavior remains a separate unverified requirement, not implied by conflict resolution.

Prior candidate41e87cd did build/install/cold-launch on task iPhone17/iOS27.2 with embedded Hermes6ba14e31..., and a pending real Record PNG was inspected. It is historical source and cannot be labeled latest after67. Device Hub is blocked in component setup; CUA refuses SecurityAgent access, so no native navigation/capture acceptance yet.

Reconciled source verification: typecheck and all64tests PASS; iOS+Android Hermes exports each have0opposite-platform native modules. Independent read-only reviewer verified CaptureSession/tests and Android AppChrome/RecordControl match main2dd7d34; no definite reconciliation findings. Native Android Release lint PASS (291tasks;12executed/279up-to-date). Native combined lifecycle remains explicitly unverified, and no iOS navigation acceptance claim is made.

Current built product source is36edd2e0b6578775af5eab06891ea6ee91ffa970 (local merge of41e87cd and main2dd7d341). Embedded Hermes SHA2567b085bc6 is recorded in the private Hub build receipt; subsequent documentation-only commit does not change product files. Actual native Record PNG was visually inspected, with pending/unverified CUA status and0/5qualified captures. No new Penpot page or owner acceptance claim. The remaining Apple Device Hub component authorization must be handled personally on the Mac; Computer Use explicitly refuses SecurityAgent access. No credential request, protected-dialog interaction or bypass performed.
