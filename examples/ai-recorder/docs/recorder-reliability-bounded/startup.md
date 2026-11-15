# Bounded startup investigation (#65)

Disposition: **no consistent reproduction** after five separately numbered actual Start inputs on baseline product logic. Four captures completed and saved nonempty AAC containers; one explicit microphone-denial case returned permission-specific feedback before prepare/record. No matching generic startup failure occurred. This does not establish that the prior failure was absent or fixed; its cause remains unexplained.

All five S slots are consumed; none are unused. C1/C2 are separately numbered configuration cases, not extra S trials. Their font-only capture-owner interruption is reproduced; #66 remains open. A later lifecycle fix must not be presented as the cause or resolution of #65.

| Slot | Start UTC | Preconditions | Outcome | Saved bytes | Container duration |
|---|---|---|---|---:|---:|
| S1 | 2026-11-15T00:11:03.436759+00:00 | Foreground, real one-time microphone allow and notification denial | SUCCEEDED | 1035302 | 82.541 |
| S2 | 2026-11-15T00:27:03.455456+00:00 | Foreground repeat after prior config case restored; same app process | SUCCEEDED | 975446 | 77.811 |
| S3 | 2026-11-15T00:30:45.225199+00:00 | Cold app process, actual notification Settings return; denial unchanged | SUCCEEDED | 301939 | 23.876 |
| S4 | 2026-11-15T00:32:24.848311+00:00 | Microphone revoked, one Start, real microphone denial; no retry | EXPECTED_PERMISSION_DENIAL | — | — |
| S5 | 2026-11-15T00:36:40.688120+00:00 | Actual microphone Settings allow and return, one Start | SUCCEEDED | 732474 | 58.377 |

The [machine-readable attempt matrix](startup-attempts.json) records actual input/outcome times, artifact APK/JS hashes and private native-log identities. It contains no raw device IDs, native paths, audio, credentials or private flags. Raw receipts remain private.

All S attempts used same-signed private diagnostics with unchanged frozen-main product logic. Logging, protected native probes and synchronous read-only container inspection add overhead. The initial eager diagnostic flaw was corrected before installation; protected lazy reads were tested against throwing probes/serialization/console. Long metadata was subsequently split after actual logcat truncation. S1 and later S cases therefore have distinct diagnostic hashes. This is not an exact-production-timing claim.

Environment recovery/reconciliation completed within 25m18s using E1 only; no E2. The emulator used the per-process `-feature -WiFiPacketStream` flag. It is an environment difference, not a product fix or proven recording cause. Open-file/inode evidence corrected an earlier attribution: the active guest used the earlier independent task working copy, while the extra recovery copy was unused. The earlier attribution is retained as history; selection cause is unproven. Protected original/backup hashes were independently unchanged; 17 original Library identities were observed. Playback was not established by those identity observations.

Automation limits retained: an S1 pre-input receipt-name collision consumed no slot; live UIAutomator could not obtain idle hierarchy while the timer updated; local OCR failed, so fresh screenshots were visually inspected for Stop. None was relabeled as an app failure.

Only scoped #65 is eligible for the owner-authorized “no consistent reproduction” closure. Do not close #66, umbrella #60, #56 or #58 on this evidence.
