# Issue #29 — Evidence ledger

## PASS (verified on Mac Studio; no new Agent run)
- Read existing OpenClaw agent-local SQLite in read-only mode from running Docker container.
- Selected one completed historical model-associated run: 15 events
  including context compilation, prompt submission, five Tool Calls,
  five corresponding Tool Results, model completion, successful session end.
- Actual tools observed: browser open, title, close, skills_read, web_fetch.
- Session history persistence observed: 232 transcript events,
  231 active transcript rows, 167 runtime trace events.
- Sanitized output: only tool names, call refs, event seqs, timestamps,
  success flags, prompt lengths and numeric usage; NO raw message,
  prompt, result, tool argument value or credentials exported.
- Private standalone HTML generated, 15 expandable events,
  clear OBSERVED/PARTIAL/NOT OBSERVED boundaries.
- Offline safety tests: 3 Node sanitizer + 2 Python renderer PASS.
- Browser test (headless Chrome): 15 event cards, click-to-expand,
  privacy labels and no JavaScript errors.

## NOT OBSERVED / NOT VERIFIED
- Long-term memory retrieval by the observed run.
- Context compaction, full effective prompt, hidden reasoning.
- Approved CMO strategy, actual social publication, engagement feedback
  or business learning based on this specific historical run.
- Founder MacBook viewing private report (user-side follow-up).

## Decision
Existing OpenClaw already demonstrates observable model-associated tool
execution and persisted Session history. More mock-button social demos do
not help. InnoSage business layer will still need vetted Intake, approved
strategy, controlled publishing, dated feedback and next-decision records.
Do not close #27 or #11 based on this learning Spike.
