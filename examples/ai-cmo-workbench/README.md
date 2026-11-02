# InnoSage AI CMO Workbench — private-LAN example (MVP)

**Source is public; actual business records must never enter Git.** This is an
isolated single-workspace demo in `examples/ai-cmo-workbench/`. It does not
run as a tool on innosage.co/tools. Parent: innosage-labs #11.

## Product job

Real Android APK records locally -> authentic Mac LAN upload -> existing Mac Qwen
transcribes -> fixed source-aware OpenAI Intake recipe -> a NEW OpenAI Agents SDK
CMO run considers the candidate -> produces a XHS source-backed review package.
Only a human can publish on the social platform.

## Architecture / known limitations

- Shared **Expo React Native Web + Android** frontend; **iOS: TODO**, deliberately
  not signed or built. Android recording is native; Web is mainly the workstation.
- Exactly one NEW product container (FastAPI, in-memory state owner, local
  append-only WAL+snapshot, served Expo Web). No separate database/Redis process.
- Already-running Mac-native Qwen/MLX Edge Speech is OUTSIDE the container.
  It must never be restarted, reconfigured or exposed to the LAN by this demo.
- Actual OpenAI Agents SDK calls require the operator's API Organization key.
  API credits balance is **UNVERIFIED**, so no cost-free claims.
- Local LAN self-host does not mean AI prompts never leave the device: permitted
  transcript excerpts are sent to the configured OpenAI API provider.
- No automatic XHS publishing, no private session cookies, no scraping, no
  unattended schedule, no multi-tenant SaaS or robust production HA.
- ARNOLD-EXPLORE-inspired Python implementation, NOT Lisp/BKNR or compatible
  replication. A true crash-safe store is more difficult than "no DB server."
- Valid record receipts and snapshots survive the product container restarting;
  it does not protect against Mac disk loss, power loss without backup or host
  unavailability. External API operations with unknown results are BLOCKED
  instead of automatically replayed.

## Start locally on Mac Studio

1. Copy `.env.example` to private `.env`; generate a real, random
   `WORKSPACE_TOKEN` (32+ bytes). Set model key, authorized private Edge Speech
   credential and optionally organization ID. **Never commit the .env file.**
2. On the Mac, from this folder: `docker compose --env-file .env -f deploy/compose.yaml build`;
   then `docker compose --env-file .env -f deploy/compose.yaml up -d`.
3. For Mac localhost-only access keep `BIND_IP=127.0.0.1`. Open
   `http://127.0.0.1:8433`, enter server URL and workspace secret. No phone
   can access Mac via the phone's own localhost.
4. **LAN + Android:** set `BIND_IP` to Mac's specifically authorized private
   LAN address; configure `TLS_CERT_PATH` and `TLS_KEY_PATH` to files mounted
   under `.data` (e.g. `/data/tls/server.crt` + `/data/tls/server.key`).
   Generate a private CA plus verified serverAuth leaf with IP SAN:
   bash scripts/make-lan-cert.sh PRIVATE_MAC_IP. Install ONLY .data/tls/ca.crt
   as a trusted user CA on authorized Android devices. Keep both CA and server
   private keys on the Mac. Re-running requires re-trusting devices. Never
   disable certificate validation or forward a router port. Start using
   bash scripts/start-local.sh so Compose loads .env for port binding.
5. Build a **standalone, JS-bundled internal release APK** using the verified
   `bash scripts/build-android.sh` entrypoint (JDK 17, Android SDK/NDK, Expo).
   The script clean-prebuilds Android, adds trust for **explicitly installed
   user CA** without disabling TLS validation, then runs release Gradle. Output:
   `app/android/app/build/outputs/apk/release/app-release.apk`, ignored by Git.
   Install with `adb install -r <path>` on an authorized USB-connected phone.
   An Expo Go session or debug APK without Metro is **not** a standalone deliverable.
6. Mac Studio must be up and same private LAN. In APK enter its HTTPS URL and
   token once, then record -> stop -> choose recipe -> upload -> process.
   New CMO runs are manually invoked on Web; the UI shows candidate/approved
   states and publication-approval limitations.

## Reproducibility and third-party boundaries

The Python backend has pinned resolved dependencies in server/requirements.lock
and source upper bounds in server/requirements.txt. Expo uses app/package-lock.json.
Run npm ci; do not depend on transitive unpinned updates.

The UI is original; AiToEarn (MIT) and Easel (Apache-2.0) are UX/source references,
not copied code, logos or assets. OpenAI Agents SDK, Expo, React Native, FastAPI,
Pillow and FFmpeg have independent licenses/provider terms requiring compliance.
Android APK is an internal test build signed using developer build tooling,
NOT an Android Play Store release. iOS: future TODO.

## QA / recovery

- `PYTHONPATH=. python3 -m unittest discover -s tests -v` tests the custom
  persistence core on synthetic records.
- `docker compose --env-file .env -f deploy/compose.yaml restart` and verify exact previously
  acknowledged recordings/intakes are still present; system is one state owner.
- The state journal is `.data/state/transactions.wal`, snapshots under
  `.data/state/snapshot*.json`, blobs under `.data/blobs`. Back up `.data`
  while no writes are in flight. Do not hand-edit the WAL.
- Qwen server authorization or container-to-host TLS/access may be blocked:
  preserve source and report BLOCKED, never silently cloud-transcribe.
- Android APK install requires a real attached physical device. A successful APK
  compile alone is not a physical-device acceptance.
- Do not publish actual meeting payloads, device identifiers, credentials or
  private screenshots in any GitHub issue/PR.

## Source/reference

[Arnold Screenshotbot architecture](https://screenshotbot.io/blog/building-a-highly-available-web-service-without-a-database)
· [AiToEarn](https://github.com/yikart/AiToEarn)
· [Easel](https://github.com/ZJU-REAL/Easel)
· [InnoSage PDR-0004](https://github.com/innosage-llc/innosage-ops/blob/main/presence/decisions/0004-xiaohongshu-social-growth-learning-loop-v1.md)
· [Edge Speech](https://github.com/innosage-llc/innosage-infra/blob/main/services/edge-speech/README.md)
