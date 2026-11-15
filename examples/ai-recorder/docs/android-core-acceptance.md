# Android core acceptance #68

Physical acceptance PENDING. Source: 2dd7d341eb66d7d76b1951ae2c1a6fbfc2f64050 (current main including #67). Isolated Mac Studio worktree: /tmp/innosage-labs-issue68, branch codex/issue68-android-acceptance. No source changes.

Prepare a quiet non-sensitive setting, consenting speaker and human listener, authorized spare phone/test profile with co.innosage.labs.airecorder absent, existing permissions ready, and an already offline setup. Do not overwrite an app, clear data, request permissions, change network/security settings, use personal content or call providers. A fresh installation normally needs microphone permission; if any new permission request is required, mark capture BLOCKED under this task and wait for a separate owner decision. Verify APK hash before owner installation; if package exists, stop installation preparation. No installation or microphone capture was attempted.

## Five-minute script

Prepare before clock start. Speak only synthetic markers; periodic quiet counts between markers help reveal gaps.

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

Record UTC time, tester/listener, model/OS/API, source/APK hashes, app version/code, permission readiness and offline setup, transition times, exact saved file identity, elapsed capture versus saved duration (explain >5 seconds discrepancy), marker order and audible defect timestamps. Keep raw synthetic audio local. Do not enumerate/export existing personal recordings. Optional file hash/container metadata supplements listening only.

PASS requires observed evidence for that row. FAILED: attempted expected result contradicted. BLOCKED: prerequisite missing. NOT_RUN: no attempt. Tests, screenshots and parseable containers do not prove audible/physical success.

| Check | Current status | Owner evidence required |
| --- | --- | --- |
| Device discovery | PASS | ADB saw Samsung SM-S906B Android 16/API 36; not consent to record |
| Safe speech/listener | BLOCKED | Consenting setup and human listener |
| Physical Start/lock/other app/return | NOT_RUN | Transition observations + audible A–E |
| Save/file continuity | NOT_RUN | Exact ID, duration and full listening |
| Library handoff/explicit playback | NOT_RUN | Same entry and explicit playback |
| Normal relaunch persistence | NOT_RUN | Same ID and duration after reopen |
| Offline full replay | BLOCKED | Authorized already offline setup + full listening |
| Owner final acceptance | PENDING | Review complete ledger and decide |

## Checks and limitations

Read full live #68, CONTRIBUTING.md, workflows/issue-to-pr, README and installed Expo local-build guidance. No applicable AGENTS.md or engineering skill found in this repository. No .github/workflows exists at candidate source; remote CI not invoked. Other active worktrees preserved.

npm ci PASS. Initial npm test under Node 26 failed because --experimental-transform-types was removed. With repository-required Node 24, npm run typecheck PASS; npm test PASS (23 transcript/service/recovery + 16 navigation/handoff + 25 capture = 64). Expo Android prebuild PASS. First Gradle command failed: :app:testReleaseUnitTest does not exist; native unit tests NOT_RUN. Standalone :app:assembleRelease PASS (1m34s; 348 tasks). APK receipt below.

Documentation write into Mac Studio worktree was denied twice by the file tool's configured allowed-directory boundary, including once after reading owner authorization. No shell workaround was used. That filesystem restriction remains in force. A separately authorized GitHub API workflow publishes only this sanitized document on a new scoped branch; it does not access the denied path. Raw build logs remain local and are not independently reviewed build evidence.

#67/#66 is same-JS-runtime configuration recreation only. Process death/native-context destruction/old-cache recovery outside scope. #65 stays NOT_FIXED and five-slot budgets remain exhausted. Broader #56/#58/#60 stay open. iOS #63 untouched.

Owner final steps: verify receipt/hash and absent-package target, arrange safe speaker/listener and offline setup, execute this single script, fill evidence ledger, review any failure/blocker, then explicitly decide acceptance and merge. No merge/deployment/closure performed.

Issue: https://github.com/innosage-llc/innosage-labs/issues/68

## Independent review

A separate read-only reviewer inspected the prepared packet before GitHub publication. No unsafe recording instructions or false physical-success claims found. Reviewer requested the artifact receipt and exact command/log evidence, clarification that fresh-install permission requests remain blocked, and a shorter timeline. Permission/timing edits applied. Review covered documentation only, not independent verification of build/test claims.

## Artifact receipt and exact commands

Mac Studio APK (local access only; not uploaded):
`/tmp/innosage-labs-issue68/examples/ai-recorder/android/app/build/outputs/apk/release/app-release.apk`

- APK SHA-256: `d3700973f2b865709bfdc7c7b6b461d7a09ba33c1b33bfa8d75774e11c9235ad`
- Size: 26,106,463 bytes; package co.innosage.labs.airecorder; version 0.1.9/code 10; arm64-v8a; min API 24, target 36, compile 37.
- Bundled assets/index.android.bundle SHA-256: `d3c19759789408fc85be2766debbe2a0241bf93ed668a7711be4d4ad83b03250`. Bundled-JS identity alone does not distinguish native fixes; full source and APK identity above are required.
- package-lock.json SHA-256: `826413237b938cd42880ac873c7c4580e960bd59153eeedc0f4bf5f2e09a9004`.
- Node 24.22.2; Homebrew OpenJDK 17.0.21.0.3; Gradle 9.4.1. Generated release uses debug test signing, not production signing.
- Worktree tracked diff/status clean after build. Generated Android files and dependencies are ignored; existing worktrees unchanged.

From examples/ai-recorder, with PATH prefixed `/opt/homebrew/opt/node@24/bin`:

```sh
npm ci
npm run typecheck
npm test
CI=1 npx expo prebuild --platform android --no-install
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools GRADLE_USER_HOME=/tmp/ai-recorder-gradle ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
```

All above observed PASS (npm ci first ran under Node 26; checks/build used Node 24). Logs retained on Mac Studio at `/tmp/issue68-evidence/`: npm-ci.log, typecheck-node24.log, tests-node24.log, prebuild.log, assemble.log. Failed-command evidence: tests.log (Node 26 flag incompatibility), gradle.log (nonexistent testReleaseUnitTest). Native unit tests NOT_RUN; no app source changed. Initial apksigner invocation failed for unset JAVA_HOME; explicit JDK verification follows.

Log SHA-256: assemble.log `1fa0c5dbd35c7d0d7e2200cceff2f5565c750596c40ef401af6369c7d7371fee`; tests-node24.log `30c7348caf42a907d47b89a0223b7193d8bc5ffa8092f0ec766cd8559de62106`.

Signature verification PASS with explicit JAVA_HOME using build-tools/36.0.0/apksigner verify --print-certs. Signer: Android Debug. Certificate SHA-256: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Receipt observed 2026-11-15T10:34:42Z. This confirms a signed APK, not installation or playback success.

Publication scope: one documentation file only; no application, dependency, service, permission, iOS or CI changes. Current GitHub main and applicable CONTRIBUTING/workflow instructions were rechecked before branch creation. The repository has no .github/workflows directory at the checked main; no remote CI was invoked. Physical acceptance and owner merge approval remain pending.
