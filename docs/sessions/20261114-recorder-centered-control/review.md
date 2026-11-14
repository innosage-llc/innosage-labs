**BLOCKED: native-start cause/reproducibility remain unknown; no repair.** See [investigation](../../../examples/ai-recorder/docs/centered-control/native-start-investigation.md). Earlier independent reviews do not clear this runtime blocker.

# Independent reviews and dispositions

All reviews used fresh local Mac Studio Codex CLI gpt-6.1-sol medium, read-only. Private raw outputs/prompts remain outside Labs. No review grants owner acceptance or merge authority. Current boundary: coordinator delivery review first; do not seek owner approval yet.

## Coordinator R1

The previous source allowed a retained saved URI to show View in Library after the success message cleared. Baseline global notice had a message gate. Corrected with one current-success predicate for CTA and storage, without changing handlers, file identity, audio ownership or navigation. Actual final save → new capture → save → View in Library → explicit Play/Pause → return shows honest idle/storage with no stale success/CTA. A fresh force-stop/relaunch without clear-data shows the same idle; Library still contains retained recordings. Earlier candidate launch evidence is superseded, preserved privately and not relabeled.

## Final code review

Exact runtime6d5645f versus previous PR head73c3471: no actionable findings. Reviewer independently inspected source/installed native contracts and meaningful feedback/recovery tests. It explicitly limits its conclusion to source review; helper/reducer tests do not establish native integration. Final local39 tests/typecheck/Release/full lint and actual runtime evidence are separate receipts.

## Visual review sequence

Initial visual review identified weak/left-aligned saved retrieval grouping and a transition-frame navigation inconsistency. Centered/grouped the existing tonal action and replaced the transition frame. Coordinator later found R1, which prior reviews had missed; the review history is not rewritten as finding-free.

Fresh correction review at2220bca found consistent idle/saved/return and clear retryable copy, but requested an explicit blocked-permission path. Updated only the English copy to the observed Android device Settings > Apps > AI Recorder > Permissions > Microphone path; rebuilt and recaptured final6d5645f.

Final separate fresh visual review inspected cold idle first, then actual recording, saved/Library/playback-return and both errors. It found clear first action, legible status+timer+Stop & save, explicit saved completion and idle without retained success. It distinguished retryable guidance from device-settings guidance, without inferring actual permission transitions from screenshots.

Two residual visual suggestions remain explicitly recorded:

- Make Open Android settings a prominent recovery action. This is expressly prohibited in the approved correction scope. No button was added. Copy now supplies the explicit external Android device path. Actual native canAskAgain=true reopens the system prompt; false remains blocked and displays manual instructions; manual system recovery permits subsequent capture. This is a scope-constrained runtime-based disposition, not a claim of no visual findings.
- Add editable titles/previews for older timestamped recordings. Explicitly out of scope; no Library feature expansion. Immediate saved URI handoff, file retention and manual playback were actually exercised.

Saved CTA prominence versus the owner-approved large circular mic remains the documented design tradeoff. No new owner approval is sought in this executor continuation. A previous suggestion for sticky recording status across scrolling was outside the accepted adaptive-scroll scope; actual Stop & save and bottom navigation remain reachable at both captured endpoints.

## Observed runtime boundary

External permission/notification switching produced an observed native start error and a retry that remained Starting before failing. Data-preserving cold relaunch restored normal capture. Cause is unverified; no ownership-reset or recovery-handler workaround was introduced. Failed/transition captures stay private. The final evidence chain starts from observed normal recording and validates saved/idle labels before accepting them. Controlled native failure injection, physical audio, audible TalkBack and other NOT_RUN limits remain explicit in the evidence README.
