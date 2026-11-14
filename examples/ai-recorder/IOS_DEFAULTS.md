# iOS default-view candidate

Related to [issue51](https://github.com/innosage-llc/innosage-labs/issues/51). This bounded successor reconciles the earlier [draft PR52](https://github.com/innosage-llc/innosage-labs/pull/52) with current Android main. PR52 and its branch remain intact. Physical iPhone, provider, signing and distribution acceptance in51 remain open.

Only five requested defaults: **Record idle, empty Library, Settings, default transcription service, ordinary Files import picker**. No recordings, keys or provider requests are needed. This is source support awaiting native qualification; it is not a claim that those screens have run on iOS.

## Source/component decisions

Expo58.0.23 / @expo/ui58.0.27 / RN0.88.1, dependencies unchanged. Retain existing architecture and theme; no Router or SDK migration. Installed universal UI has no tabs/navigation stack, so iOS uses installed SwiftUI TabView/NavigationStack. Universal Button/Picker/Switch cover ordinary controls. Seek needs editing-ended behavior absent from universal Slider, so its iOS adapter uses SwiftUI Slider. Record control uses a native SwiftUI button with circle shape and SF Symbol, matching the existing start/stop state. State remains in RecorderScreen above tab mounts.

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

app.json enables iOS with bundle ID co.innosage.labs.airecorder. Existing expo-audio plugin generates microphone usage text and audio background mode. Existing SecureStore plugin configures keychain use; no biometric prompt is requested for default views. Document picker/FileSystem are already installed; ordinary local Files selection does not require enabling iCloud entitlements. Native projects are generated and ignored. No account/team or provisioning is needed for an unsigned Simulator build.

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

Typecheck, existing Node24 tests, both Hermes exports, both prebuilds and independent source review passed. iOS sourcemap contains no Jetpack Compose/Android control/uploader modules after full transitive source inspection. These checks establish source/configuration preparation only. **Native iOS NOT BUILT; 0/5 captures** until actual compiler/Simulator evidence is recorded. No new Penpot blocker page is needed while installation is pending; accepted Android and historical iOS pages remain intact.

After build: cold-launch exact Release app, verify native Record idle → Library empty → Settings → service initial page → Library Files picker open/cancel. Inspect each real screenshot, verify app foreground/native JS provenance, then publish a new versioned iOS candidate page in the existing exact Penpot target and verify actual save/reopen. Stop for owner review; do not close51 or merge from these defaults alone.
