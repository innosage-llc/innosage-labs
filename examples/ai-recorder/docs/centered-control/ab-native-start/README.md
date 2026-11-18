# Frozen main / candidate native-start A/B — bounded result

**BLOCKED pending coordinator finite residual-risk decision.** Six execution slots are exhausted: **5 PASS,1 PARTIAL,0 FAILED,0 NOT_RUN**. All six production cases showed actual advancing recording timer, save success and user-triggered playback progression; this is **not** a clean six-case PASS matrix. The original06:42 candidate failure is **NOT_REPRODUCED, NOT_FIXED**. Its cause/failed stage remain unknown; no preexisting-defect classification or repair is justified. No seventh execution, product fix, instrumentation, merge, owner notification or approval request.

## Data safety and frozen identity

Two cold complete copies of the stopped task environment were made from the same frozen data. Original data/cache/encryption-key/backing-chain/config files were byte-verified; each copied backing chain resolved only within its own copy, not writable original data. Both copies booted and exposed all ten retained identities before baseline replacement. This verifies more than a successful copy command. Original profile was never booted/installed into for A/B, and its complete file bytes remained unchanged afterward. Copies and recovery artifacts remain private.

A private checkout was verified file-for-file against frozen main c1cafcce. Its offline Release build used the same existing cached dependencies, generated native config and known task key as candidate. Both APKs verified the same signing certificate, package and versionCode10/versionName0.1.9; existing document/recordings M4A naming/list/move schema was unchanged. Baseline installed by compatible `install -r` on copy A only: no downgrade flag, uninstall, clear-data, wipe/root/security bypass. All ten identities remained after baseline install. Copy B retained exact candidate APK. Package path/update timestamp stayed constant within each three-case version block; installed APK/JS read-back bound the block, with no installation between its cases.

| Version | Frozen source | APK SHA256 | Embedded JS SHA256 |
| --- | --- | --- | --- |
| main | `c1cafcce07ef156418ba89528807188271923bef` | `601356b408536d9bc63b9f4dfb483d0c4aebef1098c183f7d9e2d9999298ecbe` | `fb87470cffc7c42bf2cd727707756c8277c70b7506a15ef70f1546a599cef4f2` |
| candidate | `6d5645f34f88ecd940c730eedd96e6529e6c919a` | `522983e55f30567529bd4a61384c8ebc34c169905800573a5ce931795f4d6997` | `22422cccec847c87cce73e1d51a8cbcbbdeb86f70eb819c8055d5c4141464575` |

Environment: existing local Android API36 arm64 image,1080×2400/420dpi/font1.0, accessibility services disabled; host microphone/audio input/output disabled. Synthetic recordings only. No transcript/summary/provider request, new dependency/SDK/permission or remote CI. The frozen-main local assembleRelease passed; it is a new private baseline artifact, not the old proposal/other-task APK. Public product remains candidate6d, unchanged.

## Predefined matched scenarios

1. Data-preserving cold app process. Initial microphone Ask every time/ungranted ONE_TIME; notifications Off/ungranted USER_SET. Start; actual microphone prompt Only this time; actual notification prompt Don’t allow; actual timer progression; Stop & save; View in Library; explicit Play progression and Pause.
2. Notifications fixed Off (USER_FIXED after scenario1). Existing app microphone Settings Don’t allow then Ask every time; record OS process death/recreation. Normal Back return; first denial, retry/second denial, permanent blocked retry; manual Allow only while using app; normal Back return; one capture/save/locate/user-playback. Setup process death is not described as warm throughout.
3. Microphone held granted. Notification precondition On, then isolated target **On→Off** through the app’s existing Android Settings. Normal observed Back return; one Start; explicitly deny actual notification prompt; timer/save/locate/user-playback. This is not the earlier Activity-bring-front-only trial.

All slot STARTED entries precede their first scenario action. Setup recovery/library reads and final restoration had no record-start action and are not extra executions. Multiple required denials/retries belong to scenario2. UI controls were observed for each version; baseline Stop used the old text control, candidate Stop the actual native circle. No blind candidate coordinate was reused for baseline.

## Actual six-slot matrix (2026-11-14 UTC)

| Slot | Status | Wall-clock interval | Duration | Recording timer | Save / explicit playback |
| --- | --- | --- | --- | --- | --- |
| main-1 | PASS | 07:47:46–07:49:29 | 103.9s | [0:00→0:03](screenshots/main-1-record-later.png) | [saved](screenshots/main-1-save.png), [0:00→0:03](screenshots/main-1-play-later.png) |
| main-2 | PASS | 07:50:08–07:53:05 | 177.0s | [0:00→0:25](screenshots/main-2-record-later.png) | [saved](screenshots/main-2-save.png), [0:00→0:03](screenshots/main-2-play-later.png) |
| main-3 | PASS | 07:53:26–07:55:43 | 137.0s | [0:00→0:26](screenshots/main-3-record-later.png) | [saved](screenshots/main-3-save.png), [0:00→0:03](screenshots/main-3-play-later.png) |
| candidate-1 | PARTIAL | 07:58:45–08:00:08 | 83.6s | [0:00→0:03](screenshots/candidate-1-record-later.png) | [saved](screenshots/candidate-1-save.png), [0:00→0:03](screenshots/candidate-1-play-later.png) |
| candidate-2 | PASS | 08:00:19–08:03:34 | 195.4s | [0:00→0:25](screenshots/candidate-2-record-later.png) | [saved](screenshots/candidate-2-save.png), [0:00→0:03](screenshots/candidate-2-play-later.png) |
| candidate-3 | PASS | 08:05:25–08:08:03 | 157.9s | [0:00→0:26](screenshots/candidate-3-record-later.png) | [saved](screenshots/candidate-3-save.png), [0:00→0:03](screenshots/candidate-3-play-later.png) |

Budget began `2026-11-14T07:37:13+00:00`; hard deadline `2026-11-14T09:07:13+00:00` (90min including all setup). Runtime restoration/shutdown completed `2026-11-14T08:09:22.237607+00:00` at **32.15/90min**. This report was generated `2026-11-14T08:12:30.041626+00:00` at **35.28/90min**; later metadata/publication read-back elapsed is recorded in PR/issue. No budget extension.

## PARTIAL and observations versus inference

candidate-1 core recording0:00→0:03, save/located row and user playback0:00→0:03 were actually observed. The post-playback Pause attempt occurred after the26-second clip could have ended. A later PNG visibly showed Pause and0:10; fresh hierarchy was UNAVAILABLE, not stale, and the completion assertion failed. Timing and that image are consistent with a late tap restarting playback, but the immediate pre-tap control was not captured, so that causal explanation remains an automation inference. A non-fail-fast outer shell initially wrote PASS despite the assertion. Audit preserved original ledger/stdout/stderr/PNG and corrected the slot to PARTIAL. No scenario replay. The immediate11-file count/Record return was not completed in that slot; later candidate2 enumeration and final13-set equality verified this file and every original.

candidate-2 setup therefore began in Library with continued/restarted playback, unlike main2’s paused Record return. The predefined microphone revocation killed that process/player; after recreation the flags and entry conditions before the denial/manual-recovery sequence matched. This initial variance is retained and qualifies full end-to-end parity; it is not adapted away or called a native start failure. candidate-2 and3 completed their own full tails. No candidate-only production start failure was observed.

Both versions’ microphone revocation ended the app process during scenario2 setup; the later denial/manual-allow/capture part used the same newly created process. In scenario3 both versions’ notification On→Off terminated the app process; normal Back recreated it, the actual notification prompt appeared, explicit refusal returned to MainActivity and capture/save/playback succeeded. This directly tests the previously untested notification-switch variable. It does not prove the old notification helper caused the original generic error.

Full focused/top-resumed Activity, app PID/native-host pause/resume, grants/flags, actual phase/timer PNGs, fresh XML or explicit unavailable status and scoped native logs are private. Direct JS AppState values and per-awaited-stage completion/error were not instrumented. No A/B failure supplies matching causal evidence for the original event. Generic catch text, unchanged lines, system/native-loader warnings and these passing observations cannot establish a preexisting defect, an SDK cause, or a fix. One execution per condition is not a defect-rate study or timing benchmark; wall-time/clip-duration differences include deliberate waits and operator latency.

## Data and restored final state

Main directly enumerated10→11→12→13 identities. Candidate directly enumerated10→12→13; its immediate11 count was not completed after the PARTIAL case, and that intermediate count is inferred from one successful save, not claimed as observed. Both final exact sets contained all ten originals plus exactly their three specified saved identities. Display/accessibility identity enumeration is not a claim of direct per-file URI/audio-byte hashing. Complete original AVD bytes were unchanged, providing the original-data safety boundary.

Exact initial microphone/notification grants **and flags** restored through only the app’s Settings UI; font/display/accessibility matched the frozen-original restoration receipt and setup window configuration, without global/security setting writes. Candidate also has an explicit pre-case settings read. Main copy was restored by compatible same-signed update to exact production candidate APK/JS after its cases, then all13 identities reverified without recording. Candidate copy stayed on the production package. Both copies were safely stopped after actual idle; original remains stopped/untouched. No emulator is claimed available after exit. Recoverability copies/keys/config/APKs remain private, not published.

## Finite recommendation and remaining limits

**Recommendation to coordinator:** accept the explicitly disclosed residual risk for this presentation-only PR and clear this specific runtime blocker after reviewing this packet, rather than waiting indefinitely for an intermittent episode. Basis: six positive native start/save/user-playback chains across frozen baseline/candidate, matched permission/notification boundaries, no observed candidate-only start failure, and preserved original data. Qualifications: full matrix is5 PASS/1 PARTIAL; candidate2 has the disclosed setup variance; the original failure remains unexplained, not fixed. This is a recommendation only, not executor risk acceptance or owner/merge approval. Until coordinator decides, PR61/issue60 remain BLOCKED/open and unmerged.

If coordinator does not accept that residual risk, keep unmerged and authorize one separately bounded private stage/error-logging investigation at an actual recurrence (mic permission, notifications, audio mode, prepare, record), with signature/data safety and restoration verified. No silent replay/seventh case in this run. No production fix is proposed by the present evidence.

Historical unchanged-source local39 tests/typecheck/Release/full lint and independent code/visual reviews retain their prior scope/dispositions; they were not rerun or relabeled as new A/B gates. Physical audio quality/spoken output, audible TalkBack, iOS/Web, controlled native disk/save faults and direct JS/per-stage instrumentation remain unverified/NOT_RUN. No repair session or broad native rewrite.

[Sanitized structured results](results.json) · [30 original proof PNG hashes/sizes/source/times](manifest.json). These are frozen-production **A/B investigation** screenshots, not owner UI acceptance. The original06:42 error and artifact8ae successful UI images remain unchanged. No raw private Skills/Brain/prompts/traces/logcat, host paths, device identities, keys or audio are public. No Slack/Library delivery by this executor; parent handles attachments.
