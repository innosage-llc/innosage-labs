# Copy/paste task: GitHub issue → reviewable PR

**Before sending:** replace all five bracketed placeholders and confirm the target repository's local instructions. This file is a template; it does not execute by itself.

---

## Assignment

Implement the GitHub issue below in the authorized checkout, verify the work using the repository's actual checks, and open a pull request linked to the issue.

- **Repository:** `[OWNER/REPO]`
- **GitHub issue:** `[ISSUE_URL]`
- **Issue number (in this repository):** `[ISSUE_NUMBER]`
- **Base branch:** `[BASE_BRANCH]`
- **Relevant verification commands:** `[VERIFICATION_COMMANDS]`

## Required sequence

1. Read the live issue, applicable repo-local instructions (including `AGENTS.md` if present), and nearby source/tests. Confirm the request's acceptance criteria, scope, risk and non-goals. Use real file evidence, not guesses.
2. Work only on a dedicated issue branch from the authorized base, or reuse its existing intended branch. Do not modify the base branch directly or discard unrelated changes.
3. Implement the smallest complete change. If requirements conflict or the task demands unapproved security/auth, production, data migration or permission changes, stop and report the question before modifying those areas.
4. Execute the applicable **local** repository verification commands. Record each command and its **observed** outcome. Report failures/skips, not invented successes; don't install privileged dependencies or bypass tests to force a green result.
5. Inspect the diff for unrelated edits, private data, leaked credentials, sensitive URLs, unlicensed content and inadvertent behavior changes.
6. Commit and push the authorized branch; create a PR against `[BASE_BRANCH]` with **`Closes #[ISSUE_NUMBER]`** after replacing that placeholder with the actual issue number in `[OWNER/REPO]`. If incomplete, use `Related to #[ISSUE_NUMBER]` and explain what remains.
7. Leave the PR **open and unmerged** for human review. Never deploy or change repository permissions without separate authorization.

## PR body

### Summary
- What changed, and how this satisfies the issue

### Issue linkage
Closes #[ISSUE_NUMBER]

### Changes
- Key files and rationale

### Verification
- `command`: PASS / FAIL / NOT RUN — observed result or reason
- Distinguish local checks from remote CI; report remote CI only if actually inspected

### Manual check for a reviewer
- Exact steps from the user's journey
- Screenshots/video only if a UI-facing change warrants them and the evidence exists

### Risk / rollback
- Scope, known limitations, and safe revert approach

## Finish condition

Return the actual PR URL, issue reference, changed-file summary, and verification evidence. If blocked by permissions, missing tools, ambiguous requirements, or failing checks, return the exact blocker and don't claim the task is complete.

---

[Read the workflow and limitations](README.md)
