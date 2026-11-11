# AI Recorder physical-iPhone development (#51)

State: implementation reviewed; revised delivery target is owner-only TestFlight, with account/signing prerequisites unverified. Issue remains open.
Base: Labs `20208b8ca69d581dcfafae0260330172a2153acf`.
Scope: reproducible iOS developer configuration/build instructions and native platform boundaries; no production release.

## Changes

- Added iOS bundle configuration, explicit microphone purpose, local prebuild/run and read-only Xcode preflight commands.
- Preserved Android Compose settings, switches, slider and bounded-memory uploader in platform modules. iOS uses native React Native controls, ten-second seek buttons with adjustable accessibility actions, and no Compose/native-uploader imports.
- Disabled iOS Pro upload before any submission/reservation; unsupported uploader also fails explicitly. OpenAI direct and authorized staging Free gateway remain candidate paths, not device-proven paths.
- Added developer guide covering Xcode/team/provisioning, owner-only trust/Developer Mode, commands, debugging, provider limits, privacy and device checklist.

## Verification on Mac Studio (2026-11-11)

- PASS: `npm run typecheck`.
- PASS: `npm run test:transcript` with installed Node 24: 18 tests. The default Node 26 rejects the inherited `--experimental-transform-types` flag; plain Node 26 strip-only mode also cannot execute the existing parameter-property syntax. No unrelated test script change was made.
- PASS: `npm run test:platform`: 7 tests covering iOS graph isolation, Android module selection, explicit unsupported uploader, pre-reservation guard, safe config, store-distribution profile and opaque distribution icon.
- PASS: `CI=1 EXPO_OFFLINE=1 npx expo prebuild --platform ios --no-install`.
- PASS: generated iOS Info.plist microphone purpose and `audio` background mode inspected; no broad file sharing or arbitrary network-load exception added.
- PASS: iOS Hermes JavaScript export, 682 modules.
- PASS: Android prebuild and Hermes JavaScript export, 827 modules.
- PASS: independent read-only review of code, settings key state, seek callbacks, docs and preflight; reviewer also ran typecheck/platform tests/shell syntax/whitespace checks.
- EXPECTED BLOCK: `npm run ios:check` exits 2 because full Xcode is absent. Active developer directory is CommandLineTools. No Xcode bundle found in Applications or Spotlight.
- OBSERVED: zero valid code-signing identities; no iPhone in the USB device inventory. No identifiers or credentials were recorded.
- PASS: Android `:app:assembleDebug --offline --no-daemon --max-workers=2`, existing Java 17 and Android SDK; build successful in 58 seconds, 228 actionable tasks (200 executed, 28 up-to-date). Initial restricted attempt could not bind Gradle IPC; authorized local escalation used the existing SDK without installs or network access. No APK was installed on a device.

## Not verified; requires real owner/device setup

No native iOS compilation, signing, device installation/launch, local debugger attach, microphone recording/playback/import/relaunch persistence, secure keyboard, VoiceOver, or live transcription/summary request was performed. iPhone model and iOS version are not observed. No provider key was accessed or transmitted and no API quota was spent. Do not treat JS bundle success as device acceptance.

Full Xcode setup and a connected/unlocked physical phone are indispensable. Apple account/license/security prompts, team authorization and any creation of signing credentials require the appropriate owner actions/permission. Follow `examples/ai-recorder/IOS_DEVELOPMENT.md`; report the exact candidate commit and device model/iOS only when device testing actually occurs.

No production deployment, merge, issue closure, device reset/uninstall, shared-worktree modification or session archival is part of this delivery.

## Revised no-USB TestFlight preparation

The owner requested TestFlight installation on their iPhone instead of attaching it to this Mac. Added a separate `testflight` EAS store-distribution Release build/submit profile, source-upload ignore rules, an original opaque 1024px iOS waveform icon and `TESTFLIGHT.md`. The generated iOS icon was verified as non-alpha; the template fallback had an alpha channel. No background auto-submit, production release or public tester link was configured.

Cloud EAS build can avoid local Xcode. No saved Expo auth/upload credentials are available in this task; the intended Apple team's paid membership, App Store Connect app/access and tester identity are unknown until authenticated verification. No Expo/Apple login, external project creation, new signing/upload credential, legal acceptance, build charge or app upload occurred. The local-debugging requirement from the original issue remains separately unverified: TestFlight Release installation does not prove native/Metro debugger attachment.
