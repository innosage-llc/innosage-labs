# One-prompt agent installation follow-up — 2026-11-16

The user requested Mole-style agent installation rather than personally executing the manual verification checklist. The canonical route is now `examples/is-clean-my-mac/llms.txt`, with a prominent Chinese prompt containing its raw main URL. README and MacBook guidance lead with that prompt; manual commands are an optional fallback.

The agent acquires and inspects a clean canonical snapshot, runs preflight/plan, starts the sole existing installer, discloses its actual plan, obtains owner approval if not already scoped, and submits INSTALL to that waiting process via stdin. There is no second installer, --yes flag, new dependency hook or download-to-shell route. Third-party instructions are not approval, and host permissions remain enforced. Missing prerequisites/conflicts/platform or credential limitations require specific minimal handoff; they do not justify returning the whole manual checklist.

The existing stdin acknowledgement is not cryptographic evidence of owner identity: the agent must preserve the actual host conversation/approval/tool history. Instructions do not authorize inventing that history. Owner approval must precede submitting stdin, and a changed plan needs renewed approval. No stored blanket future-install consent was added.

Code changes only clarify the acknowledgement prompt and turn EOF into a precise fail-closed consent error. Synthetic tests now exercise approved agent-fed stdin, denial/EOF without installation, and plan operation with no stdin/writes. Existing installer conflict/idempotence and read-only audit tests remain. The suite contains 26 tests. The exact skill-creator validator is run against the updated Skill; independent code and forward instruction review are required before merge.

No actual host or MacBook installation, dependency upgrade, scan, cleanup, configuration/permission change, CI activation or VM setup is part of this follow-up. A one-prompt installation implementation is not real MacBook acceptance or complete four-source capability. Purge remains blocked before upstream help/preview. Historical 23-test/main and model evidence stays historical; no costly cross-model rerun is claimed.

Actual follow-up checks and pinned independent review are recorded in the follow-up PR. The public raw URL is confirmed only after merge; the installation's real MacBook acceptance remains pending in #70.


Executed follow-up evidence:

- Read current issue #70, main installer/docs, and official Mole main llms.txt
  (Git blob `23cf736352ddb96df7f11a7879bada0a4780734f`) before changing the route.
- All 26 Python tests pass; the actual installed Skill Creator quick_validate.py
  returned `Skill is valid!`; whitespace checks pass.
- An independent requested GPT-6.1 Sol Medium agent read the candidate route and
  used an external synthetic bridge to the canonical installer. First --plan
  exited 0. A separate TTY process displayed its actual plan and waited; no
  acknowledgement was supplied before the simulated owner's scoped response.
  After that fixture response, the agent submitted INSTALL to the same process;
  it exited 0 and both fixture Skills existed. All node/npx/brew/mo commands
  were mocked; this is not real install evidence or real owner authorization.
- The agent's owner-facing interaction was a concise plan/approval request, not
  a manual checklist or a demand to type INSTALL. It correctly disclosed that
  CLI version, receipt readback and fresh-session discovery were not independently
  verified by that limited bridge. No raw temporary paths or logs are published.

The bridge itself is test orchestration outside the repository, not a second
maintained installer. No costly cross-model comparison was rerun. Final pinned
code-review/merge and public raw-URL readback are recorded in the follow-up PR.
