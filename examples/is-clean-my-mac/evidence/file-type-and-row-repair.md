# File-type and numbered-row repair — 2026-11-16

Implementation verification is separate from Jim's MacBook acceptance. This round fixes collection and inline delivery; it **does not deliver production selected-row cleanup**. Issue #70 must remain open.

## Real regression and diagnosis

Jim's second MacBook run still gave basic totals (analyze 134.427 GB PARTIAL; clean 7.140 GB PARTIAL, developer caches 6.399 GB), a purge failure without a specific sanitized reason, and UNKNOWN worktree inventory after workspace metadata rejection. The linked report did not solve the missing inline type answer.

Three distinct gaps:

1. Collection: Mole overview entries are directory/insight categories, not a file-type census. A renderer cannot invent video/image/archive/database proportions from a total.
2. Root discovery: optional saved-workspace schema failure incorrectly discarded an independently corroborated physical worktree root.
3. Delivery: duplicated full JSON/report text made the core answer easy to omit; the previous Luna artifact-link pass did not prove inline completeness. Purge diagnostics also discarded stage/exit/context, including an invalid-UTF8 corner found by review.

## Bounded repair

`audit-file-types.py` reads only filename/stat metadata within the local Home directory. Fixed public classes cover video, images, audio, documents, spreadsheets, archives/installers, databases, virtual disks, source/config, compiled files and other/unknown extensions. It reports unique regular-file inode allocated bytes (`st_blocks * 512`), separate logical bytes and file counts. Directory-purpose classes are a second view of the same files, not extra space.

Bounds: 30 seconds, 500,000 entries by default; queue max20,000; depth128; physical no-follow descriptor traversal, identity checks, same device, process watchdog. No file-content reads, symlink traversal, cross-device scan or automatic permission changes. PARTIAL percentages describe observed allocated bytes only; system directories/other users/volumes/link targets are excluded. Extension classification is not content-format validation. Hardlinks with different names/extensions are attributed to the first encountered name; total bytes are deduplicated, but type attribution may vary. APFS shared/clone blocks do not establish releasable physical space.

Unknown workspace metadata now leaves only workspace count UNKNOWN. Default worktree fallback requires a stable regular local app metadata marker and a physical no-follow worktrees directory; configured CODEX_HOME has its own explicit authority. Unknown remote/custom roots remain UNKNOWN; no guessing unrecognized values or reading conversation/source payloads.

Mole adapter now returns fixed `command_stage`, numeric `command_exit_code`, stderr presence and allowlisted diagnostic observations. Raw bytes/errors stay local. Markers are observations, not proof of root cause. Exact official 1.72 terminal no-candidate messages can report observed zero within unverified scope, while total estimate stays null; cancellation, incomplete/nonzero cases do not become zero. Invalid UTF8 preserves known diagnostics under a fixed encoding-failure category.

`audit-all.py` retains the four sources and attaches supplemental type metadata inside analyze evidence. It publishes a **compact deterministic numbered `summary_markdown` directly**, with type rows/counts, candidate estimates and accurate failure detail; full report, aggregate and plan are separate new local artifacts. No user file click is needed for the core answer. No raw filenames/paths/extensions or private error strings are returned.

## Numbered approval: implemented gate, unavailable production operation

Jim requested approval of rows such as 1,2,5,8 followed by exact execution and measurement. This authorizes implementation/testing, not cleanup now.

[Official Mole 1.72 Skill](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/SKILL.md) and [macOS reference](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/references/macos.md) document that clean has no selection list and rescans; purge --yes applies all eligible candidates, while subsets require interactive terminal. Clean may empty Trash by default. Source inspection confirms [clean](https://github.com/tw93/Mole/blob/V1.72.0/bin/clean.sh) rejects category/path selection, [purge](https://github.com/tw93/Mole/blob/V1.72.0/bin/purge.sh) lacks a precise unattended target API, and [project selection](https://github.com/tw93/Mole/blob/V1.72.0/lib/clean/project.sh) selects all eligible items outside its TUI. This is official pinned-source evidence, not a claim that Jim's installed binary was destructively tested.

Therefore **all current aggregate rows are review-only**: `operation=null`, `exact_scope=false`, `actionable=false`. Numbered approval cannot narrow a broad command, authorize unselected Trash/new candidates, delete whole worktrees or justify changing whitelist/purge config/TUI internals. The production capability set is empty and there is no cleanup executor.

The plan binds immutable rows to a SHA-256 plan ID and a 10-minute display-binding window (not proof that actual target membership remains fresh). Selection rejects wrong/tampered/expired plans, invalid/duplicate IDs, unknown scope, changed identities/membership and overlaps. CLI accepts only the same plan/IDs, reports per-row blockers and a deterministic outcome summary, and observes before/after available bytes via `statvfs f_bavail * f_frsize`. No cleanup ran, so actual freed remains null; free-space drift includes unrelated activity and is not attributed to cleanup.

Smallest safe upstream dependency: an official preview manifest with stable opaque candidate IDs, bound physical identity/eligibility and precise selected-ID apply API that rejects stale/changed scopes, rechecks upstream protection rules, touches only approved IDs, and returns per-ID outcomes. Only then can a separately reviewed adapter enable execution. The wrapper must not implement deletion, invoke private sourced functions, rewrite global config or guess TUI indices.

## Executed checks

Execution remains Mac Studio / GPT-6.1 Sol Medium. Existing installed Mole1.54.0 was preserved. No real Home census, host clean/purge preview, cleanup, package changes, system permissions/config changes or remote CI occurred in this round.

- Unit/fixture suite: 96 tests passed before final review, including actual synthetic-file metadata census, no mutation/private labels, hardlink/symlink/budgets, connected collector-to-report publication, malformed root metadata, diagnostics, plan schema/expiry/identity/change/overlap and unselected Trash protections.
- Execution tests are explicitly **test-owned fixture simulations**, not official cleanup proof. The synthetic executor lives only in tests, preserves unselected fixture Trash, measures scope bytes before/after and exercises partial failure/no retry. Installed Skill contains no executor.
- Actual local skill-creator guidance applied: deterministic scripts for fragile collection/reporting, progressive references, meaningful invariant/script tests, structural validator and independent forward testing. Actual `quick_validate.py` returned **Skill is valid!**
- Fresh gpt-6-luna Medium test, same exact short Chinese prompt, real collector only on four new synthetic files, mocked four upstream sources, real compact renderer/plan/artifact code: exit0. Inline numbered type rows contained all four sizes (32768/24576/16384/8192 bytes), workspace5, worktree13 with independent count/byte coverage, cache17MB, and purge FAILED/audit/exit23 with sanitized observations. No raw paths or false freed0. [Sanitized checks](file-type-inline.synthetic.json).
- Current approval CLI against that fresh own synthetic plan, rows1,2: BLOCKED, both aggregate_scope_not_executable, actual_freed=null, no executor/broad fallback. [Sanitized selection](row-selection.synthetic.json). No paid model rerun was needed for later schema/numeric-bound fixes; those have focused regression tests.
- Independent reviewers found and corrected malformed-plan traceback handling, oversized numeric/deep JSON boundaries, invalid-UTF8 diagnostic loss, and known preview-count loss. Final exact-head review status is recorded in the follow-up PR.

## Remaining gate and user handoff

The implementation can be verified with the same short Luna audit prompt after a receipt-verified managed update/fresh session. New real MacBook Home type coverage/usefulness remains pending; partial scans and source failures remain explicit. Purge's new diagnostic detail improves diagnosis but is not proof the underlying MacBook purge blocker is fixed.

Production selected-row cleanup is **not ready** until the official precise-scope API exists and a real adapter is safely validated. Keep #70 open and do not ask Jim to approve cleanup or run internal synthetic checklists to finish acceptance. Do not request private paths/logs; sanitized status/type/count feedback suffices.
