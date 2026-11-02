# InnoSage AI CMO Workbench — private-LAN example (MVP)

**Source is public; actual business records must never enter Git.** This is an
isolated single-workspace demo in `examples/ai-cmo-workbench/`. It does not
run as a tool on innosage.co/tools. Parent: innosage-labs #11.

## Product job — current Mock-first milestone

One shared Expo Web and Android client records and uploads to the private
Mac Studio server. The default fixture-driven workflow is:
recorded media -> fixed mock transcript -> selected fixed Intake recipe ->
new Mock CMO run automatically considers the Intake -> original
watermarked Xiaohongshu-style PNG/caption in a review-only interface.

IMPORTANT: Mock transcription does not analyze uploaded audio. No OpenAI API,
no paid LLM, no Qwen calls and no social publishing occur in this mode. Outputs
are clearly labeled as synthetic test data, not factual evidence.

Checked-in scenario and golden outputs:
- contracts/fixtures/mock-cmo-v1.json
- contracts/fixtures/golden-mock-v1.json
They define transcript segments, both fixed recipes, CMO decision and
zero-cost usage. Repeated runs are compared to golden fixtures under a
Docker network-denied deterministic test gate.

## Architecture and boundaries

- Python FastAPI single-worker backend with authoritative in-memory objects,
  a durable WAL, checked snapshots, private media and an isolated app container.
- Expo + React Native Web shares one UI codebase for Web and Android. The
  Android APK is an actual standalone internal build; iOS remains future TODO.
- This is Arnold Explore-inspired architecture, not Common Lisp/BKNR source,
  Raft, sharding or production high availability.
- Explicit default settings are AI_CMO_EXECUTION_MODE=mock,
  ASR_EXECUTION_MODE=mock and PRODUCT_DATA_ROOT=/data/mock.
- Existing Mac-native Qwen/MLX remains separate and unchanged; the adapter
  is preserved for a separate authorized live validation, not used by Mock.
- OpenAI Agents SDK Python live path remains present but **not exercised**:
  API Key, credits checking, real LLM E2E and provider spending are explicitly
  deferred by Founder. Mock runs report 0 provider requests and 0 tokens.
- Mock content cannot be approved for public publishing or recorded as a real
  Xiaohongshu post. The PNG visibly identifies it as an internal mock.
- Every external service is out of scope for the fixture E2E. If eventually
  enabled, model services are remote processors and LAN self-host does not
  imply transcripts stay on-premises.
- One InnoSage workspace, private-LAN HTTPS. No internet ingress, paid spend,
  automatic social posting, private session cookies, or public SaaS signup.

## Start and run the current Demo on Mac Studio

1. Copy .env.example to a private .env and generate a random WORKSPACE_TOKEN
   of 32+ bytes. **Leave OPENAI_API_KEY and EDGE_SPEECH_SERVICE_TOKEN empty
   for the mock milestone**. Keep all three mock settings listed above.
   Never commit .env, keys, recordings or internal screenshots.
2. Build/start with bash scripts/start-local.sh. From Mac localhost-only
   access keep BIND_IP=127.0.0.1 and open http://127.0.0.1:8433.
3. For Android/private-LAN access set BIND_IP to the authorized Mac private
   address. Run bash scripts/make-lan-cert.sh PRIVATE_MAC_IP, mount the
   private server cert/key under .data/tls and configure TLS_CERT_PATH and
   TLS_KEY_PATH accordingly. Install ONLY .data/tls/ca.crt as a user CA
   on authorized devices (the key stays on Mac). Do not disable cert
   verification or enable router forwarding.
4. Build the standalone signed internal APK with
   bash scripts/build-android.sh; install the resulting ignored
   app/android/app/build/outputs/apk/release/app-release.apk onto an
   authorized Android device. Android localhost is NOT Mac Studio.
5. Authenticate to the private Workspace in APK or Web. Record a
   consented sample, stop and save, select a Recipe, upload, and check the
   visible MOCK label. The transcript is a known fixture, not the recording.
6. Trigger Run Mock Growth Loop, verify it considered the new Intake,
   produced a watermarked PNG and an internal-only caption. Export is
   allowed for review; public approval/publication is blocked.
   Physical Android true microphone+LAN acceptance remains a Founder
   final device check, not a simulated pass.

## Reproducibility and third-party boundaries

The Python backend has pinned resolved dependencies in server/requirements.lock
and source upper bounds in server/requirements.txt. Expo uses app/package-lock.json.
Run npm ci; do not depend on transitive unpinned updates.

The UI is original; AiToEarn (MIT) and Easel (Apache-2.0) are UX/source references,
not copied code, logos or assets. OpenAI Agents SDK, Expo, React Native, FastAPI,
Pillow and FFmpeg have independent licenses/provider terms requiring compliance.
Android APK is an internal test build signed using developer build tooling,
NOT an Android Play Store release. iOS: future TODO.

## Deterministic tests and recovery

- Run bash scripts/run-checks.sh to perform a locked Web TypeScript compile,
  build the product Docker image and run all Python fixture/WAL/security tests
  in a container with NO network access.
- With the private Mock server running, run
  bash scripts/run-checks.sh --mock to add the headless Playwright fixture
  flow: fake mic -> authenticated HTTP upload -> Mock Intake -> CMO decision
  -> watermarked PNG download -> forbidden public-approval checks.
- To build the standalone Android APK, run bash scripts/build-android.sh.
  An emulator install is not a real-device pass; iOS is not built.
- Default mock WAL and snapshots live at .data/mock/state; private mock media
  under .data/mock/blobs. Existing real/test data elsewhere in .data is
  not part of this validation and must not be changed or leaked.
- Restarting the container must preserve acknowledged Mock data. WAL/partial
  snapshot failure tests fail closed. This does not protect from host loss
  or replace private backups.
- An authorized real Qwen adapter and live OpenAI Agents SDK code remain for
  future explicitly approved use; no billable API E2E is required now.
- Public repository source and golden fixtures contain only synthetic data.

## Source/reference

[Arnold Screenshotbot architecture](https://screenshotbot.io/blog/building-a-highly-available-web-service-without-a-database)
· [AiToEarn](https://github.com/yikart/AiToEarn)
· [Easel](https://github.com/ZJU-REAL/Easel)
· [InnoSage PDR-0004](https://github.com/innosage-llc/innosage-ops/blob/main/presence/decisions/0004-xiaohongshu-social-growth-learning-loop-v1.md)
· [Edge Speech](https://github.com/innosage-llc/innosage-infra/blob/main/services/edge-speech/README.md)
