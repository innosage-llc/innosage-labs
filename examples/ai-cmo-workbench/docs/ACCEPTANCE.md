# AI CMO Workbench — engineering acceptance ledger

Parent: https://github.com/innosage-llc/innosage-labs/issues/11
Public-safe status; NOT a Founder acceptance receipt.

## BRAVIA recording and internal TLS build — 2026-11-03 incremental

- **T2 technical capture PASS:** Actual Sony BRAVIA physical-device app
  completed a bounded recording, Stop and local-save UI confirmation;
  Android AppOps independently recorded RECORD_AUDIO allow with about
  5.6 seconds of microphone operation. The native playback control was
  invoked, but **human speech audibility is NOT YET VERIFIED**.
- **T4 partial, not full PASS:** To avoid changing the TV's global certificate
  trust, the internal APK build now optionally embeds ONLY the public local
  LAN CA for this app. Generated Android Network Security Configuration
  keeps cleartext disabled and certificate/hostname verification enabled;
  signed APK built and installed successfully. An authenticated upload from
  this BRAVIA remains **NOT VERIFIED** until the operator enters the existing
  private Workspace Token directly into the app.
- **T3/T4/T5/T6 remain open** until actual source audio, private HTTPS upload,
  Web replay and restart/idempotence evidence exist. No test audio, secret,
  private device address or certificate key enters the public repository.

## LAN Demo authentication simplification — Founder decision, 2026-11-03

- The **private LAN Mock demonstration no longer needs a Workspace Token**:
  `WORKSPACE_AUTH_MODE=lan_demo` bypasses the product's login header for the
  one workspace. Web/Android connect using the existing private HTTPS URL.
- **Scope bound:** requires explicit private/local IPv4 bind, HTTPS for any
  non-loopback address, and both ASR/CMO in Mock mode. Refuse no-token startup
  when configured for real Qwen/OpenAI or publicly bound interfaces.
- Token authentication remains supported for subsequent real-data testing.
  No sensitive meeting recordings should be used while tokenless; any device
  with reachability to the internal Demo service can inspect its test data.
- Verify 401/503 for the token path, anonymous 200 for LAN Mock, 29+ regression
  tests, browser no-token E2E, and BRAVIA native no-token upload as separate
  evidence before closing #23. Master #11 stays OPEN.

## Current acceptance authority and physical device — 2026-11-03

**Master [#11](https://github.com/innosage-llc/innosage-labs/issues/11)
is OPEN.** The 2026-11-02 Mock-only closure statements below are
historical; they do **not** waive the original real Android, Qwen,
OpenAI SDK/CMO and human-reviewed content acceptance. Deterministic
Mock/Golden tests remain the primary development and regression method.

Founder explicitly approved **Sony BRAVIA 4K VH21** as the physical
Android audio-capture test target under
[#23](https://github.com/innosage-llc/innosage-labs/issues/23):

- **T0 PASS:** authorized private ADB, Android 12/API31 ARMv7,
  built-in-microphone input route, no microphone mute, signed APK
  compatible with its ABI, private backend healthy.
- **T1 PASS:** internal APK v0.1.0 installed, native main activity
  resumed on the real TV. `RECORD_AUDIO` currently granted. These
  conditions do not establish a valid recorded waveform.
- **T2–T6 NOT VERIFIED:** actual consented voice capture, durable
  non-silent file and playback, private HTTPS audio upload, replay
  and idempotence on this TV, Mock Intake source receipt. Do not use
  fixed Mock text as evidence of what was spoken.
- **Remaining:** BRAVIA proof is valid real-device Android audio
  evidence once T2–T6 pass, but separate phone-portrait UX and
  eventual bounded real Qwen/OpenAI acceptance under #11 remain
  required. No paid API call or actual social publishing occurs
  during #23.

Only sanitized device model/build/status is committed; no device
IP, ADB serial, workspace token, private CA/key or test audio.

## Final Mock MVP verification (2026-11-02)

Founder approved deterministic fixture-driven Mock acceptance and requested
closure once the MVP passes. No paid API validation is part of this milestone.

- PASS: bash scripts/run-checks.sh --mock on Mac Studio returned exit 0;
  29 Python tests passed with container networking disabled. The tests cover
  Golden Scenario hashes, both Recipes, CMO decision, WAL crash recovery,
  publication prohibition, and zero API token accounting.
- PASS: Browser E2E returned MOCK_E2E_PASS: synthetic microphone,
  authenticated HTTPS upload, new Intake automatically considered by the
  next Mock CMO, downloadable PNG, publication endpoints refused, zero JS errors.
- PASS: Android native upload fixed for RN Unsupported FormDataPart error by
  using Expo File.upload MULTIPART on Android. Standalone APK rebuilt and
  v2 signed, installed and launched on Mac Studio Android emulator.
- PASS: Emulator logged in over trusted private-LAN HTTPS, completed native
  recording and upload. Server readback showed a 35,957-byte recording,
  status ANALYZED_CANDIDATE, with linked Mock Intake and origin
  MOCK_FIXTURE_NOT_AUDIO.
- PASS: AI_CMO_EXECUTION_MODE=mock and ASR_EXECUTION_MODE=mock use isolated
  /data/mock. No OpenAI API Key or model billing. No public platform action.
- DEFERRED: physical Android phone installation and on-device LAN/CA test;
  actual local Qwen transcription and real LLM quality. Emulator evidence
  is not physical device evidence.

Closing the current issue means Mock-only prototype acceptance, NOT
production readiness or successful live model/platform integration.

## CURRENT Founder-approved Mock-only acceptance (supersedes old real-API gates)

- This milestone MUST NOT use a real OpenAI API Key or paid LLM E2E. Live
  provider integration, credits verification and model performance are deferred.
- Golden fixture SHA and two Recipe outputs pinned in
  contracts/fixtures/mock-cmo-v1.json and golden-mock-v1.json.
- Network-disabled Docker Python test gate checks deterministic transcript,
  schema, CMO decision, zero token usage, original PNG watermark, storage,
  authentication, consent and hard block of fake public publication.
- Chrome fixture E2E has already passed: synthetic audio recorded/uploaded
  over real authenticated private-LAN HTTPS; Mock Intake and CMO flow returned
  a downloaded, visibly watermarked PNG; API status reported 0 model requests;
  fake publication approval and receipt returned HTTP 409.
- Default Mock state is isolated under /data/mock and has no access to the
  external model or actual Qwen adapter via its execution branches.
- An Android emulator is a useful engineering check, but a real Android
  phone and real mic/private CA/LAN experience require Founder final test.
- IMPORTANT: a fake transcript is unrelated to uploaded audio. This
  verifies the UX/integration workflow only, not transcription accuracy
  or CMO strategy.
- Later historical live-mode requirements below are not part of this
  Mock-first acceptance. Master #11 remains open until Founder verification.

## M1 · Capture
- PASS: Mac Studio arm64, one product Docker server container, Expo Web, Android release APK successfully compiled and signature-verified.
- PASS: 21 isolated no-network backend/contract tests including WAL/snapshot failure, upload idempotency, auth, consent, stale approval, Qwen adapter and mocked CMO decision.
- PASS: Headless Chrome authenticated navigation, fake-mic recording and actual HTTPS server upload; test-only browser certificate exception did not alter runtime TLS verification. Separate curl verified the real server certificate with its private CA.
- PASS (emulator only): Android 35 ARM AVD installed standalone APK, launched, granted mic permission and recorded/stopped/saved locally with no native fatal exception.
- NOT_VERIFIED: physical-phone APK install, trusted CA on physical device, actual microphone/audio playback and authenticated phone-to-Mac upload.

## M2 · Intelligence
- PASS: unchanged existing Mac-native Qwen processed a permitted synthetic test voice; 31 timestamped segments and nonempty transcript.
- PASS: separate new-adapter synthetic Qwen call confirmed 31 timestamped segments and DELETED cleanup response, without changing Draft.
- PASS: synthetic upload and exact retry; contradictory retry returned 409. Exact acknowledged media, transcript and metadata persisted across container restart.
- PASS (mocked): new CMO job considers newly created Intake and safely chooses SKIP when public proof missing.
- BLOCKED / NOT_RUN: authorized OpenAI API key not provisioned in this new product environment, credit balance unknown, no real SDK call. Never substitute personal ChatGPT credentials.
- NOT_VERIFIED: complete physical phone -> Qwen -> real SDK Recipe Intake.

## M3 · Content/CMO
- PASS: generated PNG covers and version-bound content approval tested. An edit invalidates old approval; reported URL remains UNVERIFIED.
- NOT_RUN: real LLM CMO decision, founder-reviewable XHS content with public fact evidence, actual XHS human commit/readback, full physical-phone acceptance.

## Boundaries
- All product code in examples/ai-cmo-workbench with only small public index links outside; .env, actual recordings, transcripts, WAL/snapshots, CA keys, screenshots, APK and signing secrets ignored by Git.
- Product requires real TLS; separate private CA and a serverAuth leaf with IP SAN. Android trusts explicit user-installed CA while chain and hostname verification remain enabled.
- Existing native Edge Speech remains on host loopback, no service change, no remote cloud ASR fallback. No internet ingress.
- Private transcripts go to OpenAI API only after explicit consent. Already-started external requests cannot be withdrawn; no remote SDK trace payloads by default.
- Python in-memory single state writer, checksummed journal and verified snapshots. Not high availability, Raft or sharding.

## Reproduce
1. Configure private .env and create private-LAN cert with scripts/make-lan-cert.sh PRIVATE_MAC_IP.
2. Run scripts/run-checks.sh; start server with scripts/start-local.sh.
3. With local server active, run node app/e2e-web.mjs (synthetic Chrome test).
4. Run scripts/build-android.sh; install the generated APK on a real USB-authorized phone and explicitly trust the private CA.
5. Perform real consented phone capture -> Qwen -> Recipe -> OpenAI Agent -> CMO -> reviewable XHS package, human platform publishing only.
6. Record source SHA, APK hash, container digest, accurate costs and PASS/FAIL/NOT_RUN statuses; preserve Master #11 OPEN until Founder final acceptance.

## Subsequent engineering checks (2026-11-02)
- PASS: current Python backend and fake model policy: 22 no-network tests, including public-claim approval scope, consent revocation, WAL failure, and Qwen cleanup mock.
- PASS: Web render smoke verified three screens and zero uncaught JS errors; Chrome fake microphone/browser HTTPS integration tested separately under private credentials.
- PASS: signed Android APK built via isolated clean build, installed and launched in Android ARM emulator; device-local saved recording UI and upload action observed.
- PASS: native file moves to app document storage before success acknowledgement. Android system backup is disabled for private meeting media.
- PASS: client can copy actual content text and export/share generated PNG; native real-device sharing still not verified.
- PASS: HTTPS chain verified against local private CA, and no public listener configured.
- PASS: Python backend dependencies pinned in requirements.lock; the npm runtime audit currently reports 12 moderate and 0 high/critical advisories. This is not a production security certification.
- NOT_VERIFIED: Physical Android phone install, mic/playback and authenticated LAN upload; no physical Android phone is attached to Mac Studio.
- BLOCKED: OpenAI API Key has not been provisioned in this product runtime; credit grant/expiry unknown, real Agents SDK invocation not run.
- Master #11 OPEN pending genuine Founder final acceptance. Do not convert these partial engineering passes into a complete product claim.

## Review increment — externally uncertain execution (2026-11-02)
- PASS: durable QWEN_MAY_HAVE_ACCEPTED and OPENAI_DISPATCHED fences prevent another billable/external request after an unresolved attempt. A verified saved transcript can proceed without resending Qwen.
- PASS: network-denied 22 tests include uncertain Qwen/OpenAI HTTP 409 checks and mocked CMO output generating an actual PNG served via authenticated API.
- PASS: product container recreation plus LAN health and Chrome synthetic microphone -> authenticated real upload; no private media entered Git.
- NOT VERIFIED: real paid OpenAI model execution, physical Android phone microphone/LAN, actual human XHS platform commit.
- An engineering PR merge does not establish full Master acceptance; #11 remains open until required real checks and Founder review.


## Final engineering review incremental evidence
- PASS: 22 Python tests on rebuilt image with --network none, plus Expo TypeScript compile and synthetic Chrome Web end-to-end microphone/upload/session + persisted data after container recreate.
- PASS: persistent QWEN_MAY_HAVE_ACCEPTED and OPENAI_DISPATCHED fencing prevents unbounded duplicate real external requests; explicit HTTP 409 when reconciliation is required.
- PASS: separate intake sharing consent: revoked source private summary is redacted from subsequent CMO API payload; user can withdraw future OpenAI analysis consent, without claiming to undo already-dispatched calls.
- PASS: first durable WAL file creation fsyncs directory; transcript commit and generated PNG use atomic file/rename metadata durability precautions.
- PASS: final internal APK built with current Expo code, v2 signed, reinstalled/relaunched in Android 15 ARM emulator and expected Capture screen observed. SHA-256: 534851ee38b6f475e33132d1ed40f02b3e05c025c3f751799bc55d005eca7234. The APK lives only in ignored local build output.
- BLOCKED / NOT VERIFIED: no actual InnoSage OpenAI API Key, org credits verification or real model execution; no physical Android client connected to the Mac Studio, and no founder-confirmed XHS post. Preserve OPEN Master and necessary child issues.
