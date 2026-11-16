# P0 audit repair — 2026-11-16

Status: implementation tests pass; final independent exact-head review in progress; repaired MacBook end-to-end acceptance pending. Issue #70 remains open. No real cleanup, package upgrade/removal, permission change, Mole configuration modification or remote CI run.

## Real failure and scope

Jim's MacBook retained existing Mole 1.72.0 and discovered both Skills after installation. The short Luna request exposed four old-implementation failures: strict analyze key equality, clean timeout at 60 seconds/summary-only output, fixed purge stop, and UNKNOWN root without a manual root flag. Disabling the host sandbox did not fix these logical product failures. This repair does not require disabling sandbox, increasing the user prompt or changing model.

## Implemented

- Fixed four-source `audit-all.py`, 180-second Mole / 30-second worktree bounds, no source skipping after failure.
- Analyzer optional-field compatibility, extension/status uncertainty retained, fixed public disk/insight categories and negative/unavailable entries preserved as unknown.
- Fresh, bounded official clean-list category/count/rounded-byte aggregation; known build-artifact categories from purge preview. No raw paths/names/unknown field values emitted.
- Automatic bounded local CODEX_HOME/app-root discovery. Workspace count is the saved-root metadata snapshot, not a scan of workspace source. Worktree layout count is an independent shallow pass before payload sizing; byte coverage may be partial while count coverage completes. Unknown/custom/remote roots remain UNKNOWN.
- Every Mole call, including version/help, runs in a macOS write-denial/network-denial boundary with real HOME, private scratch/cwd, sanitized environment and no sudo/system-management tools. Clean alone permits its exact official preview file after physical/owner/single-link checks; neighbors/config/log/cache writes stay denied. Parent directory missing or unknown boundary stops that source.
- Deterministic Chinese report renderer and new redacted report artifact, so numerical evidence is available independently of model summarization.
- Receipt-verified opt-in wrapper update with explicit plan/INSTALL consent and old wrapper backup outside discoverable Skills. Existing Mole CLI/official Skill and unknown/modified files are preserved. Initial URL-fetch approval recovery is documented.

## Upstream evidence and runtime boundary

[1.72 JSON source](https://github.com/tw93/Mole/blob/V1.72.0/cmd/analyze/json.go), blob `90e65770f0cd22c9d5f4d67b23ec0b3226447be7`, marks `large_files` and `total_files` omitempty. Overview omits file count; omission is UNKNOWN, not confirmed zero. The official release binary reproduced no `large_files` on a nonempty 8 KiB fixture.

[Analyzer startup](https://github.com/tw93/Mole/blob/V1.72.0/cmd/analyze/main.go) starts pruneAnalyzerCache before JSON mode; [cache code](https://github.com/tw93/Mole/blob/V1.72.0/cmd/analyze/cache.go) uses HOME-derived cache and can delete/replace cache files. XDG_CACHE_HOME alone is not a safety boundary. No claim is made that a previous MacBook run deleted anything.

[Purge source loading](https://github.com/tw93/Mole/blob/V1.72.0/lib/clean/project.sh) can discover/save roots before help dispatch. Denied save can be nonfatal, retaining runtime discovered roots. The guarded fixed dry-run can therefore be attempted without permitting config writes; unverified discovered scope stays PARTIAL/false. No fabricated root count or bypass confirmation flag.

[Official clean](https://github.com/tw93/Mole/blob/V1.72.0/bin/clean.sh) hard-codes its final clean-list path. There is no verified scratch-only output override. Only that exact preview artifact is permitted, with no parent-directory creation or adjacent writes; this side effect is disclosed before running.

Apple Bash 3.2 [redir.c](https://github.com/apple-oss-distributions/bash/blob/main/bash-3.2/redir.c) calls sh_mktmpfd without MT_USETMPDIR; [tmpfile.c](https://github.com/apple-oss-distributions/bash/blob/main/bash-3.2/lib/sh/tmpfile.c) falls back to cwd after fixed system temp roots. A scratch-only write policy originally stopped heredocs despite TMPDIR. Denying metadata on those literal roots and using cwd=scratch was proven synthetically and with official version/help. This is a restrictive profile, not broad /tmp write permission. Software or scan roots under those excluded roots may fail; upstream cwd changes may also fail. Retain failures rather than relaxing the boundary.

## Executed evidence

Execution: Mac Studio, GPT-6.1 Sol Medium, Apple Silicon macOS, isolated owned checkout. Existing host Mole **1.54.0 remains unchanged**. Temporary official **1.72.0** source/release assembly is outside the repository, never installed over user software.

- Official `analyze-darwin-arm64` release digest matched GitHub asset SHA-256 `70567f8e1b067f8289b86ff705220274f486e97572e24aa3b5f262b827fb7efe`.
- Official tagged 1.72 entrypoint: guarded version, analyze help, clean help, purge help all exit 0 / expected flag recognized / no stderr. Full official entrypoint + release analyzer scanned only an 8 KiB synthetic directory: COMPLETE within that explicit fixture, one file, 8192 bytes. Not a full-host scan or MacBook acceptance.
- Installed 1.54 version/purge help also passed under the boundary; no host clean/purge preview ran during repair.
- `tests/check_runtime_boundary.py`: both scratch-only and exact-preview modes PASS. Synthetic cache overwrite/unlink/rename/create denied; symlink escape denied; child write denied; private scratch and heredoc fallback allowed; exact synthetic preview allowed only in clean mode; original cache bytes/entry list preserved. Inherited MO_ANALYZE_PATH/BASH_ENV removed. This test never invokes Mole.
- Unit/fixture suite and exact-head review results are recorded at completion below. Full adapter CLI against the temporary official 1.72 entrypoint also passed on the 8 KiB fixture with an injected inherited MO_ANALYZE_PATH override removed: exit 0, scope_verified=true, error_category=null. Tests include optional fields, private-value redaction, fresh preview parsing, independent count/byte coverage, no-follow races/links, four-source continuation, report completeness and installer consent/update protection.
- Applied actual local skill-creator SKILL.md: concise routing, progressive references, deterministic scripts for fragile behavior, executable validation, meaningful invariant tests and independent forward tests. Actual `quick_validate.py` reports **Skill is valid!**; that structural check alone does not establish runtime/model behavior.

## Independent forward evaluation

First repair forward test: one `gpt-6-luna` Medium inference, isolated synthetic aggregate/mock audit command and copied Skills, exact short Chinese prompt. It executed only the mock entrypoint and preserved safety, but omitted all supplied numerical values and returned a generic plan. **Report coverage FAILED.** This directly motivated the deterministic renderer; no longer prompt or model change was used. Raw events/logs remain local, never committed.

Targeted renderer revision: one fresh gpt-6-luna Medium inference with new synthetic values, same short request, unchanged real renderer/artifact logic and mocked source collector. Exit 0; only permitted mock audit ran. Artifact text equaled report_markdown and contained all six byte measurements, workspace 4, worktree 11, count coverage, four sources and actual release UNKNOWN/null. Luna read and linked the report, gave four-source/category measurements and preserved risk/overlap/worktree protections. **Complete artifact delivery PASS; complete inline reproduction NOT demonstrated**: inline text still omitted workspace/worktree counts and independent count coverage, which remain present in the linked report.

Initial independent review at 7b82e91 required changes: covered clean rows counted twice, negative entries allowed false COMPLETE, discovery ran outside the hard worker, and rounded preview estimates were mislabeled lower bounds. All four were corrected with regression tests; contract metadata-read disclosure also corrected. Final exact-head review result follows below. Historical cross-model comparisons were not rerun; no universal parity claim. This local Medium mock evaluation does not reproduce MacBook Luna xhigh Fast or prove its real filesystem acceptance.

## Remaining acceptance

Full host clean/purge dry-run compatibility and useful four-source reporting on Jim's MacBook are pending. Unknown versions, missing physical preview parent, nested sandbox denial or upstream cwd incompatibility may stop a source. No unguarded fallback, HOME substitution, config editing, package changes or permission broadening is authorized. Fresh MacBook installation where Mole is genuinely absent remains untested; do not remove its installed CLI to manufacture that test.

User handoff: agent-driven managed update from main, fresh session, then the same prompt: **全面审核我的 Mac 磁盘，给我清理计划，先不要清理。** No internal synthetic checklist is required of Jim. See MACBOOK-VERIFY.md.

## Final implementation checks

- Python unit/fixture suite: **58/58 PASS**.
- Actual local skill-creator `scripts/quick_validate.py`: **Skill is valid!**
- `git diff --check`: PASS. No remote CI was run or enabled.
- Final runtime proof and official full-adapter fixture repeated successfully after corrections; sanitized machine-readable results: [boundary proof](p0-runtime-boundary.synthetic.json), [official 1.72 fixture](p0-official-172.synthetic.json), [Luna artifact checks](p0-luna-renderer.synthetic.json). These are synthetic scope evidence, not MacBook acceptance.
