# Verification record — 2026-11-16

Status: **DRAFT / ACCEPTANCE BLOCKED / NO REAL CLEANUP**. Passing unit tests or a completed model turn is not completion of issue #70. Do not merge until the outstanding material gates below pass.

## Actual host and dependencies

Apple Silicon arm64, macOS 26.6.2, Codex CLI 0.163.0, Node 26.13.0, Homebrew 7.0.13, Python 3.9. Existing Homebrew Mole **1.54.0** was preserved; no CLI upgrade/install occurred. Official Mole Skill fetched separately from `tw93/Mole@V1.72.0` through `skills@1.8.1`. No upstream Skill/source is committed here.

Read before implementation: complete issue #70, root README, CONTRIBUTING, examples index, existing project-first example, official Mole installation/Skill/macOS reference, Skills CLI command/agent-path documentation. No applicable AGENTS.md or repository-owned `.agents/skills` policy was present in this new checkout or its checked local parents. The existing example's Skill is an artifact, not repository policy.

Applied Codex **skill-creator** from its actual installed `SKILL.md`: concise Chinese routing, progressive disclosure into references, deterministic scripts for fragile audit behavior, script execution, structural `quick_validate.py`, meaningful behavioral invariants, independent forward-testing. Structural validation reported `Skill is valid!`; it is not evidence of safe runtime decisions by itself.

## Executed checks

| Check | Result | Provenance / limits |
| --- | --- | --- |
| Python unit suite | PASS, 21 tests at latest recorded run | `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v` |
| Skill structure | PASS | Actual `skill-creator/scripts/quick_validate.py` against this Skill |
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
| Independent code review | Changes requested, fixes applied; final pinned review pending | Reviewer reproduced a path/symlink race, depth-1 false completeness and unbounded pre-worker path checks; fixes include fd traversal, conservative layout and bounded worker validation |
| Diff whitespace | PASS at latest recorded run | `git diff --check` |

## Model comparison provenance

An initial actual local CLI comparison ran three identical synthetic cases in each of two isolated projects: official Mole Skill only, versus the same Skill plus wrapper/helper. Models requested and accepted with exit 0: `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`, all `model_reasoning_effort=medium`, ephemeral sessions, read-only sandbox. Each session processed all three cases from `evals/evals.json`; prompts also contained the synthetic-harness constraints, so this is **not proof of a normal one-line real-Mac workflow**.

All three initial wrappers independently reported 1 worktree / 12,288 allocated bytes (normal), 1 / 8,392,704 (large fixture), and verified ABSENT / 0 / 0. Baselines reported unknown worktree count/size. Every final response kept actual freed bytes unknown and reported no mutations. Command-event logs recorded helper use in all three wrapper sessions and none in the baseline sessions. These observations show incremental value in these controlled cases, not universal model parity.

Initial comparisons used a pre-review snapshot. A repeat using corrected source is recorded separately when complete. Raw CLI event logs remain local and are not committed. Reproduce with `evals/run-model-comparison.py --workspace <empty external directory> --mole-skill <verified official Skill directory> --run-models`; omit the last flag for fixture preparation only. `--run-models` explicitly launches six model sessions and may incur usage. No Homebrew/Skill installations or actual Mole commands run in that harness. It retains fixtures/logs for inspection.

## Exact outstanding acceptance gates

1. **Real four-source read-only Mac workflow is BLOCKED.** Installed Mole 1.54.0 `bin/purge.sh` sources `lib/clean/project.sh` before argument dispatch; that module calls `load_purge_config`, and empty/no usable configured roots may trigger `save_discovered_paths` → `write_purge_config`. Therefore even `purge --help` is not a verified no-configuration-write preflight. The adapter stops before any purge help/preview invocation, with `purge_configuration_write_boundary_unverified`. The 1.72.0 no-config-write execution boundary is unverified too. No configuration was changed to obtain an acceptance result. A proven immutable-config execution boundary or supported upstream behavior is required to unblock this test.
2. **Actual clean-environment missing-CLI installation is NOT RUN.** Real tests used empty temporary Skill directories but preserved the already installed Mole CLI. The `brew install mole` branch has only mocked coverage. No second Homebrew installation or host package removal was attempted.
3. **Fresh one-line real-Mac workflow and final installed-version candidate scope remain NOT VERIFIED.** Fresh-session Skill discovery and synthetic comparisons passed; clean/purge actual user-data previews and real user worktree roots were not scanned. Preview summaries lack per-candidate scope/overlap evidence, so they cannot authorize exact execution.
4. **No merge or closeout yet.** A draft PR may be reviewed, but the missing material gates cannot be replaced with unit tests or stronger model reasoning. Issue #70 must remain open until those gates pass. No deployment or social publication is authorized by this artifact.

No real user data was deleted, moved, renamed or cleaned; Trash untouched; no worktree removal/pruning, system permission change, Full Disk Access grant or Mole configuration mutation. Temporary installation/evaluation fixtures were created only for this task. No guarantee is made about unobserved host activity.
