# Private-LAN AI CMO API contracts (v1)

One OpenAI Agents SDK runtime on the single Python state owner.

- `GET /health` — unauthenticated minimal readiness, no business details.
- `GET /api/status` — authenticated model/transcription *configuration* flags, no secrets.
- `GET /api/recordings` and `POST /api/recordings` — source records; multipart file plus stable `client_id`, `recipe`, `consent` and `llm_consent`.
- `POST /api/recordings/{id}/process` — enqueue one ASR + optional Intake job, returns persistent `job_id`. `GET /api/jobs/{job_id}` — state; no silent replay of uncertain calls.
- `POST /api/recordings/{id}/consent` — explicitly grant or revoke future OpenAI analysis of source transcript; cannot retract earlier provider processing. Authentic Qwen transcript can be reused without re-upload.
- `GET /api/recordings/{id}/transcript`, `GET /api/intakes`, `POST /api/intakes/{id}/approve` — private source and explicit human promotion.
- `POST /api/cmo/run`, `GET /api/decisions`, `GET /api/packages`, `POST /api/packages/{id}/edit`, `POST /api/packages/{id}/approve`, `POST /api/packages/{id}/receipt` — CMO decision and human-reviewed social handoff.
- `WORKSPACE_AUTH_MODE=lan_demo` is intentionally **token-free** for the local Mock-only pilot; requires explicit private IPv4 bind and HTTPS for LAN. Anyone on that reachable LAN can read/write demo data — never store sensitive meeting content. `WORKSPACE_AUTH_MODE=token` retains the original required `X-Workspace-Key` for future real data/provider tests; no secrets in APK/Web.
- Post acknowledgment states: `CAPTURED → TRANSCRIBED → ANALYZED_CANDIDATE → APPROVED_FOR_USE`; approval is a human action, not a prompt. External `founder_reported` links remain `UNVERIFIED`.
- `recipes.json` is the stable, versioned expected-shape contract. Strict JSON/Pydantic output models are in `server/agent_runtime.py`; prompt bodies are implementation, not source instructions.
- `StateStore` is a single-process **in-memory authoritative projection** with a durable append-only journal (no separate DB process), not a cluster or general database system.

The product is **not connected to GitHub at runtime**, and never sends raw audio to OpenAI; permitted transcript excerpts do leave the Mac for API analysis after explicit consent.

Uncertain external operation: after a Qwen POST or OpenAI call may have begun without verified result, subsequent /process returns HTTP 409 until operator reconciliation. A saved valid transcript can be reused without another Qwen call; never retry ambiguous external side effects blindly.

Consent revocation: POST /api/recordings/{id}/consent toggles only future OpenAI analysis. CMO must recheck recording consent before selecting any private summary, replacing redacted summaries with metadata-only blocked/unknown signals. A previously completed API call cannot be withdrawn. Approved public claims remain separately scoped; private source summaries are never automatically promoted.
