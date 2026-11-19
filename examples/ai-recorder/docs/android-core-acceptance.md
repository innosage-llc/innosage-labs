# Android core acceptance #68

Physical acceptance is pending for [issue #68](https://github.com/innosage-llc/innosage-labs/issues/68). The historical APK below came from `2dd7d341eb66d7d76b1951ae2c1a6fbfc2f64050` (#67). The packet was reconciled against `7db439f6982ccbeccab188722d6e762aed4afa4a`. Before physical acceptance, select the intended source revision and record the SHA-256 and signing identity of its exact APK.

Use a dedicated spare phone or test profile with verified ownership. Check the exact wired ADB serial and pin all device-specific commands to it. Before installing anything, verify the APK hash, confirm the package is absent on the selected target, and ensure the test can proceed with existing permissions. If the package already exists, leave it intact. Proceed with an installed build only if its provenance and permission readiness can be verified. Before Start, confirm microphone permission was previously granted and the notification permission on applicable Android versions is already in a known non-prompting state. If any permission prompt appears, leave it ungranted, stop and mark capture BLOCKED. Require a controlled synthetic speech source, a listener who can evaluate actual Library playback, and an authorized offline setup. Preserve recordings and device/network settings.

Use a dedicated profile with an empty Recorder Library verified before Start. During the test, create only the one scripted recording and perform no imports. This makes a single newly highlighted Library row and the sole row after reopen an unambiguous file binding. Record its displayed timestamp and the unique audible A–E sequence at both playbacks. The Library displays the capture timestamp, and the playback duration appears after Play loads the file. Record the raw filename or URI only if an already authorized app-scoped diagnostic can resolve this one recording. When a unique match cannot be established, mark exact-file acceptance BLOCKED and retain the available evidence.

## Five-minute script

Prepare the synthetic audio before clock start. Use only the scripted non-sensitive markers and include periodic counts between markers to reveal gaps. Keep the test isolated from ambient and personal speech.

| Time | Action / speech |
| --- | --- |
| 0:00 | Visible Record: Start once. Once recording, say “Acceptance 68 A before lock, one two three four five.” |
| 0:20 | Lock; say “Acceptance 68 B locked, one two three four five.” |
| 0:45 | Unlock, foreground Calculator; say “Acceptance 68 C another app, one two three four five.” |
| 1:10 | Return; say “Acceptance 68 D returned, one two three four five.” |
| 1:25 | Say “Acceptance 68 E ending.” Tap Stop & save once. |
| 1:35 | Tap View in Library. Verify the single highlighted row says “Newly saved recording” and shows the expected capture timestamp. Confirm it is idle, then tap its Play control. Record the duration once playback loads. |
| 1:40–3:05 | Listen from the beginning through completion. Verify A–E in order and intelligible, with no unexpected silence, duplication or truncation. |
| 3:05–3:25 | After playback completes, remove only Recorder’s completed task from Android Recents using the normal gesture. Verify its task card has gone, then reopen from its launcher icon. Observe the initial Record screen before navigating to Library. A Home/Recents return to the existing playback screen is insufficient. |
| 3:25–4:50 | In the authorized offline setup, select the sole Library entry and match its timestamp to the first playback. Tap Play from the beginning, confirm the matching duration after load, and listen through E to completion. |

Do not force-stop the app, kill its process, rotate the device or try to reproduce a configuration change. Stop at the first actual failure and retain the evidence. At 5:00 record any unfinished step, elapsed time and last verified observation. Mark an unattempted step NOT_RUN or BLOCKED when a prerequisite is missing. Record an observed playback or persistence failure as FAILED.

## Evidence and verdict

Record UTC time, tester and listener, model/OS/API, source revision, candidate APK SHA-256 and signer certificate SHA-256, installed package version/code and verification tying it to that APK, permission readiness, offline setup, transition times, exact saved file identity, elapsed capture versus saved duration (explain a discrepancy over five seconds), marker order and audible defect timestamps. For an already installed package, use preexisting trusted install provenance or a permitted read-only hash of the installed APK on the verified serial. If the installed package cannot be tied to the intended APK, leave the acceptance run blocked. Keep raw synthetic audio local and leave existing personal recordings untouched. Optional file hash/container metadata supplements listening only.

Mark PASS only when the expected result is observed. Mark FAILED if an attempt contradicts it, BLOCKED if a prerequisite is missing, or NOT_RUN if the step was unattempted. Audible physical success requires listening to the actual recording through Library playback.

| Check | Current status | Owner evidence required |
| --- | --- | --- |
| Dedicated wired phone | BLOCKED | Verify the exact wired serial, model/OS and exclusive ownership |
| Safe speech/listener | BLOCKED | Controlled synthetic audio and a listener who can verify Library playback |
| Physical Start/lock/other app/return | NOT_RUN | Transition observations + audible A–E |
| Save/file continuity | NOT_RUN | Exact ID, duration and full listening |
| Library handoff/explicit playback | NOT_RUN | Same entry and explicit playback |
| Normal relaunch persistence | NOT_RUN | Completed task removed, fresh launcher entry, same unique Library row and duration |
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

Historical commands from `examples/ai-recorder`. The first `npm ci` ran under Node 26. Typecheck, successful tests, prebuild and assembly ran with Node 24 first on PATH.

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
