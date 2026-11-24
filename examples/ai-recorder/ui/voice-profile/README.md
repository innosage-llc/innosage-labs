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
