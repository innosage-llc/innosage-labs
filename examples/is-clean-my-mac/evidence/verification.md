# Verification record — 2026-11-16

Status: **GUARDED IMPLEMENTATION / USER MACBOOK ACCEPTANCE PENDING / NO REAL CLEANUP**. The user explicitly approved merging the reviewed safe implementation before their MacBook installation/behavior checks. Implementation tests and independent code review gate the merge; real acceptance is tracked separately and remains incomplete. Issue #70 stays open. This sequence change does not waive the purge safety stop or establish complete four-source capability.

## Actual host and dependencies

Apple Silicon arm64, macOS 26.6.2, Codex CLI 0.163.0, Node 26.13.0, Homebrew 7.0.13, Python 3.9. Existing Homebrew Mole **1.54.0** was preserved; no CLI upgrade/install occurred. Official Mole Skill fetched separately from `tw93/Mole@V1.72.0` through `skills@1.8.1`. No upstream Skill/source is committed here.

Read before implementation: complete issue #70, root README, CONTRIBUTING, examples index, existing project-first example, official Mole installation/Skill/macOS reference, Skills CLI command/agent-path documentation. No applicable AGENTS.md or repository-owned `.agents/skills` policy was present in this new checkout or its checked local parents. The existing example's Skill is an artifact, not repository policy.

Applied Codex **skill-creator** from its actual installed `SKILL.md`: concise Chinese routing, progressive disclosure into references, deterministic scripts for fragile audit behavior, script execution, structural `quick_validate.py`, meaningful behavioral invariants, independent forward-testing. Structural validation reported `Skill is valid!`; it is not evidence of safe runtime decisions by itself.

## Executed checks

| Check | Result | Provenance / limits |
| --- | --- | --- |
| Python unit suite | PASS, 27 tests for agent-install follow-up; earlier heads had 22/23 | `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v` |
| Skill structure | PASS | Actual `skill-creator/scripts/quick_validate.py` against this Skill |
| Skills CLI direct nested-path install | PASS | Actual `skills@1.8.1 add <canonical nested Skill directory> -a codex -g -y --copy` into isolated temporary HOME; see `direct-path-install.json` |
| Shell entrypoint / installer preflight | PASS | Inspectable `sh install.sh --plan`; no writes/scans from plan |
| Independent allocated-size check | PASS | Synthetic multi-worktree inode aggregation equals platform `du -sk` measurement |
| No content/mtime/ctime/mode change | PASS for explicit synthetic snapshot assertions | Snapshot checks on normal, duplicate/symlink and raced/unknown fixtures; this is not a full host audit |
| Permission denial | PASS, simulated | Injected PermissionError, not an OS-wide permission experiment |
| Timeout/budget/absent/custom/default roots | PASS, synthetic | null for unknown/partial; verified absent is distinct zero |
| Symlink swap boundary | PASS regression | Descriptor traversal with O_NOFOLLOW; synthetic directory swap does not scan external fixture payload |
| Installer denial/idempotence/conflicts | PASS, simulated | Mocked upstream Skill/commands; no mock represents real upstream code |
| Real isolated Skill installation | PASS, two separate clean Skill targets | Actual pinned official Skills CLI fetched Mole Skill; wrapper files copied and hashes recorded; existing Mole CLI preserved |
| Fresh-session discovery | PASS, initial installation snapshot | Actual ephemeral `codex exec -m gpt-6.1-sol -c model_reasoning_effort="medium" -s read-only`; both discovered booleans true; no tools in that session |
| Real Mole analysis on synthetic directory | PASS with honest PARTIAL | Actual `mo analyze --json <synthetic root>` through local adapter; 8192 bytes/1 file; raw path not published. See `real-mole-synthetic-analysis.json` |
| Mole 1.72 schema | PASS synthetic only | Official V1.72.0 macOS reference + synthetic fixture; no real 1.72 CLI installed or executed |
| Independent forward behavior | PASS within synthetic scope | Separate requested Sol Medium agent read Skill/references, parsed supplied synthetic observations, ran helper, protected unknowns and overlap; no actual Mole commands |
| Independent code review | PASS historical pinned reviews; final implementation review required for current head | Reviewer reproduced a path/symlink race, depth-1 false completeness, unbounded pre-worker path checks and discarded PARTIAL worker output; all corrected. Historical reviews found no substantive code findings; the old acceptance-before-merge disposition is superseded by the user-approved sequence |
| Diff whitespace | PASS at latest recorded run | `git diff --check` |

## Model comparison provenance

An initial actual local CLI comparison ran three identical synthetic cases in each of two isolated projects: official Mole Skill only, versus the same Skill plus wrapper/helper. Models requested and accepted with exit 0: `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`, all `model_reasoning_effort=medium`, ephemeral sessions, read-only sandbox. Each session processed all three cases from `evals/evals.json`; prompts also contained the synthetic-harness constraints, so this is **not proof of a normal one-line real-Mac workflow**.

All three initial wrappers independently reported 1 worktree / 12,288 allocated bytes (normal), 1 / 8,392,704 (large fixture), and verified ABSENT / 0 / 0. Baselines reported unknown worktree count/size. All initial wrapper responses kept actual freed bytes unknown; initial baselines reported 0 without measurement. All sessions reported no mutations. Command-event logs recorded helper use in all three wrapper sessions and none in the baseline sessions. These observations show incremental value in these controlled cases, not universal model parity.

Initial comparisons used a pre-review snapshot. A repeat after the traversal corrections also completed: six actual CLI sessions, exit 0, the same three cases each. See `model-comparison.synthetic.json` for sanitized actual results, evaluated code commit/helper hash and limits. This repeat preceded the final worker-protocol correction at f6ae8f2; that correction is covered by a subprocess regression, so these sessions are not falsely labeled final-head behavioral acceptance. The repeated Luna wrapper reported unmeasured actual freed as 0 in all three cases, violating the UNKNOWN/null reporting invariant. This is a **FAILED reporting assertion**, not measured reclaimed space. Historical values are labeled model-reported in the JSON; baseline 0 values are likewise unmeasured. The Skill now explicitly preserves null and the helper carries null for actual freed. Targeted re-evaluation is recorded separately. Raw CLI event logs remain local and are not committed. Reproduce with `evals/run-model-comparison.py --workspace <empty external directory> --mole-skill <verified official Skill directory> --run-models`; omit the last flag for fixture preparation only. `--run-models` explicitly launches six model sessions and may incur usage. No Homebrew/Skill installations or actual Mole commands run in that harness. It retains fixtures/logs for inspection.

## Exact outstanding acceptance gates

The independent reviewer re-reviewed pinned `f6ae8f22a1b4d63ff1af46f4fa63e57c88e1fb99`, found no remaining substantive code issues, and independently ran all 22 tests, structural validation and whitespace checks. It withheld merge approval under the earlier acceptance-before-merge sequence. That historical disposition is retained as provenance; the user has since authorized implementation merge after final code review while acceptance remains pending.

1. **Real four-source read-only Mac workflow is BLOCKED.** Installed Mole 1.54.0 `bin/purge.sh` sources `lib/clean/project.sh` before argument dispatch; that module calls `load_purge_config`, and empty/no usable configured roots may trigger `save_discovered_paths` → `write_purge_config`. Therefore even `purge --help` is not a verified no-configuration-write preflight. The adapter stops before any purge help/preview invocation, with `purge_configuration_write_boundary_unverified`. The 1.72.0 no-config-write execution boundary is unverified too. No configuration was changed to obtain an acceptance result. A proven immutable-config execution boundary or supported upstream behavior is required to unblock this test. A local system sandbox experiment denied a write to a synthetic protected configuration file without changing it; actual configured purge roots could not be verified, and this experiment did not establish full safe Mole behavior. No experimental fence was shipped or represented as acceptance.
2. **Actual clean-environment missing-CLI installation is NOT RUN.** Real tests used empty temporary Skill directories but preserved the already installed Mole CLI. The `brew install mole` branch has only mocked coverage. No second Homebrew installation or host package removal was attempted.
3. **Fresh one-line real-Mac workflow and final installed-version candidate scope remain NOT VERIFIED.** Fresh-session Skill discovery and synthetic comparisons passed; clean/purge actual user-data previews and real user worktree roots were not scanned. Preview summaries lack per-candidate scope/overlap evidence, so they cannot authorize exact execution.
4. **Implementation delivery is separate from acceptance closeout.** The user will test on their MacBook after the reviewed guarded implementation reaches main. Missing-CLI installation is deferred to that verification when Mole is genuinely absent; if it is already installed, that branch remains unverified without removing it. Complete four-source capability still needs further product work on the purge boundary, and is not made available merely by testing another Mac. Keep issue #70 open; do not mark the acceptance DoD complete. No deployment, CI activation, VM setup or social publication is included.

No real user data was deleted, moved, renamed or cleaned; Trash untouched; no worktree removal/pruning, system permission change, Full Disk Access grant or Mole configuration mutation. Temporary installation/evaluation fixtures were created only for this task. No guarantee is made about unobserved host activity.

## Targeted reporting regression

After the repeated Luna wrapper reported unmeasured actual freed as 0, commit `f510abc` added explicit audit-only null output to the helper and a narrow Skill instruction to preserve it. An actual Luna Medium baseline/wrapper pair re-ran all three synthetic cases; both sessions exited 0. The wrapper unknown-freed reporting assertion PASSED in this run. See `luna-reporting-regression.synthetic.json`; this does not erase the earlier failed assertion or establish universal model parity. No real Mole command or cleanup was part of the comparison.

The targeted Luna baseline also returned the same synthetic counts/sizes, while still reporting unmeasured freed space as 0. The initial baseline omission is an observation of those runs, not evidence that the official Skill can never produce worktree measurements. The wrapper supplies an explicit deterministic inventory surface; these harness prompts request structured fields and do not replace the still-unverified short-request real-Mac acceptance.

## Follow-up parser correction

Static purge-boundary research also found an adapter unit error: Mole's official
`bytes_to_human` formatter uses SI decimal display units (KB=1000 bytes), while
this prototype initially converted summaries with powers of 1024. The adapter
now uses Decimal and powers of 1000; focused tests cover B/KB/MB/GB and reject
unknown MiB syntax. The synthetic 1.00MB preview fixture means approximately
1,000,000 bytes, not 1,048,576. Earlier model/forward-test observations used the
old parser and are historical observations, not current candidate-byte evidence.
Worktree allocated bytes and analyze JSON bytes are unchanged. No costly model
comparison was repeated for this local arithmetic correction.

Follow-up investigation of supported purge/configuration isolation and clean installation environments is in [acceptance-gate-investigation.md](acceptance-gate-investigation.md). The workflow proposal is inert evidence, not an activated CI job or a claimed acceptance pass.

## User-approved delivery sequence

On 2026-11-16 the user chose their MacBook for post-merge verification and authorized autonomous implementation delivery to main after final checks and independent code review. [MACBOOK-VERIFY.md](../MACBOOK-VERIFY.md) gives the concrete steps and expected stop states. Earlier draft/merge-withheld decisions above describe the history, not a current unconditional merge prohibition. Safe fixture tests and structural validation remain implementation requirements; real installation and full workflow acceptance are not falsely marked passed.

## One-prompt agent installation follow-up

The default user route is now the raw canonical [llms.txt](../llms.txt) URL and a single Chinese prompt. The same installer accepts agent-submitted stdin only after real scoped owner approval; no --yes bypass or second installer was added. [Follow-up evidence](agent-install-entry.md) records 27 tests, actual Skill Creator validation and a two-stage independent synthetic forward test. Real MacBook installation/discovery and complete four-source acceptance remain pending.
