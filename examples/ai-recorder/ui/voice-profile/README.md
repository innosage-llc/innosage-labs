# VoiceProfile UI boundary

VoiceProfile stays off by default. This UI is staged on the existing Android
Pro recording/settings paths; it does not own account credentials, service
authorization, or GitHub issue creation. See the
[VoiceProfile v1 contract](../../docs/voice-profile/v1.md).

## Saved transcript and review

The existing Recorder saves and displays the original first. The optional
per-operation status remains available if naming is unavailable. A live
suggestion requires a same-account list and a final current capability-bound
result within one short deadline, before normal remote cleanup. Unknown or
conflicting cases stay anonymous. A backgrounded screen drops current suggested
names; the device never stores recognizer-returned names or profile IDs.

A user may explicitly save or edit a private local correction bound to the
same recording operation, immutable original hash, and source segment. It
does not modify the original, reuse consent, change enrollment, or publish
content. The ordinary summary and revision controls work independently.

## Android Stage Pro settings

The existing Pro settings mount a new `VoiceProfileManager` for the exact
configured staging account; opening it is the first point that lists profiles.
The account-scoped controller owns the request:

- `onRestore` projects only pending intent facts. The same key survives process
  loss and is used to verify uncertain enrollment or deletion. Absence from
  the list does not imply successful deletion or authorize another enrollment.
- `onEnroll` receives a separate bounded read-only Android SAF WAV/M4A clip,
  entered name, and explicit consent. A confirmed terminal receipt, not just
  successful transport, completes enrollment.
- `onDelete` sends only the selected profile. A pending intent remains visible
  until the same exact request confirms deletion. The UI cannot infer success.

## Confirmed locally recorded segment

The transcript can offer only a stable 2–30 second range from its exact
completed Stage Pro operation. Separate profile name entry and participant
permission confirmation are required; correcting a name never enrolls anyone.
The local Source hash must match the original accepted by the service. Android
decodes the chosen range through that same verified read-only descriptor and
sends only the bounded clip, not the original meeting. If the attempt is
interrupted, a sealed, same-account pending record can restore the same range
after launch, but requires fresh user confirmation and the same name. A late
cancel cannot turn a verified completion into a new write. With no verifiable
pending key, the user checks saved profiles before making another enrollment.

## Evidence boundaries

Offline fixture presentation was checked at 390 px and 1280 px using dummy
names and callbacks, including unknown/review states, long bilingual labels,
and the Cancel → confirm → pending → verified delete flow. This is not native
storage, paid account, or staging acceptance. The Android/iOS Simulator/Web
startup gate runs separately on the exact PR candidate. Do not use these checks
as evidence for real-device capture, bilingual acoustic accuracy, or deployment.
