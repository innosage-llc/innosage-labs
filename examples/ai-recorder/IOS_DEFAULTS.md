# iOS default-view candidate

Related to [issue51](https://github.com/innosage-llc/innosage-labs/issues/51). This bounded successor reconciles the earlier [draft PR52](https://github.com/innosage-llc/innosage-labs/pull/52) with main2dd7d341, including merged PR67. PR52 and its branch remain intact. Physical iPhone, provider, signing and distribution acceptance in51 remain open.

Only five requested defaults: **Record idle, empty Library, Settings, default transcription service, ordinary Files import picker**. All five have now run in the actual native Release Simulator app; no recordings, keys or provider requests were used for these captures. This is an unmerged candidate, not support already available on main.

## Source/component decisions

Expo58.0.23 / @expo/ui58.0.27 / RN0.88.1, dependencies unchanged. Retain existing architecture and theme; no Router or SDK migration. Installed universal UI has no tabs/navigation stack, so iOS uses installed SwiftUI TabView/NavigationStack. Universal Button/Picker/Switch cover ordinary controls. Seek needs editing-ended behavior absent from universal Slider, so its iOS adapter uses SwiftUI Slider. Record control uses one native SwiftUI button owning the circle, SF Symbol and visible label, matching the latest main start/stop action contract. RecorderScreen subscribes to PR67's runtime-owned CaptureSession across screen recreation.

| Surface | iOS source/export | State owner / native check |
|---|---|---|
| Root tabs/title | ui/RootShell.ios.tsx · TabView, NavigationStack, RNHostView | RecorderScreen destination; exercise all three roots, verify safe areas |
| Service modal/title/Back | ui/DetailShell.ios.tsx · NavigationStack, Toolbar, native Button | ProSettings; open/close without changing service |
| Actions | ui/ActionButton.ios.tsx · universal Button | Existing callbacks; disabled/accessibility/size |
| Record idle action | ui/RecordControl.ios.tsx · SwiftUI Button/Image | Existing CapturePhase; inspect idle without mic grant |
| Service selection | ServiceChoice.ios.tsx · universal Picker | ProSettings/SecureStore; initial staging label |
| Switch/seek | RecorderSwitch.ios.tsx / PlaybackSeek.ios.tsx | Existing Transcript/player; compiled transitively, no populated capture claim |
| Files | existing expo-document-picker getDocumentAsync | Library opens ordinary native picker; cancel without import |

Android Compose implementations remain in their existing platform path; shared callers resolve iOS siblings through Metro. TranscriptSummary's transitive switch also uses the adapter to keep Compose out of the iOS module graph. Android's audio notification request is gated to Android; installed expo-audio throws for that call on iOS.

Pro's bounded-memory RecorderUpload module is Android-only. iOS never loads it; settings disables Pro key verification, and Transcript disables upload/new reservation for Pro with an explanation. Staging Free/OpenAI routes are existing candidate paths, untested here. No provider support parity is claimed.

## Configuration and local preparation

app.json enables iOS with bundle ID co.innosage.labs.airecorder. Existing expo-audio plugin generates microphone usage text and audio background mode. Existing SecureStore plugin configures keychain use; no biometric prompt is requested for default views. Document picker/FileSystem are already installed; ordinary local Files selection does not require enabling iCloud entitlements. Native projects are generated and ignored. Use normal local ad-hoc Simulator signing (CODE_SIGN_IDENTITY=-); no account/team or provisioning is needed. Disabling signing caused actual SecureStore -34018 in this runtime; the normal signed Simulator build passed default service navigation.

Use an already installed compatible official full Xcode and iOS Simulator runtime. `DEVELOPER_DIR=/path/to/Xcode.app/Contents/Developer` is per-process; do not change global xcode-select just for this task. Honor required license/authentication/privilege handoffs. `npm run ios:check` is read-only and checks Xcode, SDK, simctl, available runtimes and CocoaPods; it does not install them.

```sh
npm ci --offline
npm run typecheck
# Existing tests need Node24 (Node26 removed --experimental-transform-types):
npm test
npm run ios:check
npm run ios:prebuild
# Only once CocoaPods/Xcode prerequisites actually exist:
cd ios
pod install
cd ..
# Use an explicit new task-owned Simulator UUID, Release configuration,
# no EAS/TestFlight/device signing, and preserve source/build/JS receipts.
```

Hub skill invocation is separated by platform:

```text
$inspect-latest-app-ui ai-recorder --platform android --source origin/main
$inspect-latest-app-ui ai-recorder --platform ios --source origin/main
$inspect-latest-app-ui ai-recorder --platform web --source origin/main
```

Android uses native APK/ADB evidence. iOS preflights actual main support/tooling, then requires a real Release Simulator app/embedded JS and task-owned device before native review. Web returns UNSUPPORTED: this change does not add a web target. An unmerged candidate is labeled with its exact commit, never latest main.

## Current verification limits

Typecheck,64 tests, both Hermes exports (zero foreign-platform native modules), Android Release lint and independent source review passed. Actual native Release build source36edd2e0b6578775af5eab06891ea6ee91ffa970 includes main2dd7d341. Xcode27.2/27B52, SDK27.2, runtime27.2/24B8117 arm64, CocoaPods1.17.0. Strict codesign verification and installed app byte/process checks passed. Embedded Hermes SHA256 is6dfd3e792ec535a6af2d36a4de59948d8ff9d3cc886f13d9b1ab92c5c3f828a6. Loaded-JS provenance is inferred from reviewed Release loader and installed embedded bytes, not an in-memory JS hash.

**Five of five actual native defaults captured and independently reviewed**, including SecureStore-backed initial service page and ordinary Files Recents picker. Versioned iOS candidate Penpot page4348fb1d-aa6d-8099-8008-f2f2f6781a99 was saved, actually reloaded/reopened through native Chrome, and freshly read back through MCP. Android/historical iOS pages and pointers were preserved. Private Hub PR465 carries exact PNGs, observations and receipts; no owner acceptance or main support claim.

Combined PR63+67 Recorder lifecycle remains UNVERIFIED. Three task-owned Android emulator launches initially exited139; crash stacks identified netsim packet-channel initialization blocking startup. A fourth evidence-driven launch disabled only task-process packet-stream features and booted successfully; exact APK installed and cold-launched, with installed hash matching the build. Microphone/notification permissions remain false; no grants or Start input were sent under the continuation's no-new-permissions boundary. iOS bounded Start reached the native app microphone permission dialog, left pending without granting access; no recording success or lifecycle compatibility is claimed. These are separate gates from five-default coverage. Continue both platform runtime checks before accepting compatibility/merging; no physical device, provider or process-death acceptance is implied.

Owner review: inspect Record idle → Library empty → Settings → service initial page → Library Files picker open/cancel on the exact candidate. Review the saved five-default gallery and outstanding combined runtime checks. Do not close51 or merge from these defaults alone.
