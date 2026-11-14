# Focused Pause evidence audit — separate from frozen A/B

**BLOCKED: coordinator finite residual-risk decision pending.** The frozen matrix remains **5 PASS / 1 PARTIAL**, not a clean six-case pass. Native start remains **NOT_REPRODUCED / NOT_FIXED**, original cause/stage unknown. No production repair, owner acceptance, merge or deployment is claimed. This audit and one separately authorized playback-only check do not replay or amend an A/B slot.

## Existing candidate-1 evidence: observation versus inference

All times below are 2026-11-14 UTC. Host input invocation times are not instrumented device-delivery timestamps.

| Event | Actual evidence |
| --- | --- |
| Play invocation | 07:59:26.540121, observed clip display identity 3:59:20 PM |
| Last pre-input screenshot | Completed07:59:31.106884: **Pause,0:03 /0:26** |
| Intended Pause invocation | 07:59:57.132153; coordinates from that older screenshot;26.025269s after screenshot,30.592032s after Play invocation |
| Post-input snapshot | Began07:59:57.464286; fresh hierarchy **UNAVAILABLE**, idle acquisition failed; explicit empty hierarchy, no stale hierarchy reused |
| Later actual screenshot | Completed08:00:08.742170: **Pause,0:10 /0:26**, playback active |
| Completion failure | Assertion requiring an accessible Play label raised **AssertionError**. Standalone inner return code was not retained. The nonfailfast outer wrapper incorrectly marked PASS despite this traceback; preserved originals were already audited and status corrected to **PARTIAL**. Immediate count/Record-return steps were not completed. |

The immediate pre-input control was **not captured**. Natural clip completion followed by a tap restarting playback is consistent with elapsed time and the later0:10 position, but **is inference, not proven cause**. The original evidence cannot establish whether an active Pause control failed. It also cannot establish absence of a playback defect. Successful recording/save does not disprove a playback defect.

## What candidate-2 and candidate-3 establish

candidate-2 has fresh hierarchies beginning08:03:11.422975 and08:03:13.904242, both **Play,0:29 /0:51**; PNGs completed08:03:13.798950 and08:03:16.208322. candidate-3 has fresh hierarchies beginning08:07:40.525451 and08:07:42.998134, both **Play,0:13 /0:59**; PNGs completed08:07:42.886786 and08:07:45.320084. Thus both show a Play control and stationary displayed position across approximately2.4s on their own longer clips. They do not settle candidate-1's missing immediate input state, prove every clip/path correct or rule out intermittency. Their existing A/B PASS scope is unchanged.

## One separate targeted playback verification

Existing isolated candidate copy only; original profile and unrelated environments untouched. Before launch, the copy was stopped with no open profile files and its configured ports free; its retained full-copy chain/configuration was reused, no new profile created. Host microphone and output remained disabled. Installed production APK and embedded JS were verified against the identities below. Before and after checks found the exact original ten plus three A/B outputs (13 display identities), unchanged grants/flags/font/display/accessibility. These UI identity checks do **not** claim per-audio-file byte hashes.

Only the existing synthetic **3:59:20 PM,26-second** clip was played. No recording Start/save, reinstall/build, baseline run, retry or resume occurred.

| Observation | UTC / state |
| --- | --- |
| Play invocation | 08:32:49.734437 |
| Actual pre-Pause PNG completed | 08:32:50.911966: **Pause,0:00 /0:26** |
| Single Pause invocation / command returned | 08:33:01.428668 /08:33:01.455281 |
| First fresh hierarchy snapshot began | 08:33:01.455643: **Play,0:11 /0:26** |
| Second fresh hierarchy snapshot began | 08:33:06.855733: **Play,0:11 /0:26** |

**Observed result: Pause→Play and stationary0:11 across5.400090s.** This is a positive check for this clip/build, not a repair or general absence-of-defect claim. The pre-input screenshot-to-invocation gap was **10.516702s** because of tool round trips; it was early in the26s clip, and the actual paused position was11s, but this was **not an immediate pre-tap image/hierarchy**. That protocol limitation is retained rather than silently retrying the single allowed activation. No active-capture hierarchy dump was attempted; slow idle acquisition could consume playback duration. Both post-Pause hierarchies were fresh.

[Actual pre-Pause PNG](immediate-before-pause.png) · [First paused PNG](paused-first.png) · [Second paused PNG](paused-second.png) · [hash/size/time manifest](manifest.json) · [structured results](results.json).

## Provenance, restoration and decision boundary

Runtime source `6d5645f34f88ecd940c730eedd96e6529e6c919a`; APK SHA256 `522983e55f30567529bd4a61384c8ebc34c169905800573a5ce931795f4d6997`; embedded JS SHA256 `22422cccec847c87cce73e1d51a8cbcbbdeb86f70eb819c8055d5c4141464575`. Reporting changes are docs/evidence only; the45 product/config/lock bytes remain equal to runtime6d. Original successful UI artifact `8ae6828889015bf8d711c9c2706c9631471c7a6e` and frozen A/B evidence remain unchanged. Historical39 tests/typecheck/Release/full lint/review scope remains historical; no unnecessary rerun or remote CI.

No actual playback defect or cause has been established by this audit; the old candidate-1 episode remains unresolved. No fix proposed or implemented. Finite recommendation: coordinator may decide on the disclosed residual risk using this narrower positive Pause check, while retaining the candidate-1 PARTIAL and timing limitation. If risk is rejected, keep unmerged and separately authorize a tightly instrumented recurrence capture; do not infer a code fix or repeat cases indefinitely. Recording success is not used as playback evidence.

Budget:08:25:58–08:45:58 UTC,20min including audit/setup/restoration/publication. Final restoration/stop/publication checkpoint is appended after actual verification. Physical audible output and intermittent-path absence remain unverified. Parent handles human review/delivery; no owner request or Slack/Library upload.

Restoration and owned-copy shutdown completed **08:34:00UTC**; stopped/free-port/no-open-profile-file verification completed08:35:07UTC. Exact13 identities/settings/grants/flags and installed APK were preserved; Record idle restored before shutdown. Original profile remained untouched. Reporting checkpoint 2026-11-14T08:35:36.613069+00:00 (**9.64/20min**); final remote read-back retained separately.
