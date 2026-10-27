# Issue → PR: a reusable coding-agent handoff

A **portable Markdown workflow** for handing an issue to a coding agent and getting back a reviewable pull request with honest verification evidence.

**What this is:** a checklist and [copy/paste agent prompt](PROMPT.md), generalized from real engineering operating practices.

**What it is not:** a running GitHub Action, a Codex plugin, a published agent skill, or a claim that any given agent has already passed your repo's checks. You supply the repo, issue, permissions and verification commands.

## When to use it

Use this for one bounded bug, feature, refactor or docs task with a GitHub issue. If the issue is ambiguous, safety-sensitive, or crosses multiple systems, clarify the scope and review the plan **before** giving an agent write access.

### Prerequisites

- A repository and issue you are authorized to work on.
- An agent/runtime with repository access, a Git checkout, and (for PR creation) write permission.
- The correct base branch, repo-local rules (such as `AGENTS.md`) and relevant test commands.
- A human available to review changes and decide whether to merge.

No InnoSage-specific scripts, servers, or accounts are required.

## Five-minute start

1. Write a bounded issue: describe the observed problem, desired behavior, acceptance criteria, non-goals, and relevant evidence.
2. Open [PROMPT.md](PROMPT.md) and replace its placeholders: `REPOSITORY`, `ISSUE_URL`, `BASE_BRANCH`, `VERIFICATION_COMMANDS`. Do **not** leave placeholders in the agent task.
3. Send the filled-in prompt to your coding agent while it is working in the intended repository.
4. Require a branch-scoped diff, observed verification results, and a PR explicitly linked to the issue.
5. Review the PR and evidence; **a human makes the merge decision**.

## Execution contract

| Stage | Minimum expected result | Do not do |
| --- | --- | --- |
| **Scope** | Read the issue and repo instructions; identify files/tests and blockers | Infer unspecified requirements or broaden scope silently |
| **Branch** | Work on a dedicated issue branch from the authorized base (reuse the existing intended branch if present) | Commit directly to `main` or overwrite another branch |
| **Implement** | Make the smallest change satisfying the issue; note deviations | Refactor unrelated systems or expose private files |
| **Verify** | Run repo-prescribed relevant commands; report the exact commands and observed pass/fail/skipped state | Claim tests or CI passed without evidence |
| **Handoff** | Push the authorized branch and open a PR with `Closes #N` for that repository's issue | Merge, deploy, or change permissions without permission |

If the PR is partial, use **`Related to #N`** rather than claiming it closes the issue.

## Verification evidence

An honest PR should answer:

- **What changed?** Short list of affected files and reasons.
- **What ran?** Exact commands plus observed outcomes (including failures).
- **What was skipped?** Tests, manual checks, CI, or environments not available, with reasons.
- **What remains?** Known limitations, risk, rollback concerns, and manual checks for a reviewer.

Do not automatically install privileged infrastructure, download Docker, add credentials, or bypass security checks to make a command appear to pass. Stop and report the blocker instead.

## Fail safely

Stop and ask the owner if any of these happens:

- The repo/issue, target branch, or authorized worktree is ambiguous.
- Repo instructions conflict with this template or require approval.
- The task touches secrets, authentication, privacy-sensitive content, production deployment, or destructive migrations outside the approved scope.
- Tests fail, required tooling is unavailable, or PR creation is blocked.

Never mark a blocked handoff as successfully verified.

## Illustrative outcome (not an executed test)

For a hypothetical `example-org/widget` issue `#42`, a successful handoff could produce:

- Branch: `docs/issue-42-widget-guide`
- PR summary: which Markdown files changed and why
- Verification: `npm run lint` — **only if actually run**; otherwise explicitly `Not run`
- PR body: `Closes #42` plus remaining review steps
- State: **open, unmerged**, awaiting review

The exact branch name, checks and tooling must follow the **target repository**, not this example.

## License and attribution

This workflow is an original, generalized public template maintained in [InnoSage Labs](https://github.com/innosage-llc/innosage-labs) under the repository's MIT license. It does not reproduce private implementation scripts or internal deployment configuration. Adapt it to your project and verify the result in your own environment.
