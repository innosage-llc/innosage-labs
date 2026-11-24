# VoiceProfile UI boundary

This area may contain scoped presentation components for optional speaker
identification. It must not own service credentials, enrollment or GitHub writes.
The existing transcript owner controls mutation and staging capability.

`VoiceProfileStatus` takes availability, pending state, and counts of matched,
reviewable, and unknown segments. Pending takes precedence over availability.
The review action appears when an available result has a positive review count.
Pressing it calls the supplied `onReview` callback.

## Master Issue V6 render evidence

All counts below are synthetic and listed in matched, review, unknown order.

| State | `available` | `pending` | Counts | Expected presentation |
| --- | --- | --- | --- | --- |
| Pending | `false` | `true` | 0, 0, 0 | Matching in progress |
| Mixed review | `true` | `false` | 1, 2, 3 | Ready to review, with the review action above the counts |
| Service unavailable | `false` | `false` | 0, 0, 0 | Matching unavailable and transcript anonymous |
| Unknown only | `true` | `false` | 0, 0, 3 | Transcript anonymous, with the unknown count |

- Recorder Android at 390 dp — `NOT_RUN`.
- Recorder Web — `NOT_RUN`.

The current Recorder entry points do not mount the component. The lead can use
these states to verify hierarchy, wrapping, clipping, and action obstruction
when the component is mounted for acceptance.

## VoiceProfileManager handoff

Mount `VoiceProfileManager` as a secondary action after the original transcript.
Keep the manager mounted while its modal opens and closes so its in-memory
mutation keys survive. Mount a fresh instance when the active authorization
context changes.

- `onList` returns display summaries. When the manager supplies a pending
  enrollment mutation key, return `enrollment` only if the exact request's
  outcome is verified. A matching name or an absent row is insufficient to
  resolve an upload. The user can explicitly resend the same clip with the
  same key while the result is unresolved.
- `onEnroll` takes bounded bytes with the canonical audio MIME type, the
  confirmed display name and consent, and the mutation key. The parent owns
  the direct-sample request and authorization. The 2–30 second limit and
  single-speaker requirement are shown as selection guidance.
- `onDelete` takes a profile ID and its mutation key. A pending response keeps
  the row and the key available for an explicitly confirmed verification.

Manager screen preview at 390 px — `NOT_RUN`. For lead acceptance, use synthetic
anonymous transcript, ready profile, and pending deletion states. Check the
original transcript stays accessible, the consent and send controls are
reachable, long names wrap, and pending deletion stays visible through refresh
until confirmed. Verify the original transcript after deletion.
