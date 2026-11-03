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

The server detects Mac Studio's private LAN IPv4 and listens on
**https://<MAC_STUDIO_LAN_IP>:8434/**, not on a public or wildcard interface.
It rejects non-RFC1918 addresses and IPs not actually assigned to the Mac.
Independent private CA + HTTPS server certificates are generated in
**.local-run/tls/**. A random bearer token is stored in
**.local-run/access.token**. Certificate private keys, token, SQLite and
SDK Session records stay in this independent Example and are ignored by Git.

Discover the actual LAN IP and check strict HTTPS verification:

    .venv/bin/python scripts/lan-tls.py discover
    curl --noproxy '*' --cacert .local-run/tls/ca.crt \
      -fsS https://<MAC_STUDIO_LAN_IP>:8434/health

### Direct browser access from MacBook (same LAN)

**No SSH tunnel is required for normal Web use.** One-time private CA
installation is required because a publicly trusted certificate cannot
normally be issued for an RFC1918 IP. On an authorized MacBook:

1. Copy **only the public CA certificate** from Mac Studio using existing
   authenticated SSH/SCP (replace the two placeholders):

       scp <MAC_STUDIO_SSH_HOST>:<ISSUE_27_WORKTREE>/examples/openai-agent-foundation/.local-run/tls/ca.crt \
         ~/Downloads/innosage-agent-foundation-ca.crt

2. Compare the SHA-256 certificate fingerprint with Mac Studio using
   openssl x509 -fingerprint -sha256 -noout -in <FILE>.
   In **Keychain Access** on MacBook, import the copied public CA into
   the login keychain and explicitly set it to **Always Trust**.
   Do not trust an unknown browser certificate warning instead.
3. Open **https://<MAC_STUDIO_LAN_IP>:8434/** on MacBook while connected
   to the same LAN. Chrome should show a trusted HTTPS connection.
4. Enter the private bearer token from Mac Studio's
   .local-run/access.token, transferred privately. Never post it in
   public issues, PRs, screenshots or chats.

**Never transfer private keys** (ca.key or server.key) from .local-run/tls.
After evaluating this internal demo, remove the temporary CA trust from any
client where it is no longer needed. Keep the CA private key on Mac Studio.
This CA is independent of the old #11 Demo. On Mac Studio LAN IP changes,
restart only #27 with stop-local.sh then start-local.sh; the server certificate
is reissued for the new address under the same CA. Never bind to 0.0.0.0
or enable public router forwarding. Same-Mac Chrome tests do not prove a
separate MacBook can connect; Founder must perform that final verification.
If access fails, check that both devices are on the same private LAN,
that guest-Wi-Fi client isolation is disabled, and that macOS firewall rules
permit only the required local port. Do not disable the system firewall.

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
