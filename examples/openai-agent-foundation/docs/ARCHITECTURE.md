# #27 — Architecture / review

## Context

#11 tried to build Capture → Qwen → Intake → CMO → content before validating
the Agent operating environment. This new Example is an isolated Agent
Foundation study. It is NOT a replacement for #11 acceptance.

| Component | Responsibility | State |
| --- | --- | --- |
| Browser Web | Bot list, task board, approvals, evidence inspection | Session-only access token |
| Python FastAPI | No-network synthetic business operations | Independent local SQLite |
| SDK probe | Read-only tools, Editor delegation, HITL resume | Official SQLiteSession, private serialized RunState |
| Model inference | Real OpenAI calls ONLY after separate authorization | External provider, currently disabled |
| Old #11 | Android / Qwen / Intake business capability example | Separate container & state; never touched |

## Critical invariants

- Example-specific port 8434 on **only the Mac's assigned RFC1918 LAN IPv4**,
  validated on startup. No wildcard, public listener or WAN exposure.
- TLS mandatory, independent private CA and IP SAN leaf generated within
  ignored #27 private files. Clients must explicitly trust **only the public
  CA certificate**. Never transmit the CA/server private key.
- A separate bearer token guards all business APIs even on the private LAN.
  Direct same-LAN browser access needs no SSH tunnel after one-time CA trust.
- Only example-owned .local-run for database, session history, token, receipts.
- No imports from the older ai-cmo-workbench Example.
- Synthetic candidate Intake never becomes an approved public claim.
- Published status is always MOCK_EXTERNAL_OUTCOME, never platform_verified.
- Founder approval changes only internal draft/strategy status, not XHS.
- Approved Strategy vN is a durable business object, not an agent summary.
- Feedback source identifiers, time windows, gaps and originating Run are
  explicitly recorded for Run 2 attribution.
- Idempotency keys prevent duplicate simulated publish or feedback events.
- Rejected or previously approved strategy revisions are not silently
  promoted or repeatedly presented.
- Restart or context compression cannot erase business SQLite records.
- No SDK tracing of private raw payload; no external model calls unless
  separate organization key and explicit operator authorization.
- A previous ambiguous API dispatch is not automatically replayed.

## Two-round learning loop

    Synthetic accepted strategy + candidate Intake
      -> CMO Run 1 -> source-grounded Decision Card
      -> Editor task -> internal draft -> Founder review
      -> MOCK publication -> synthetic audience feedback
      -> CMO Run 2 -> compare with baseline -> revised next action
      -> proposed learning -> explicit Founder strategy review
      -> Run 3 reads approved strategy (if any)

The deterministic fixture algorithm proves a controlled evidence-dependent
transition, NOT causal audience insight or genuine LLM intelligence.
Tests with both weak and strong synthetic feedback are counterfactual checks.

The official Agents SDK fake-model test separately proves that real SDK
Runner, Tools, Agent-as-Tool, RunState, pause/reject/approve/resume and
SQLiteSession work with ZERO billable requests. Real SDK model reasoning,
runtime context compaction and user-side MacBook access remain separately
verified acceptance gates.

## OpenAI-first comparison

- **OpenAI Agents SDK** — preferred for Python CMO/Editor logic: tools,
  handoffs, durable session and human approval. Still needs a business
  control plane and browser UI.
- **Codex SDK/App Server** — conditional future executor for file/shell/code
  tasks. Read-only conceptual comparison. Neither Codex CLI nor Codex was
  used in implementation.
- **Managed Agents API** — useful alternative but model session state is
  provider-managed. Not selected for privacy-first local ownership.
- **ChatKit** — full custom backend integration deferred; plain Web UI is
  smaller and suffices for this short technical spike.

Canonical social-business policies remain in
[InnoSage Ops Social Growth Loop](https://github.com/innosage-llc/innosage-ops/blob/main/docs/runbooks/presence-social-growth-learning-loop.md)
and [PDR-0004](https://github.com/innosage-llc/innosage-ops/blob/main/presence/decisions/0004-xiaohongshu-social-growth-learning-loop-v1.md).
This Spike **does not read private Ops runtime data** or modify the real
experiment pointer. Reuse semantics, not hidden permissions.

## Deliberate exclusions

No Android, Qwen, true XHS interaction, creator analytics, background
scheduler, video generation, vector DB, custom WAL, ChatKit cloud routing,
unrestricted shell tools, public SaaS hosting or multi-tenant authorization.
