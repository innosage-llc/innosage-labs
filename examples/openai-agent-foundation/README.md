# InnoSage OpenAI-first Agent Foundation — #27

**Private, independent technical spike. Synthetic evidence only. Not a live social publisher.**

[Issue #27](https://github.com/innosage-llc/innosage-labs/issues/27) validates
a tiny Agent Workbench: long-lived Bot identities, Task records, CMO decisions,
Editor handoff, simulated audience feedback and a supervised Learning Loop.

**Isolation is mandatory:** This Example is independent of the earlier
[AI CMO Workbench #11](../ai-cmo-workbench/README.md). It does not import #11,
touch its Docker container, data volume, service port or infrastructure.
Its state lives only in this Example's private .local-run directory.

## Guided user experience

1. **Load Sample Scenario** — synthetic objective, approved strategy and
   clearly marked candidate Intake.
2. **Start Growth Loop** — Run 1 records a source-grounded Decision Card.
3. **Editor Handoff** — separate Editor task produces an internal draft.
   Founder approves/rejects **the internal draft only**.
4. **Simulate Publication** — MOCK_EXTERNAL_OUTCOME, not a real post.
5. **Import Audience Feedback** — synthetic dated metrics and comments.
6. **Run 2** — new action is compared with the baseline and cites feedback.
   An inspectable counterfactual changes the underlying synthetic feedback.
7. **Review strategy** — only Founder can approve a policy revision.
   The next run reads only the approved policy version.

**Do not confuse a deterministic synthetic demo with real reasoning.**
The default Web workflow uses transparent fixture logic, not OpenAI model
inference. The official Agents SDK has a separate, gated experiment.

## Prerequisites

Mac Studio or equivalent trusted Mac; Python 3.10+; Chrome for browser E2E;
Node for JS syntax test. Tested with Python 3.14.7 and Chrome on Mac Studio.
No Docker, Codex, Android, Qwen, public ingress or provider account needed
for offline mode.

## Start on Mac Studio

From this directory:

    bash scripts/prepare.sh
    bash scripts/verify-local.sh
    bash scripts/start-local.sh

The only listening endpoint is **http://127.0.0.1:8434/**.
A random private access token is created once at **.local-run/access.token**.
Never commit, paste into GitHub, or reveal it publicly. Only the local operator
can read it. Local database and SDK Session files are also in .local-run.
Check the health without leaking a token:

    curl --noproxy '*' -fsS http://127.0.0.1:8434/health

### Remote browser from MacBook

Use the existing authorized Mac Studio SSH connection and forward local port
8434 through SSH. On MacBook (replace the placeholder with your SSH host):

    ssh -N -L 8434:127.0.0.1:8434 <MAC_STUDIO_SSH_HOST>

Open **http://127.0.0.1:8434/** in the MacBook browser and enter the
workbench token. Read the private token from Mac Studio through your normal
SSH mechanism:

    ssh <MAC_STUDIO_SSH_HOST> 'cat <ISSUE_27_WORKTREE>/examples/openai-agent-foundation/.local-run/access.token'

SSH secures the loopback HTTP transport, and bearer token protects the
workbench APIs independently. **Never bind the app to 0.0.0.0 or expose it
to WAN.** A Mac Studio Chrome test does not prove MacBook access; Founder
must confirm the tunnel and browser from the actual MacBook.

## Repeatable verification

    bash scripts/verify-local.sh
    .venv/bin/python scripts/e2e-browser.py
    .venv/bin/python scripts/e2e-restart.py

The Chrome test drives all seven workflow steps. Both E2E scripts reset
**this Example's synthetic database only** and leave a fresh sample loaded.
The screenshot stays private at .local-run/browser-e2e.png.

Restart / stop only this service:

    bash scripts/stop-local.sh
    bash scripts/start-local.sh

The stop script checks process identity and working directory. It never
touches the old #11 container. Data and token persist across stop/start.

## What the official Agents SDK actually proves

The installed Python SDK provides Runner, official SQLiteSession,
OpenAIResponsesCompactionSession, read-only tools, agent-as-tool delegation,
and serialized RunState approval. An offline test runs those genuine SDK
mechanics with a scripted fake model at zero provider cost, proving
the plumbing, **not** intelligent reasoning. A guarded live SDK probe
exists but requires a separate budget approval and private API key.

The SDK's compressed Session is **not** the canonical business record.
SQLite objects represent accepted strategy, approval, candidate facts,
task ownership, decisions, feedback and event identity independently.
The real provider compaction execution remains NOT_RUN pending approval.

The browser is original plain HTML/CSS/JS, intentionally not ChatKit:
full custom ChatKit server integration was larger than this one-day spike.
Codex App Server was evaluated as a possible later execution adapter,
**not used for development or runtime**.

## Live provider configuration — separate consent required

**Do not enable without explicit Founder spend approval.**
No key is needed to use the offline Demo. A real probe requires
a *privately configured* project/organization OpenAI API key, one
explicit authorization switch and a narrow project billing cap.

    FOUNDATION_ALLOW_BILLABLE=explicitly-authorized
    FOUNDATION_MAX_PROBES=1
    FOUNDATION_MODEL_OUTPUT_LIMIT=550
    OPENAI_API_KEY=<PRIVATE_VALUE>
    OPENAI_MODEL=<APPROVED_MODEL>

To configure only **after** approval, create a private owner-only file on the
Mac Studio using a local editor: **.local-run/model.env** with the settings
listed above and the actual key. Apply mode 600 to that file, then restart
**only #27** using the lifecycle scripts. The server parses only an explicit
allowlist of key=value settings; it does not execute model.env as shell code.
Never send your API key into ChatGPT or put it in a GitHub issue.

The probe allows only one admitted dispatch with no automatic retries;
it caps turns and output tokens, but **not the entire dollar bill**.
A provider-side project spend cap is required. Only synthetic material is
used, raw SDK tracing is disabled, and no external platform tool is granted.
Model API processing is remote even though the Web server is local.

## Further evidence and licensing

- [Acceptance ledger](docs/ACCEPTANCE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Third-party sources](docs/THIRD_PARTY.md)

The source is MIT under the root repository license; third-party dependencies
retain their upstream licenses. No private audio, customer material, social
credentials, model keys, private hostnames or actual platform metrics are
committed.
