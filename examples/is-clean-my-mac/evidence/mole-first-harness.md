# Mole-first harness revision — 2026-11-16

Implementation in progress; real MacBook acceptance remains pending and #70 stays open. Execution: Mac Studio, GPT-6 Astra low as requested. This supersedes the earlier mandatory Home census / precise-candidate audit path, not the safety boundaries or optional precise executor.

## Change and authority

Read the actual local skill-creator SKILL.md (system skill, `quick_validate.py` validator). Applied its guidance to retain only decision-changing instructions, defer substantial optional execution to a linked reference, preserve user scope and approval, execute changed scripts, and independently forward-test realistic requests. The official Mole V1.72 Skill and macOS reference were read directly from the previously verified local upstream source assembly; they remain external GPL dependencies, never copied into this repository.

Official source: [Skill](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/SKILL.md), [macOS reference](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/references/macos.md), [JSON analyzer](https://github.com/tw93/Mole/blob/V1.72.0/cmd/analyze/json.go). Official guidance calls for analyze followed by largest-entry path analysis, interpretation/ranking by recovery cost, and distinct preview totals. The harness now loads that Skill first and supplies bounded redacted evidence, not an alternate Home scanner.

Default audit runs only the four required sources. Analyze categories previously absent from the inline numbered plan are now included. At most two largest allowed physical overview directories receive official analyze path calls within the existing total time budget (30 seconds each maximum). Fixed public directory-use labels and unknown categories preserve privacy; they do not validate file contents. Parent/drilldown/insight overlap is explicit. Home extension census and exact-cache candidate collection are opt-in; optional execution code and managed updater are preserved.

## Purge investigation

After synthetic syscall proof, guarded official V1.72 version/help returned exit 0. Actual guarded dry-run returned exit 1, with observed `shell_temporary_file_denied`, `operation_not_permitted`, `storage_exhausted` markers. A second guarded diagnostic probe extracted only known public upstream file/line sites: log.sh:88; project.sh:805,1189,1441,1449. Raw output stayed in local temporary streams and was not published.

[log.sh](https://github.com/tw93/Mole/blob/V1.72.0/lib/core/log.sh) line 88 appends the operations log; [project.sh](https://github.com/tw93/Mole/blob/V1.72.0/lib/clean/project.sh) line 805 uses a here-string for process observations and the other sites publish/reset intermediate scan files. These observations establish incompatibility in this protected run, not the precise cause on Jim's MacBook. The storage marker is text, **not proof of disk exhaustion**. Version/help success is not preview success. No safe repair was established without changing the write boundary; no relaxation or host config/log write was made. Purge remains FAILED/unknown when this occurs; other sources continue. No candidate files were deleted.

The existing boundary still rejects host cache overwrite/unlink/rename/create, symlink escape and child writes. It permits private scratch/heredoc fallback and only the exact synthetic clean-preview exception. Initial proof inside the outer agent sandbox could not initialize nested sandbox; the supported scoped approval ran the identical proof successfully. This is not setup advice to disable sandbox.

## Checks and limitations

- 206 local tests PASS with both native fixture opt-ins enabled, none skipped; prior updater/precise-execution tests retained.
- Actual skill-creator `quick_validate.py`: `Skill is valid!` (structure only, not behavior proof).
- Synthetic runtime boundary proof PASS; no Mole invoked by that proof.
- No remote CI, installation/update of host packages/Skills, real cleanup, new permissions or security/config changes.
- Models/evaluation and final exact-head review are recorded below when complete. Synthetic source observations do not establish live MacBook usefulness or full four-source success.

Real acceptance still pending: useful same-short-prompt Luna result on Jim's MacBook, successful guarded purge scope if supported, genuine missing-CLI installation and Intel/macOS12 compatibility. Do not claim universal model parity, full disk coverage or reclaimed space.

## Same-source model reporting comparison

Fresh independent agents used the exact same short Chinese request and shared [synthetic observations](../evals/fixtures/mole-first.shared.synthetic.json), on this Mac Studio: official Mole baseline with **gpt-6-luna xhigh**, baseline with **gpt-6.1-sol medium**, and official Mole + harness with **gpt-6-luna xhigh**. The agent interface exposes model/reasoning, not Fast-mode selection; Fast was not reproduced or claimed. Raw evaluation transcripts remain local.

All three preserved synthetic provenance, no cleanup, worktree11/observed17GB/workspace UNKNOWN, overlap and purge failure. Harness Luna returned a numbered inline table with 90/40/30/20/6GB occupied evidence, 7.14GB preview and 6.399GB developer-cache estimate, independent count/byte coverage, and purge audit/exit1 markers. Sol also produced useful interpretation; baseline Luna used fewer aggregate rows. This limited case does **not** prove that the harness outperforms the baseline or achieves model parity. Baselines were deliberately given the same inventory observation, so this tests reporting rather than unaided root discovery. Deterministic source invocation/root coverage is tested separately.

The first trial accidentally used a purge-style clean-summary string; the adapter correctly returned FAILED. That fixture was corrected to the official clean summary shape and all three trials rerun with fresh agents. No intended answer or prior findings were supplied. The harness command was a fixed observation stub with the real renderer output, not a live scan. See [sanitized checks](mole-first-model-comparison.synthetic.json) and [sample renderer artifact](mole-first.sample.synthetic.zh.md).

## Independent review and final verification

Initial independent Astra-low review of `7a14f03` found an unavailable-only category falsely displayed as zero and a whitespace defect. Corrected overview/drilldown rows retain UNKNOWN with per-row completeness/unknown counts; source total and detailed rendering also preserve unknown when no entry was measured. Added a regression. 206/206 native-enabled tests pass, none skipped; actual validator and full-branch whitespace pass. Official digest-verified1.72 adapter on the existing synthetic8KiB directory returns COMPLETE/8192B/one file with no host writes allowed; this is not full-host coverage.

Final exact-head review and merge readback are recorded in PR #77. Real MacBook acceptance remains pending; #70 stays open.
