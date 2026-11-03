# Issue #27 — Acceptance ledger

**Phase: offline foundation and private browser demo.**

## PASS (actually verified on Mac Studio)

- [x] 26 Python automated offline tests, no real provider dispatch.
- [x] Genuine OpenAI Agents SDK Runner exercised with *fake* scripted
      model: read tool, Editor as tool, persisted official SQLiteSession,
      HITL interruption, serialized RunState, approve/resume and reject gate.
- [x] Separate CMO and Editor task identities, source-linked handoff.
- [x] Synthetic Run 1 CONTINUE, Founder review and simulated publication.
- [x] Synthetic feedback linked to original Run, metrics and comment window.
- [x] Synthetic Run 2 ADJUST using feedback, with Decision Card evidence.
- [x] Counterfactual alternative changes next action under stronger feedback.
- [x] Founder strategy approvals/rejections affect only approved versions.
- [x] Candidate claims excluded from public-approved facts.
- [x] SQLite restore preserves Task, Decision, Feedback, approvals and
      Strategy after constructing a new Store.
- [x] Duplicate feedback/publish event IDs do not repeat the action.
- [x] Real provider endpoint returns 409 without explicit spend gate.
- [x] Private LAN HTTPS server on Mac Studio's assigned RFC1918 IPv4,
      port 8434; wildcard/public addresses rejected. Independent CA, correct
      IP SAN, CA/leaf key identifiers, owner-only private keys.
- [x] Strict TLS verification from both curl and Python httpx using the
      independent public CA: HTTPS 200 without disabling verification.
- [x] Unauthenticated LAN API HTTP 401; authorized bearer-token API HTTP 200.
      Plain HTTP is not enabled.
- [x] Old #11 container remains on its separate port 8433.
- [x] Private model configuration parser requires mode 600 and rejects
      unexpected directives; no user API key was installed.
- [x] Headless Chrome Web E2E: login, Bot list, Run 1, Editor approval,
      synthetic publication, Feedback, Run 2, revised Strategy,
      counterfactual, context projection and refresh.
- [x] Browser JS error check was clean; screenshot stays private.
- [x] Node JS syntax, Python compile, .gitignore checks.

## BLOCKED / NOT RUN (must not be called PASS)

- [ ] BLOCKED: Real OpenAI model inference & autonomous decision.
      No live API key configured and no separate small spend approval.
- [ ] NOT RUN: Real model-backed Responses context compaction.
      SQLite state recovery is not the same operation.
- [ ] NOT VERIFIED: MacBook-origin **direct LAN HTTPS browser** and Founder
      acceptance (client needs one-time CA trust and private bearer token).
      Mac Studio LAN-IP HTTP/TLS and Chrome tests do not prove another machine
      can connect, including if Wi-Fi client isolation blocks access.
- [ ] OUT OF SCOPE: Actual XHS posting, platform analytics,
      Android/ASR/Qwen, real audience growth, revenue.

## Reproduction

    bash scripts/verify-local.sh
    .venv/bin/python scripts/e2e-browser.py
    .venv/bin/python scripts/e2e-restart.py

See main README for the LAN HTTPS URL, one-time public CA import, private
bearer token retrieval and scoped restart.
The E2E browser fixture resets only this Example's synthetic data and leaves
the sample loaded for Founder inspection. It does not spend OpenAI credits.

## Founder walkthrough

1. On the same LAN, trust the dedicated public CA once, then open the
   private HTTPS URL directly on MacBook and enter its local token.
2. See AI CMO + Editor and Load Sample Scenario.
3. Run CMO 1; inspect reason, source IDs and Editor draft.
4. Approve internal draft, Simulate Publication, Import Audience Feedback.
5. Run CMO 2; inspect actual feedback use, what changed and next action.
6. Review proposed strategy and inspect counterfactual.
7. Restart only this Example; inspect state survives.
8. Confirm no actual XHS traffic or provider costs; authorize live
   model validation separately if the remaining gates are desired.

**Do not close Issue #27 while compulsory live-harness and Founder
verification are still blocked.** A green fixture test is not a substitute.
