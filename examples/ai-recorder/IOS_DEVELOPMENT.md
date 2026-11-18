# Physical iPhone development

Related to [issue #51](https://github.com/innosage-llc/innosage-labs/issues/51).
This is a local developer build, not an App Store, TestFlight or production release.
JavaScript bundle/prebuild success is not evidence of a signed native build or a successful device test.

## Prerequisites and boundaries

- macOS compatible with the Xcode version required by this Expo/React Native release and the phone's iOS version. Check [Apple's Xcode support matrix](https://developer.apple.com/support/xcode/) and [Expo local app development](https://docs.expo.dev/guides/local-app-development/).
- Full [Xcode from Apple](https://developer.apple.com/xcode/resources/), not Command Line Tools alone. The owner must install it and personally complete any required Apple license/account steps and first-launch components. This workflow does not accept licenses, buy memberships, change security settings or create signing credentials automatically.
- Node 24 (the existing provider-test command uses its experimental TypeScript transform flag), npm and CocoaPods from the official local Expo setup. Run `npm ci` in this directory when dependencies are not installed.
- An unlocked physical iPhone and a data-capable USB cable. A later wireless workflow requires prior pairing and is not assumed here.
- The developer's authorized Apple account/team and development signing. A free Personal Team can have provisioning/device limits and short-lived profiles; a paid team is not purchased or assumed. Do not commit a team ID, provisioning profile, certificate, device identifier or account details.
- Use synthetic speech and a synthetic M4A fixture. Never upload private recordings just to pass a test. Do not look for keys in another project, shell history, logs or Keychain.

## Repeatable USB install and launch

Use this path from an iOS-capable development checkout of AI Recorder. The helper
targets the existing `co.innosage.labs.airecorder` identifier and exactly one
physical iPhone connected by USB. It does not use a simulator, Metro, TestFlight,
or a staging service.

1. Run `npm ci` from this directory (Node 24 is recommended). Run `npm run ios:check`
   for the read-only checklist, or `npm run ios:check -- --host-only` when the phone
   is elsewhere. `npm run ios:device -- doctor` is the same full checklist.
2. For a first run, unlock the test phone and connect it with a data cable. If asked,
   approve Trust This Computer and enable **Settings → Privacy & Security →
   Developer Mode** on the iPhone, restart, confirm, then unlock again. In Xcode,
   sign in to the intended Apple developer account and select the intended team for
   the AIRecorder target. If the workspace has not been generated yet, the runner can
   prepare it, then stop so you can select the team in **Signing & Capabilities**.
   Review any required device registration (the device name and ID go to Apple)
   and handle protected macOS Keychain prompts yourself. Enabling Xcode's External
   Agent Access is not required.
3. Run `npm run ios:device -- run`. It generates a missing iOS project without
   cleaning an existing one, prepares missing CocoaPods, and uses existing local
   development signing to build a Release configuration with JavaScript embedded.
   It checks that the signed profile covers the phone, installs in place without
   uninstalling, reads back the installed version, launches the app, and checks
   that the launched PID still executes the installed bundle. A normal `run` installs the built app even
   if that version is already present.
4. After an interruption, retry the same command. Xcode reuses its incremental
   cache. On build cancellation, the runner signals only its own process group,
   and reports unconfirmed cleanup if the host refuses it. Check the original
   session before retrying in that case. The runner reinstalls in place before
   verifying the launch. An app
   already on the phone with the same version/build is not necessarily the same
   artifact. `npm run ios:device -- run --build-only` does not touch the phone;
   `npm run ios:device -- verify` checks the existing install/process without
   installing or launching anything.

The runner does not sign in, choose a team, change Developer Mode or Keychain
settings, register devices, create credentials, accept terms, or upload anything.
Ordinary dependency downloads may need access to official package endpoints. A
CoreDevice permissions or timeout result is not evidence that the iPhone is
disconnected; first retry from an authorized Mac session. Raw build logs in the
ignored `ios/.ai-recorder-device/` directory are private and may include signing
or local machine details. Do not share them without review.

A running process only verifies install and startup, not recording, playback,
import, live provider behavior, or release readiness. Run `npm run test:ios-device`
to test the helper using offline fixtures; it does not use a device.

## Generate and open the native project

Run from `examples/ai-recorder`:

1. `npm run ios:check -- --host-only`
2. `npm run typecheck`
3. `npm run test:platform`
4. `npm run test:transcript`
5. `npm run ios:prebuild`
6. `cd ios && pod install && cd ..`
7. `open ios/AIRecorder.xcworkspace`

For a nondefault Xcode, prefix commands with `DEVELOPER_DIR=/path/to/Xcode.app/Contents/Developer`. This avoids switching the global `xcode-select` setting. Native `ios/` and `android/` projects are generated and ignored; do not run `prebuild --clean` against a manually edited native project.

In Xcode, select the **AIRecorder** target, **Signing & Capabilities**, enable automatic signing if authorized, and select the intended team. The configured bundle identifier is `co.innosage.labs.airecorder`. If the team cannot provision it, choose a team-owned development identifier in `app.json`, regenerate, and record that difference in private test evidence. Do not copy another team's signing material or automatically register a device or create/revoke signing credentials without authorization.

Connect/unlock the phone. The owner must approve **Trust This Computer**, any device pairing/security prompts, and **Settings → Privacy & Security → Developer Mode** if required, including restart and confirmation. Follow [Apple's device-development instructions](https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device). Resolve incompatible iOS/device-support versions by installing the appropriate official Xcode, not by bypassing warnings.

Select the phone as destination and Run using the Debug scheme. Xcode reports the specific provisioning/trust issue if setup is incomplete. If a developer-trust prompt appears on the phone, the owner handles it. No device erase, reset, keychain cleanup or existing-app deletion is part of this workflow.

## Build, launch and debug

After the initial signing/trust setup, `npm run ios` runs `expo run:ios --device` and prompts for a device. Use Xcode Run for native breakpoints, the Debug navigator and console. Expo CLI starts Metro for the development build; use its debugger command when available to open React Native DevTools for JS breakpoints/logs. To restart Metro separately, use `npx expo start` and reopen the app installed by the local `expo run:ios` build, not Expo Go. If the app cannot reach Metro over the local network, let the owner approve the specific required local-network prompt; do not disable firewalls or change VPN/security settings.

Do not publish full Xcode/Metro/device-console logs without reviewing them for keys, transcripts, local paths, device IDs and provisioning details. Debug builds are development artifacts, not production secrets storage guarantees. No custom native uploader is loaded on iOS.

## Supported provider paths

- **OpenAI direct:** candidate iOS path via `expo/fetch` multipart upload, the saved OpenAI project key and the existing transcription/summary clients. M4A must be nonempty and below 25 MB. The model-access check is not a quota/billing or end-to-end verification. Transcription and summary requests may incur API charges and transmit the selected recording/transcript to OpenAI. Use only an explicitly authorized project key and synthetic content; enter the key directly into the app's secure key field. Never place it in chat, docs, environment bundles or evidence. The app saves it in SecureStore. Remove the test key afterward if appropriate.
- **Staging Free gateway:** candidate shared HTTP path, with an already authorized HTTPS gateway/token and its existing limits. It still needs a live iPhone test. Do not create a gateway, broaden access or send content without authorization.
- **InnoSage Pro:** Android-only bounded-memory native uploader. iOS does not import `RecorderUpload`; upload submission is disabled before reservation and key saving is disabled for Pro in the iOS settings. A separate iOS upload implementation and its security/memory/cancellation verification are required. Previously persisted results can still be viewed; a pending Pro upload cannot be resumed on iOS.
- Speaker identification remains a Free/Pro service capability, not an OpenAI-direct feature. Availability depends on the configured gateway/provider. Summary model discovery, recipes and citations use the existing OpenAI client and remain unverified on a physical iPhone.

## Physical-device acceptance checklist

Record only model, iOS version and exact candidate commit. Do not include serial number, UDID, account identifiers, credentials or private speech.

1. Build/sign/install the exact candidate. Launch from Xcode, attach the native debugger, set a JS breakpoint and observe it hit. Record each outcome separately.
2. Grant microphone access on the phone. Record 5–10 seconds of synthetic speech, stop, confirm the saved row, play/pause it and use Back/Forward 10 seconds. Check VoiceOver labels/actions where practical.
3. Choose Import audio, select a synthetic `.m4a` from Files, and play it. Cancel the picker once; verify controls remain usable. Empty/wrong-extension inputs should fail safely.
4. Terminate and relaunch **without uninstalling**. Confirm both recording and imported file remain listed and playable. Include background/foreground behavior as an additional observation, not a substitute for relaunch.
5. Open Transcript and Transcription service settings. Confirm native iOS switches, radio choices and secure text entry work. Confirm Pro upload is unavailable without a missing-module crash or reservation.
6. With an explicitly authorized OpenAI key/content/budget, verify and save the key, transcribe the short synthetic clip, open summary, choose an available supported model and generate Meeting Essentials. Check transcript/summary persistence after relaunch. Record provider/model/result without key or transcript content. If key, quota, budget or model access is unavailable, mark live-provider testing blocked rather than passed.
7. Run the Android regression commands below and report native/device coverage separately.

## Regression commands

- `npm run typecheck`
- `npm run test:transcript` using Node 24
- `npm run test:platform`
- `CI=1 EXPO_OFFLINE=1 npx expo export --platform ios --output-dir dist-ios`
- `CI=1 EXPO_OFFLINE=1 npx expo export --platform android --output-dir dist-android`
- Optional cached Android native build: generate Android with `npx expo prebuild --platform android --no-install`, then run `cd android && ./gradlew --offline --no-daemon --max-workers=2 :app:assembleDebug`. This is not an Android device smoke test. Use an isolated checkout and do not install over a device being used by another worker.

## Observed evidence for this change

See `docs/sessions/20261111-labs51-iphone/task.md` at the Labs repository root. Physical-device acceptance remains open until its exact-revision observations are recorded. Do not close issue #51 from bundle-only evidence.
