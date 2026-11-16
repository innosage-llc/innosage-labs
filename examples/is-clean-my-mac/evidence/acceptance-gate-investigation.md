# Acceptance-gate investigation — 2026-11-16 follow-up

Status: **not resolved; no host purge/help invocation; no host configuration or package change**. This investigation did not lower issue #70's DoD.

## Purge boundary

Read-only metadata inspection confirmed that this host has no `purge_paths` configuration file. No raw path or configuration content was returned or published.

The installed 1.54.0 code and current upstream were inspected as source only. Upstream `main` and V1.72.0 `lib/clean/project.sh` both resolved to Git blob `541bfef6553a3f32271e87e770cd95d6becc25cf` during this investigation.

- [`bin/purge.sh`](https://github.com/tw93/Mole/blob/V1.72.0/bin/purge.sh) sources the project module before argument parsing. `--help` therefore does not avoid module initialization.
- [`project.sh`](https://github.com/tw93/Mole/blob/V1.72.0/lib/clean/project.sh) hard-codes `PURGE_CONFIG_FILE` under HOME, invokes `load_purge_config` at module load, and saves discovered roots when no usable configured roots exist. The dry-run flag does not guard that save.
- `PURGE_CONFIG_FILE` is assigned readonly, so supplying an environment value does not override it. The management UI's similarly named variable does not replace the project module's path.
- The documented `XDG_CACHE_HOME` and `TMPDIR` behavior affects cache/scratch storage, not this configuration path or its scope. No documented `--config-dir`, `--no-save-discovery`, or equivalent no-config-write mode was found in the inspected official README, Skill/macOS reference or command dispatch.
- Setting the dry-run environment before startup still does not guard the save. `MOLE_SKIP_MAIN` is checked after module loading and is not an isolation route.
- The [official Skill](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/SKILL.md) says not to rerun Mole with a different HOME. A fake HOME, copied/patched Mole module, or replacement function would not be the approved official workflow.
- The logging module also touches log files during initialization. A successful write-denial experiment against one synthetic configuration file does not prove safe execution of Mole's entire process tree.

A macOS sandbox can deny writes, but it does not remap the hard-coded configuration or make a known fixture scan root available. With the host configuration absent, merely denying its save still permits discovery of actual HOME directories. This has not established the requested supported isolated configuration boundary or verified scope. No host purge/help was invoked to experiment with it, and no experimental fence was shipped.

**Technical dependency:** official upstream behavior that loads an explicit runtime configuration/root before discovery and suppresses persistence, or a separately authorized disposable macOS environment with a preconfigured synthetic-only scope. Implementing that feature by modifying/vendoring Mole is outside this example's approved scope. No upstream issue/message was posted.

A separate, explicit approval to create a temporary configuration at the real host path would change the current no-configuration-change boundary; it is not assumed and was not requested as a shortcut. Even that would still require full write/scope verification, so it is not the recommended next action.

## Genuine missing-CLI installation

This Mac already has Homebrew Mole 1.54.0. Hiding `mo` in PATH, substituting brew, or calling brew against an already-installed formula would not be a genuine clean-install acceptance test. Those approaches were not used.

No Tart, UTM, Parallels, VMware, Lima or VirtualBuddy environment/tool was found in the checked installed application/command locations. Docker is installed, but a Linux container is outside the macOS-only supported environment; no container was launched. This is a bounded inventory of the checked locations, not a claim that no remote Mac exists anywhere.

[Homebrew's current support rules](https://docs.brew.sh/Support-Tiers#custom-prefixes) allow compatible custom prefixes only when prefix/Cellar byte lengths fit the defaults. The task's isolated writable directories have longer physical paths; using the shared temporary root itself is not an isolated installation. Creating a new short system prefix or a new local VM would require provisioning/path changes outside this task's boundaries. No second Homebrew was installed.

A [standard GitHub-hosted macOS arm64 VM](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) is a viable proposed clean test environment. The public repository is accessible, but it currently has no workflow for this acceptance test. The CLI credential's read of repository Actions policy returned HTTP 403; this says the policy lookup was denied, not that all Actions execution is disabled. No policy/settings change, credential replacement, workflow activation or denied-operation retry was performed.

**Smallest proposed scope addition:** authorize one temporary, secret-free macOS arm64 Actions job, or provide an already provisioned disposable Mac with Homebrew, Node 22.20+, Python and Codex but no Mole. The reviewable [workflow proposal](proposed-clean-install-workflow.yml.txt) is deliberately outside `.github/workflows` and has not run. It proves only the actual missing-CLI branch, not Founder-Mac purge or a fresh authenticated one-line audit. It aborts if Mole is already present and never uninstalls/upgrades it to manufacture a clean state.

## Current gate disposition

| Gate | Result |
| --- | --- |
| Safe Founder-Mac purge preview with verified roots and no configuration writes | BLOCKED by the upstream/runtime boundary above |
| Genuine missing-CLI Homebrew installation | NOT RUN; needs the proposed disposable environment |
| Fresh one-line real-Mac four-source workflow | NOT VERIFIED; purge dependency remains |
| Existing Mole and user configuration | Preserved |
| PR merge / issue closure | Withheld; draft PR and open issue retained |

## Concrete skill-creator and reviewer provenance

Applied the installed Codex `skill-creator/SKILL.md`: concise routing, progressive disclosure, deterministic scripts for fragile behavior, execution/validation of scripts, meaningful invariant tests and independent forward-testing. The actual built-in validator was executed from `${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py`; it returned `Skill is valid!`. The latest follow-up Python suite contains 23 passing tests, including the upstream SI-unit conversion correction found during this research. No costly model comparison was repeated.

The independent GPT-6.1 Sol Medium reviewer had no substantive findings at `a3add924`; it explicitly withheld merge approval for these material gates. Follow-up changes receive a new pinned review; earlier review is not represented as covering a later head.

## Minimal safe user verification

From the repository root, without invoking a real disk audit or installing anything:

```sh
sh examples/is-clean-my-mac/install.sh --plan
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v
python3 -B examples/is-clean-my-mac/.agents/skills/is-clean-my-mac/scripts/audit-codex-worktrees.py
```

The final command deliberately omits a verified root: expected exit 2, presence UNKNOWN, count/occupied null. It must not search the user's directories or invent zero. An actual installation, full audit or purge acceptance requires the unresolved gates above; these safe checks do not substitute for them.
