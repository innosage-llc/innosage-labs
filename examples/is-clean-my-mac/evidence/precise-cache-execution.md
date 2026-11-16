# Narrow selected-row execution — 2026-11-16

Status: implementation and synthetic execution evidence; **real MacBook acceptance pending**. This supersedes the production-executor limitation in the historical file-type/row report. The owner explicitly expanded the former Mole-only boundary to permit an independently reviewed, tightly scoped adapter. That authorizes implementation/testing, not deletion of the owner's files. Issue #70 stays open.

## Delivered scope

One row binds one existing ordinary file in either the fixed default Homebrew bottle-download layout or pip HTTP-v2 body layout. The adapter uses system file APIs; it does not invoke Mole removal, TUI, private functions, whitelist rewriting or broad cleanup. Unsupported rows stay blocked/manual. Entire worktrees and Trash remain excluded.

Public plan/hash/expiry and private manifest/digest bind category, UUID, physical identity, allocation, age, permissions, ancestor chain and pip companion metadata. Owner consent is required for the same current plan/rows; an installer approval is insufficient. Read-only preflight precedes the separate CLI stdin acknowledgement and a fresh bounded apply worker. A token confirms actual approval; software cannot create that authority.

Native exclusive capture, repeated FD/name/ancestor/ACL/companion checks, bounded system lsof observation and exact unlink preserve unselected objects. Failure restores exclusively or retains a private recovery hold. Durable manifests/events and row mapping live outside caches/temp in Application Support. Successful deletion has no automatic backup. A crash/timeout does not establish that nothing changed; inspect recovery before any further request. See the [execution contract](../.agents/skills/is-clean-my-mac/references/precise-execution.md).

Protection is deliberately conservative: any fixed Mole whitelist file or unverifiable protection state makes precise objects manual, without reading/changing that configuration. Git ancestors, including a Home directory that is itself a repository, block execution. The development host has this condition; no real host cache collection/cleanup was used to manufacture acceptance.

## Verification provenance

Host: Apple Silicon macOS, Python 3.9; engineering/review GPT-6.1 Sol Medium. Existing Mole 1.54.0 and installed Skills/packages were preserved; temporary official 1.72.0 source/binary from earlier read-only boundary work was not installed. No remote CI was run or enabled.

Local suite uses disposable, test-owned fixture homes under physical system TMPDIR. It covers public/private binding, exact selected rows, mixed blocked rows, expiry/replay, identity/permission/ACL/ancestor drift, metadata drift at final unlink intent, overlapping/duplicate scopes, protected configuration appearing after capture, unselected objects/Trash, BUSY/UNKNOWN visibility, failures after removal, torn journals and subprocess crashes at five transitions. No cache contents are read by production code.

Native opt-in tests run real renameatx_np/ACL/unlink/lsof/statvfs, including complete CLI preflight/acknowledgement/apply workers and a real second process holding a selected-but-busy approved object open. Only the account-home resolver is substituted to a fixture in child processes; production confirmation, selection and mutation controls remain intact. Synthetic API tests inject CLEAR where appropriate and do not claim real lsof coverage.

Commands:

```sh
IS_CLEAN_RUN_NATIVE_LSOF_FIXTURE=1 IS_CLEAN_RUN_NATIVE_EXECUTION_FIXTURE=1 python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -q
python3 -B <local-skill-creator>/scripts/quick_validate.py examples/is-clean-my-mac/.agents/skills/is-clean-my-mac
python3 -B examples/is-clean-my-mac/tests/check_runtime_boundary.py
git diff --check
```

The synthetic Mole runtime proof passed with host-approved execution of this exact test after the outer shell denied nested sandbox initialization. Both scratch-only and precise-clean-preview modes denied fixture overwrite/create/unlink/rename/symlink escape/child mutation, preserved synthetic analyzer cache and removed inherited overrides. Only the exact preview exception was allowed. No Mole scan/cleanup or real user file was targeted.

Latest local result: **158/158 tests PASS**, including all three native opt-in tests (none skipped), actual skill-creator validator PASS, synthetic runtime-boundary proof PASS, whitespace PASS. Final exact-head review and rerun are recorded in the PR.

Actual skill-creator instructions used: concise discriminating discovery, progressive detail in references, deterministic scripts for fragile operations, running changed scripts, meaningful invariant tests, `quick_validate.py`, and independent forward testing for risky workflows. The validator passed; it checks skill structure, not deletion safety. This updates an existing Skill, so it was not reinitialized. Independent code reviewers cross-cover components they did not author; final head/review results are recorded in the PR.

## Two-call Luna forward evaluation

Exactly two `gpt-6-luna` **Medium** ephemeral calls, isolated fixture project, unchanged short Chinese audit prompt. Type census, precise collection/manifest, rendering, plan gate, confirmation, workers and native execution were real. Four upstream audit observations were synthetic mocks; the account-home resolver pointed only to the fixture. No model parity or xhigh/Fast claim.

1. Audit exited 0; all three original fixture cache inodes/sizes and fixture Trash remained unchanged. The conversation included numbered actionable objects/bytes/permanent-removal risks, file types, workspace/worktree counts and purge failure detail.
2. A second ephemeral session received the same public CURRENT_PLAN/full plan ID and explicit fixture-owner approval for rows 1,2. It performed read-only preflight and the actual CLI acknowledgement/apply. Both selected rows succeeded: original allocated bytes 24,576 + 16,384 = **40,960 B**. Row 3 retained its original inode/bytes and Trash stayed intact. `actual_freed_bytes` remained null; observed free-space change is not attributable release.

Privacy checks: zero private artifact read commands, no private candidate names in responses. Limitations: the first response omitted an explicit synthetic disclaimer; the second attempted one nonexistent host-installed Skill read before using the copied Skill (no contents obtained). These are two public-plan continuation sessions, not full-chat resume or strict zero out-of-fixture read attempts. Raw evaluation logs/paths remain local and are not committed.

## Source conventions and limits

- [Homebrew 5.0 download strategy](https://github.com/Homebrew/brew/blob/5.0.0/Library/Homebrew/download_strategy.rb) and [bottle naming](https://github.com/Homebrew/brew/blob/5.0.0/Library/Homebrew/bottle.rb).
- [pip 26.0 HTTP cache](https://github.com/pypa/pip/blob/26.0/src/pip/_internal/network/cache.py), [CacheControl separate body cache](https://github.com/pypa/pip/blob/26.0/src/pip/_vendor/cachecontrol/caches/file_cache.py), and [pip caching cautions](https://pip.pypa.io/en/stable/topics/caching/).
- [Mole 1.72 official Skill](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/SKILL.md) and [macOS subset constraints](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/references/macos.md).

Filename/layout recognition is not proof of contents, dispensability or future download availability. Unknown/custom formats are excluded. Age is an additional stability condition, not a reason to delete. lsof observes visible opens, not future exclusivity; bounded ordinary-concurrency revalidation is not hostile same-UID isolation or tested power-loss consistency. statvfs before/after is measured after own file descriptors close, but APFS sharing, open references, delay and concurrent activity prevent exact attribution; removed original allocation is reported separately.

Not run: real MacBook/user-cache deletion, real full-host cleanup, clean-environment missing-CLI Homebrew install, Intel/macOS12 compatibility, Luna xhigh/Fast retest, universal model comparison, power-loss/hostile-process proof. A complete four-source real audit still depends on installed-version guarded upstream behavior; failures remain explicit rather than weakening the boundary. The user verification route is [MACBOOK-VERIFY.md](../MACBOOK-VERIFY.md), without an internal synthetic checklist.
