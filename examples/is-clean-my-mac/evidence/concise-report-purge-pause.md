# Concise report delivery and purge safety pause

## Delivered scope, not the original success claim

This candidate delivers a short decision view and an explicit **purge pause**. It does **not** deliver a successful guarded purge preview or complete issue #70. Real MacBook acceptance remains pending.

`audit.zh.md` and `summary_markdown` present major occupiers, up to five evidence-backed options, and decision-changing caveats. Sparse evidence yields fewer options instead of invented findings. `audit-details.zh.md`, `evidence-ledger.json` and the review plan retain detailed measurements and stable evidence identities. Links resolve to the actual sibling artifacts. Discussing an option number grants no execution authority. The optional precise-cache/file-type modes retain their earlier presentation and boundaries.

Clean and purge remain separate observations and may overlap. A partial clean directory count/size is not a complete purge result. Occupancy is not reclaimable space. Saved purge output with the official explicit incomplete terminal summary may preserve a PARTIAL estimate at exit 1; arbitrary failure, timeout, interruption and unknown output remain unavailable, not zero.

## Why purge is paused

The official [V1.72.0 timeout backend](https://github.com/tw93/Mole/blob/V1.72.0/lib/core/timeout.sh) can create a separate child process group. The existing outer cancellation kills the original group, which does not establish ownership of every subgroup. TERM with a grace interval is also insufficient: the Perl cleanup returns when its direct child exits, while a TERM-resistant grandchild may remain.

A disposable synthetic reproducer sourced the unmodified official Perl backend, launched only finite-lived synthetic writers, and recorded their known fixture session/group identities. Both original-group SIGKILL and SIGTERM allowed a subgroup's delayed synthetic write. The initial attempt encountered EPERM during final original-group cleanup and is retained as **INCOMPLETE**, not a passed cleanup proof. The second recorded the escapes and the same final original-group signal limitation; targeted checks of recorded fixture PIDs confirmed those synthetic descendants were no longer running afterward. This demonstrates a lifecycle gap, **not** a repaired containment guarantee. No broad process scan, process-name kill or signal-protection bypass was used.

Experimental mktemp routing was therefore withdrawn. The 4 MiB per-file resource cap was not enlarged; no write/network sandbox allowance or user configuration was changed. A larger per-file limit would not itself establish an aggregate scratch quota. The production purge entry now returns `FAILED`, `purge_lifecycle_unverified`, `execution_blocked=true`, `subprocess_started=false`, with candidate size UNKNOWN **before version, help or preview subprocess launch**. There is no environment flag to bypass this pause. Saved-output parsing remains available for historical evidence.

Other sources retain their existing behavior and boundaries. This change does not prove all-descendant cancellation for them. Earlier inheriting-process-group tests must not be described as such a guarantee. Actual official purge CLI success is not claimed; no new live user audit or cleanup was performed.

## Saved-input reporting evaluation

Actual saved redacted aggregate/plan inputs were privately verified against the prior authorized bundle; raw reports, paths and machine values remain outside the repository. The first deterministic short view was inspected, then corrected because its fixed valuable-data ordering selected a tiny container entry before a material simulator observation. Both versions remain retained. The revised deterministic report has five specific options and is about 83% shorter than the full details. That is a renderer check, not model behavior evidence.

A separate fresh response requested **Luna xhigh**, with no rendered report, Sol output or prior grades supplied, read the saved aggregate/plan plus official Skill/macOS reference and current wrapper contract. Requested controls and input/output hashes are recorded privately; runtime model settings were not independently verified. The same-source **Sol Medium** baseline was preserved unchanged. An independent report-only grader assessed concise usefulness and decision-changing caveats rather than demanding every byte/count in the main answer. Sol failed one material unique-container-state/backup caveat; Luna passed with minor clarity/length improvements. Neither output was rewritten or retried to manufacture a pass. This small saved-input evaluation is not parity, Fast-mode, live collection or cleanup acceptance.

## Validation

- 240/240 local tests passed with both native fixture flags enabled, no skips.
- Actual skill-creator `quick_validate.py`: passed.
- Existing synthetic runtime-boundary check: passed, covering protected overwrite/create/unlink/rename, symlink escape, descendant write denial, permitted scratch and the exact clean preview exception. It does not prove all-descendant cancellation.
- New tests cover concise length/options, material simulator priority, separate source outcomes, unknown currentness/counts, link reachability, disabled purge before any subprocess, and conservative saved-output parsing.
- Exact committed-head review is required before ordinary merge; this file is not an approval.

NOT RUN: a successful repaired official purge CLI preview, fresh installed status compatibility, fresh user-home audit, cleanup, Fast control, or MacBook acceptance. No installation, update, security/permission change or remote CI.

Owner verification remains the canonical managed update with scoped consent, then a fresh Luna session and the unchanged short audit prompt. The new answer should explain the intentional purge pause, not ask the owner to bypass protections. Keep #70 OPEN.
