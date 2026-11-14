# Native start investigation — BLOCKED

**Readiness: BLOCKED pending native-start investigation. Startup lifecycle is NOT repaired. Coordinator review remains pending; no owner UI/merge acceptance is requested.** This supersedes earlier review-ready language. Production runtime source is `6d5645f34f88ecd940c730eedd96e6529e6c919a`; intake PR61 head was `9c50e7a38bef3b1bb63abf2ad05fd222caf67138`. The R1/R2 screenshot artifact remains `8ae6828889015bf8d711c9c2706c9631471c7a6e`; its successful states are historical evidence, not resolution of this blocker.

## Observed sequence (2026-11-14 UTC)

| Time | Evidence / observation |
| --- | --- |
| 06:39 | Notifications switched off; microphone Ask every time; two native denials produced retryable then permanent guidance. Manual Android device Settings allowed microphone; existing Activity brought front; Start attempted. |
| 06:41 | A save assertion found Starting, not verified Recording. Earlier filenames recording/recording-timer did not establish the phase. |
| 06:42:12 | Actual production screenshot reports Could not start recording. Return to the app and try again. |
| 06:42:47 | Retry screenshot shows Starting. |
| 06:43:58–06:44:06 | Data-preserving force-stop/relaunch, then actual Recording. Subsequent confirmed flow saved, found, manually played/paused and returned to idle with files retained. |

Only one mixed failure episode plus retry is established. Prior own-app PID logcat contains Activity pause/resume and recording-service creation, but no established specific exception or failed awaited stage. Cold-launch recovery does not establish a fix or cause.

![BLOCKER DIAGNOSTIC — production6d actual start error, not accepted UI](diagnostics/native-start-error-production6d.png)

This is a **BLOCKER DIAGNOSTIC** screenshot of the production6d error at 06:42:12.302281 UTC, not an accepted UI or diagnostic/mock build. Original PNG SHA256 `d8d742c4e6209f9f14b75fd25602c9e056e89ebf40b4abe6ebdfb1de79ff35ee`, 99816 bytes,1080×2400. See diagnostics/manifest.json. It is separate from the25 successful-state artifact images.

## Observation versus inference

The earlier notification helper queried mCurrentFocus in scoped `dumpsys window windows`; that output need not expose focus. A notification system dialog may have been missed. Several settings, starts and lifecycle transitions were mixed, so causation remains unknown. Neither a missed prompt nor a native service race is established.

Source inspection: start awaits microphone permission, notification permission, audio mode and recorder prepare before synchronous record. The generic catch discards cause. Installed expo-audio source58.0.11 requests Android permissions via the native permissions manager; background-enabled prepare binds its recording service before MediaRecorder prepare. These are candidate observation boundaries, not evidence that any particular boundary failed. Unchanged start-path lines do **not** prove an unchanged-baseline defect.

## Earlier offline continuation (historical)

Read-only verification of the sole authorized task device returned device not found twice. No emulator was started, no other target/server/port/process was accessed, and no app data/settings/permissions were changed. Current installed APK could not be re-read. Prior pulled production verification remains historical: APK SHA256 `522983e55f30567529bd4a61384c8ebc34c169905800573a5ce931795f4d6997`, embedded JS SHA256 `22422cccec847c87cce73e1d51a8cbcbbdeb86f70eb819c8055d5c4141464575`.

- Controlled trials: **NOT_RUN**,0/3; device unavailable; no startup attempted in that earlier continuation. The no-startup wording came from the coordinator’s then-current executor prompt, not a system/security approval rejection. This historical result is superseded by the controlled continuation below. Stable reproducibility **NOT_ESTABLISHED**.
- Baseline same-data compatible-build trial: **NOT_RUN; baseline defect NOT_ESTABLISHED**.
- Native failed stage / causal evidence: **UNKNOWN**. No private diagnostic build or instrumentation installed.
- Repair: **NONE**. No product mutation, reset, timeout/cancel/retry workaround or native/dependency rewrite. All45 product/config/lock files remain byte-identical to runtime6d; final head changes docs only.
- Existing exact-source checks remain historical PASS:39 tests, typecheck, offline Release and full lintRelease (0 errors/22 warnings). They do not clear this runtime blocker. No new build/tests or independent code/visual acceptance is claimed for a nonexistent fix. All prior physical audio, TalkBack, native fault-injection and platform limits remain.
- Saved-file count/persistence and settings restoration in that earlier offline continuation: **NOT_RUN**, because the device was unavailable. No changes were made; earlier restoration receipts remain historical, not a claim that the emulator is currently available.

## Smallest next diagnostic step

The later coordinator instruction authorized recovery of the same existing task AVD. The three controlled trials below are now complete and the bounded trial budget is exhausted. No further production retries or baseline build are justified by this run. The smallest next diagnostic is to preserve the full foreground, actual phase and own-app/native logs immediately if the original failure recurs. If that supplies a repeatable production failure, a separate private, same-signed/data-preserving stage/error-logging build can identify which awaited boundary rejects. That build would require verified update safety and restoration of production afterward. No such build was made here; do not infer a cause or add a speculative recovery workaround.

PR61/issue60 stay open and BLOCKED. No merge, auto-merge, deployment, remote CI, duplicate issue, broader acceptance closure, Library upload or Slack message. Raw logs, Skills/Brain/prompts/traces, device identifiers, host paths and audio remain private.

## Controlled continuation — original owned environment recovered

The same pre-existing task AVD was recovered only after its ownership, original profile/data files, audio-disabled configuration and configured-port availability were checked. No new AVD, data clearing, uninstall, restore, physical device or shared ADB/server/process change. The earlier no-startup wording reflected a coordinator execution constraint, not an approval rejection or a security policy. No startup had been attempted in that earlier offline continuation.

Installed production APK and embedded JS were re-read and matched both before and after the trials: APK `522983e55f30567529bd4a61384c8ebc34c169905800573a5ce931795f4d6997`, JS `22422cccec847c87cce73e1d51a8cbcbbdeb86f70eb819c8055d5c4141464575`. Source remains6d5645f. No app build, install/update, instrumentation or production mutation was performed.

### Three trials, no extra retry loop

Times below are UTC action/observation windows. Dynamic screenshots were visually read; no filename establishes Recording.

| Trial | Controlled actions and actual foreground | Result |
| --- | --- | --- |
| 1;07:17:49–07:19:17 | Data-preserving force-stop/cold launch; notifications held off. One Start opened the actual microphone GrantPermissionsActivity. Explicit Only this time yielded the actual notification prompt, explicitly denied. App MainActivity returned foreground. | Actual Recording timer0:11→0:43, observed Stop & save, success+View, new Library row. No start failure. Notifications remained ungranted; second denial added the native USER_FIXED flag. |
| 2;07:19:53–07:22:47 | Notifications held off throughout. Setup documented that tapping an already selected Ask every time did not revoke an active one-time grant. Explicit microphone revocation ended the original process; Ask every time then normal Back navigation recreated it. In that same new warm process: first denial→retry prompt→second denial→blocked retry→manual Settings allow→observed Back through permission page/app-info to MainActivity→one Start. | Retryable then permanent guidance matched actual dialogs; blocked retry opened no prompt at the observed check. Manual allow and return retained the same process through capture. Actual timer0:00→0:08, Stop & save, success+View and new Library row. No start failure. This is not described as warm across the OS-triggered setup process death. |
| 3;07:22:52–07:23:39 | Only Activity return method varied: visit the owned app-info page, then original am start MainActivity bring-to-front method. Microphone stayed allowed, notifications stayed off, same warm process. The command confirmed existing task brought front; full window/top-resumed Activity confirmed MainActivity before one Start. | Actual timer0:00→0:09, Stop & save, success+View and new Library row. No start failure. Isolated notification toggling followed by capture was NOT_RUN; trial3 selected the alternative Activity-return variable. |

Native host lifecycle pause/resume and recording-service creation were retained privately with timestamps and actual top-resumed/focused Activity, permission grants/flags and process identity. Direct JS AppState values and per-awaited-stage JS completion were **not instrumented**. No specific exception establishes the original failed stage. Boot/system or native-loader warnings are not attributed as the cause of the original episode.

Automation limits are explicit: the first dynamic hierarchy call could not obtain idle state and retained an earlier dialog hierarchy. That XML was marked invalid; no action/phase assertion used it. The actual PNG showed Recording0:11. The private helper was corrected to delete stale XML and mark unavailable hierarchies; later live timers use fast actual screenshots, not hierarchy idleness. Stops used the visually observed active Stop & save control. One Settings intent resumed an already open permission page; an expected-label assertion stopped the script before mutation, then navigation followed the actual page. Library enumeration used fresh Play/Transcript accessibility labels, including a partially visible row; it verifies display identities, not file-byte/URI hashes.

### Data, restoration and interpretation

Before trials Library held7 observed synthetic recording identities. Afterward it held10: all original7 plus exactly3 successful trial saves. Trial save display times were3:19:13,3:22:43 and3:23:33 PM in the emulator’s existing timezone. No playback/autoplay, transcription, summary or network provider action was invoked. A final post-restoration/process-recreation enumeration checks persistence separately.

**Outcome:0 start failures in3 controlled trials; the original failure is NOT reproduced, not disproved.** Original06:42 actual error and retry remain valid. Stable minimal repro, original causal stage and root cause remain **UNKNOWN / NOT_ESTABLISHED**. Baseline compatible same-data trial **NOT_RUN; baseline defect NOT_ESTABLISHED**. Passing trials do not establish a fix. Product repair **NONE**, diagnostic build **NOT_RUN**. No lifecycle reset, timeout/retry workaround or native rewrite was introduced. The45 product/config/lock bytes remain identical to6d; historical39 tests/typecheck/Release/full lint remain applicable source checks but do not clear BLOCKED. No new fix acceptance or independent review is claimed.

The initial notification grant was false with USER_SET, microphone false/Ask every time with ONE_TIME. After trials the exact initial grants **and native flags** were restored using only the owned app’s Settings UI; notification on→off cleared the denial-added USER_FIXED flag, with no recording trial during that restoration. Font1.0, physical1080×2400/420dpi, accessibility service null/accessibility0/touch-exploration0 match initial values without global/security setting writes. Host microphone/audio stayed disabled. Final verification at07:26:36 UTC found all10 display identities retained after process recreation; at07:26:39 installed production APK/JS still matched. Actual idle and initial permissions were checked before safely stopping only the original task emulator at07:27:55–07:27:57 UTC. Final availability: **STOPPED**, userdata retained; it is not left available after executor exit.

The selected new images in diagnostics/recovery-trials are **production6d controlled-investigation evidence only**, not accepted owner UI or replacements for artifact8ae. Their manifest records original PNG hashes/sizes and observation times. No private logs or traces are published.


| Controlled investigation proof only | Actual timer | Saved feedback |
| --- | --- | --- |
| Trial1 | [Recording0:43](diagnostics/recovery-trials/t1-timer-confirmed.png) | [Success](diagnostics/recovery-trials/t1-save-result.png) |
| Trial2 | [Recording0:08](diagnostics/recovery-trials/t2-progress-observation.png) | [Success](diagnostics/recovery-trials/t2-save-result.png) |
| Trial3 | [Recording0:09](diagnostics/recovery-trials/t3-timer-progress.png) | [Success](diagnostics/recovery-trials/t3-save-result.png) |

[Diagnostic proof manifest](diagnostics/recovery-trials/manifest.json). Original artifact8ae remains unchanged. Readiness remains **BLOCKED** pending an evidenced explanation of the original episode; these passing trials do not justify owner acceptance or a speculative repair.
