# Android core acceptance #68

Physical acceptance is pending for [issue #68](https://github.com/innosage-llc/innosage-labs/issues/68). The historical APK below came from `2dd7d341eb66d7d76b1951ae2c1a6fbfc2f64050` (#67). The packet was reconciled against `7db439f6982ccbeccab188722d6e762aed4afa4a`. Before physical acceptance, select the intended source revision and record the SHA-256 and signing identity of its exact APK.

Use a dedicated spare phone or test profile with verified ownership. Check the exact wired ADB serial and pin all device-specific commands to it. Before installing anything, verify the APK hash, confirm the package is absent on the selected target, and ensure the test can proceed with existing permissions. If the package already exists, leave it intact. Proceed with an installed build only if its provenance and prior permission grant are independently verified. If setup requires a new microphone permission, leave capture unrun. Require a controlled synthetic speech source, a listener who can evaluate the actual Library playback, and an authorized offline setup. Keep existing recordings, device settings and network settings intact.

## Five-minute script

Prepare the synthetic audio before clock start. Use only the scripted non-sensitive markers and include periodic counts between markers to reveal gaps. Keep the test isolated from ambient and personal speech.

| Time | Action / speech |
| --- | --- |
| 0:00 | Visible Record: Start once. Once recording, say “Acceptance 68 A before lock, one two three four five.” |
| 0:20 | Lock; say “Acceptance 68 B locked, one two three four five.” |
| 0:45 | Unlock, foreground Calculator; say “Acceptance 68 C another app, one two three four five.” |
| 1:10 | Return; say “Acceptance 68 D returned, one two three four five.” |
| 1:25 | Say “Acceptance 68 E ending.” Tap Stop & save once. |
| 1:35 | View in Library; note exact file ID/name, timestamp and duration. Navigation must not autoplay. Explicitly Play. |
| 1:40–3:05 | Listen fully: A–E ordered and intelligible, no unexpected silence, duplication or truncation. |
| 3:05–4:40 | After playback, leave/reopen normally; use already offline setup. Select same entry, explicitly Play and listen through E. Allow extra seconds for navigation. |

No force-stop, process kill, rotation or configuration reproduction. Stop at first actual failure; preserve evidence without retries.

## Evidence and verdict

Record UTC time, tester and listener, model/OS/API, source revision and APK SHA-256, app version/code, permission readiness, offline setup, transition times, exact saved file identity, elapsed capture versus saved duration (explain a discrepancy over five seconds), marker order and audible defect timestamps. Keep raw synthetic audio local. Do not enumerate/export existing personal recordings. Optional file hash/container metadata supplements listening only.

Mark PASS only when the expected result is observed. Mark FAILED if an attempt contradicts it, BLOCKED if a prerequisite is missing, or NOT_RUN if the step was unattempted. Audible physical success requires listening to the actual recording through Library playback.

| Check | Current status | Owner evidence required |
| --- | --- | --- |
| Dedicated wired phone | BLOCKED | Verify the exact wired serial, model/OS and exclusive ownership |
| Safe speech/listener | BLOCKED | Controlled synthetic audio and a listener who can verify Library playback |
| Physical Start/lock/other app/return | NOT_RUN | Transition observations + audible A–E |
| Save/file continuity | NOT_RUN | Exact ID, duration and full listening |
| Library handoff/explicit playback | NOT_RUN | Same entry and explicit playback |
| Normal relaunch persistence | NOT_RUN | Same ID and duration after reopen |
| Offline full replay | NOT_RUN | Authorized offline setup and full listening through E |
| Owner final acceptance | PENDING | Review complete ledger and decide |

## Scope and acceptance

The [local Recorder gate](../../../scripts/recorder-gate/README.md) applies to this packet on current main. Its Android, iOS and Web checks exercise startup and navigation. Physical acceptance requires the separate recorded script above and a completed device evidence ledger. Review the ledger before accepting issue #68.

#67/#66 covers same-JavaScript-runtime configuration recreation. #68 leaves process death, native-context destruction, old-cache recovery and the exhausted #65 investigation outside its test scope. Broader #56/#58/#60 and iOS #63 remain separate.

## Historical artifact receipt

Build observed on 2026-11-15 at `2dd7d341eb66d7d76b1951ae2c1a6fbfc2f64050` with Node 24.22.2, OpenJDK 17 and Gradle 9.4.1. APK and raw logs are retained locally. The package was built and its signature was verified. Device installation and playback were never attempted with this receipt.

- APK SHA-256: `d3700973f2b865709bfdc7c7b6b461d7a09ba33c1b33bfa8d75774e11c9235ad`
- Size: 26,106,463 bytes; package co.innosage.labs.airecorder; version 0.1.9/code 10; arm64-v8a; min API 24, target 36, compile 37.
- Bundled assets/index.android.bundle SHA-256: `d3c19759789408fc85be2766debbe2a0241bf93ed668a7711be4d4ad83b03250`. Bundled-JS identity alone does not distinguish native fixes; full source and APK identity above are required.
- package-lock.json SHA-256: `826413237b938cd42880ac873c7c4580e960bd59153eeedc0f4bf5f2e09a9004`.
- Node 24.22.2; Homebrew OpenJDK 17.0.21.0.3; Gradle 9.4.1. Generated release uses debug test signing, not production signing.

Historical commands from `examples/ai-recorder` with Node 24 first on PATH:

```sh
npm ci
npm run typecheck
npm test
CI=1 npx expo prebuild --platform android --no-install
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools GRADLE_USER_HOME=/tmp/ai-recorder-gradle ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
```

The historical checks passed (64 JS tests). An initial run under Node 26 failed because it no longer accepts `--experimental-transform-types`. Native unit tests were NOT_RUN because that generated Android project had no `:app:testReleaseUnitTest` task.

Log SHA-256 values are `1fa0c5dbd35c7d0d7e2200cceff2f5565c750596c40ef401af6369c7d7371fee` for `assemble.log` and `30c7348caf42a907d47b89a0223b7193d8bc5ffa8092f0ec766cd8559de62106` for `tests-node24.log`.

`apksigner verify --print-certs` passed with an explicit JDK. The Android Debug signing certificate SHA-256 was `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
