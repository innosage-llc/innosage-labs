# Issue #27 — Acceptance ledger

**Phase: offline foundation and private browser demo.**

## PASS (actually verified on Mac Studio)

- [x] 21 Python automated offline tests, no real provider dispatch.
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
- [x] Private localhost server on port 8434, token-protected API.
- [x] Old #11 container remains on its separate port 8433.
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
- [ ] NOT VERIFIED: MacBook-origin SSH tunnel & Founder browser acceptance.
      Local Mac Studio Chrome and HTTP checks are not a second client.
- [ ] OUT OF SCOPE: Actual XHS posting, platform analytics,
      Android/ASR/Qwen, real audience growth, revenue.

## Reproduction

    bash scripts/verify-local.sh
    .venv/bin/python scripts/e2e-browser.py
    .venv/bin/python scripts/e2e-restart.py

See main README for private SSH tunnel, token retrieval and restart.
The E2E browser fixture resets only this Example's synthetic data and leaves
the sample loaded for Founder inspection. It does not spend OpenAI credits.

## Founder walkthrough

1. Open the verified private tunneled URL, enter local token.
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
