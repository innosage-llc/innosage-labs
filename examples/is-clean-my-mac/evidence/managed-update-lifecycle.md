# Managed wrapper update lifecycle — 2026-11-16

Implementation evidence only; real MacBook update/discovery acceptance remains pending and #70 stays open. Engineering changed repository code and disposable fixtures, not installed Skills, packages, historical backups or user caches.

## Upstream comparison

Official Mole [main](https://github.com/tw93/Mole/blob/main/llms.txt) and [V1.72.0](https://github.com/tw93/Mole/blob/V1.72.0/llms.txt) delegate the multi-agent Skill route to `npx skills add tw93/Mole ...`; Mole does not define our permanent wrapper-backup policy. Plugin/extension routes are alternatives with their own lifecycle, not evidence that every route behaves identically. The Mole CLI/Homebrew lifecycle is separate.

The exact Skills CLI version pinned by our installer is **1.8.1**. Its [installer](https://github.com/vercel-labs/skills/blob/v1.8.1/src/installer.ts#L180) `cleanAndCreateDirectory` removes/recreates the destination to clear obsolete files. Both copy and canonical modes call it. Its [update implementation](https://github.com/vercel-labs/skills/blob/v1.8.1/src/update.ts#L899) fetches and reinstalls through the installer, then updates the lock. These inspected replacement paths do not retain permanent old Skill directories. This is tagged-source evidence, not a claim about an unknown user's installed npx version or every plugin manager. No upstream installer was run against a host installation for this investigation.

Our prior code instead renamed each receipt-verified old wrapper to a permanent UUID sibling backup. Those existing backups are user-owned historical artifacts. The new installer does not enumerate, migrate, delete or offer to auto-purge them.

## Chosen change

One active managed wrapper after success. A single private, non-discoverable `.is-clean-my-mac-update` transaction holds a staged new copy, old rollback copy, owned lock and durable old/new receipt manifests. The exact install plan discloses replacement, receipt/recovery writes and retirement of only this transaction's unchanged managed copy. INSTALL must follow real scoped owner approval.

The update revalidates source hashes, receipt, owned ordinary files, target ancestor identity and permissions. Exclusive native same-volume rename refuses even an empty newly created destination. The complete transaction/recovery holds a nonblocking lock. After activation, the active tree and committed receipt must match before the verified old transaction copy is retired. No `rmtree`, arbitrary recursive deletion, user-data cleaner or historical-backup cleanup is used; only manifest-listed matching ordinary files are unlinked, then empty known directories removed. An extra file/directory, changed bytes, hardlink, symlink, unsafe ownership/permissions, changed target ancestry or receipt stops and preserves remaining data.

Before receipt commit, `--recover-update --plan` proposes rollback; after verified commit it proposes finishing retirement. Recovery requires separate plan disclosure/INSTALL consent, revalidates under the lock and runs no package commands. Matching partial staged/retiring subsets can be reconciled; unknown partial contents stay preserved for diagnosis. Empty/lock-only transaction markers require a verified active managed tree/receipt and explicit recovery consent before marker removal. Normal installation refuses pending state rather than retrying blindly. A successful update does not promise an indefinitely retained older release or automatic downgrade.

The wrapper source is canonical/reproducible code whose installed bytes are receipt-verified. Local modifications/unknown origins are not treated as reproducible managed data. No local edits are silently thrown away. Genuine cache-cleanup recovery under Application Support is a separate capability and unchanged.

## Verification

Mac Studio, Python3.9, GPT-6.1 Sol Medium implementation/review; no remote CI. Full native-enabled local suite: **199/199 PASS, none skipped** before final review. Actual skill-creator quick_validate and final-head review results are recorded in the PR. Skill Creator guidance used: preserve narrow user intent, deterministic scripts for fragile updates, execute changed scripts, meaningful invariant tests and progressive instructions in the canonical llms entry. No Skill reinitialization or costly cross-model comparison was needed for this installer-only change.

Tests include:

- repeated successful updates produce one active version and no new permanent backup, clear obsolete files and preserve historical backup bytes;
- plan/decline/EOF and missing prerequisite branches, modified/unknown source rejection and preservation of Mole CLI/official Skill;
- every named transaction transition interrupted, plus real fixture subprocess `os._exit(73)` at five transitions and successful locked recovery;
- partial staging, partial retirement, rollback retirement, receipt failure/drift, conflicting/new empty destination and local edits before capture/retirement;
- direct and higher-ancestor symlink swaps toward matching external fixtures, hardlinks/extra entries, overlapping recovery locks and empty-marker recovery;
- all existing exact-row/cache-recovery/audit/privacy tests, including four native opt-ins, remain enabled.

All installation/package commands are mocked in installer tests. Native directory renames, transaction file operations, process interruption and recovery are real, limited to test-owned temporary trees. Nothing in these tests authorizes deleting a user's backup or installed artifact. A matching subset means all remaining names/bytes are verified; malformed/unknown partial copies intentionally need diagnosis rather than speculative cleanup.

Limits: not a hostile same-UID isolation or hardware power-loss proof; ordinary bounded revalidation still has concurrent-change windows. Full missing-CLI Homebrew installation, actual MacBook update/fresh discovery and Intel/macOS12 compatibility are not tested here. Failures preserve diagnostic/recovery state and may require a precise owner decision; do not manually purge it or broaden permissions.

## User route

The Agent owns update and any necessary recovery, not a manual checklist for the owner:

> 请阅读 https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt 并替我更新 is-clean-my-mac，先说明具体计划并获得我的同意，不要扫描或清理磁盘。

After consent and a verified update, start a fresh Codex session. Expect one current wrapper; no additional permanent backup from this update. Existing historical backups remain unchanged. The original short audit prompt is unchanged; this installation check does not authorize a disk scan or cleanup by itself.
