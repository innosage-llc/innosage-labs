# AI CMO Workbench — engineering acceptance ledger

Parent: https://github.com/innosage-llc/innosage-labs/issues/11
Public-safe status; NOT a Founder acceptance receipt.

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
