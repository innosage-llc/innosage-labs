# Android Edge Speech milestone

Refs #35 and #36. Scope is Android M4A transcription, retry/recovery and separately persisted originals/revisions.

## Staging engineering evidence

- Infra candidate `14c3c4291e01dcd4dd574d7c4bd7899ca54eae86` passed its exact GitHub repository-hygiene check. Changed runtime hashes matched the inactive staging artifact before selection.
- Updated only staging Router and the isolated Mac Studio Recorder Gateway. Production Router PID and monotonic start timestamp remained identical. Shared HTTPS ingress was not restarted.
- Phone uses ordinary public HTTPS through the bounded staging bridge. No phone Tailscale setup, service token or manual pilot token is required.
- One authorized short synthetic M4A completed through public HTTPS, staging Router and real Edge Speech. Observed STAGED → QUEUED → COMPLETED in 10.3 seconds, original 144 characters. Cached reread matched exactly. No transcript content or credentials retained in this report.
- Router telemetry after validation showed zero outstanding jobs, zero reserved/upload bytes, both admission slots available and backend reachable.
- Gateway seven regression tests passed. TypeScript passed. Router exact CI passed. Local full Infra verification had failures in unrelated Edge tests, so it is not reported as a full local pass.
- Independent Sol HIGH source refresh found no remaining staging blockers. Runtime observations above are lead evidence, not reviewer execution.
- Founder Android acceptance remains pending. Production deployment remains outside this milestone.
- Android release emulator UI opened the public Gateway automatically and displayed Transcribe. Editor checks used the already-returned synthetic original injected only into emulator storage, with no second inference. Saved a revision, cold-relaunched, and observed the persisted edit. This is editor persistence evidence, not an Android end-to-end inference pass.

## Optional speaker identification follow-up

Founder accepted the baseline and requested a default-off Identify speakers option. Expo Compose Switch uses installed @expo/ui 58.0.27. Existing operation UUIDs remain plain mode. New operation records retain both ID and mode. Gateway persists compatible mode and speaker-result columns, preserves plain originals, and uses the existing Router attribution path. Phone saves attributed text separately from original and revision. Ten Gateway regression tests and typecheck pass. Independent review, Android rebuild and staging handoff pending. No additional live inference is counted as tested.

Independent Sol HIGH review raised and then closed two recovery findings. Unavailable speaker admission now marks a confirmed failed attempt so the user can explicitly start a new plain-mode UUID. Speaker metadata is saved before the original completion marker, allowing interrupted saves to recover. Eleven Gateway tests and 367 Router tests pass. Runtime capability read confirms staging speaker admission enabled. New real speaker inference remains founder verification.

## Speaker transcript readability repair

Founder rejected one-word-per-line output on v0.1.2. Native screenshot confirmed the presentation defect. Add a native formatting helper that uses the original punctuation/spacing and groups same-speaker words into bounded readable paragraphs. Apply it to cached results without retranscription; retain custom revisions. Three synthetic regression cases and TypeScript pass. Independent Sol HIGH review found no source blockers. Preparing v0.1.3/versionCode4 APK. Private screenshot/transcript remains outside Git.

Read-only diagnosis matched the phone's current attributed text by its hash to the server's cached result. The formatting helper reflowed 86 word rows into 15 paragraphs. Original non-whitespace characters, including punctuation, were preserved exactly. No raw content was printed or committed, and no ASR was run. Native phone validation follows the new APK install.

## Pro access increment #38

Based on accepted c4d5fab. Added environment-bound SecureStore key configuration and canonical Draft paid identity/reserve reuse. Native direct upload uses a small Android Expo file-streaming module because installed Expo fetch buffers Blob and ReadableStream bodies. The upload bridge uses64KiB chunks, fixed length, standard TLS, redirect refusal, cancellation and app-private file scope. Source hashing uses1MiB reads. Original and speaker metadata persist before cleanup.

Read-only Sol review identified five blockers; repairs isolate sessions per operation, remove an implicit paid default from Free restart, expose immutable operation expiry, recover cleanup with same-account authorization, and replace buffered fetch upload. Ten protocol/paragraph checks, TypeScript and a128MiB hash cross-check pass. Positive Pro and four-hour native acceptance remain NOT RUN, awaiting founder staging-key entry. Existing five moderate dependency advisories are retained; no new backend or production service operation occurred.


## Pro v0.1.4 ready for founder staging verification

- PR #39: https://github.com/innosage-llc/innosage-labs/pull/39, source 3d21f08, stacked on accepted baseline PR #37.
- PASS: 11 deterministic protocol/paragraph tests, TypeScript, bounded 128 MiB hash cross-check, independent Sol HIGH source review, native Android release build, emulator masked key entry and live staging invalid-key rejection (synthetic invalid input only; no inference).
- APK v0.1.4/versionCode 5 SHA-256: 715dce3c78c911b8c7d742ff284de52d4f37b6bd4ea06ec8d864a65d3945a934.
- PASS: in-place installation and launch on Samsung RFCY310NA7M; package manager confirms v0.1.4/versionCode 5. Native Pro settings is open for founder key entry. Existing app data preserved.
- NOT RUN: real paid key positive authorization, real paid audio upload/inference, four-hour device qualification. Founder will enter the staging key only on the phone. Agent must not retrieve it.
- Production deployment remains NOT AUTHORIZED. Issue #38 stays open pending founder acceptance.


Founder accepted v0.1.4 Pro positive flow. Service-selector child #40 adds official Expo Material radio options for InnoSage staging/production, separate encrypted key profiles, preserved original job routing and a disabled future OpenAI entry. Existing paid production HTTP identity endpoint returned401 without credentials (reachable/auth protected); no authorized paid production request or inference executed. 13 offline tests and TypeScript PASS. No backend deployment. Production Free remains unavailable in Recorder; explicit Pro requirement. Android v0.1.5/versionCode6 is building for native UI verification and phone installation. First build lacked ANDROID_HOME; corrected to the existing local Android SDK without changing source.

Service-selector independent Sol HIGH read-only source review returned no source-level blockers. 13 local checks and TypeScript pass, git diff whitespace check passes. Native build and device UX checks pending; no real paid production invocation performed.


## Service selector ready for founder verification

- Child #40; stacked draft PR #41: https://github.com/innosage-llc/innosage-labs/pull/41. Runtime source2181dfc.
- PASS: TypeScript and13 deterministic protocol/isolation/paragraph checks; independent Sol HIGH read-only source review with no blockers; Android release build (381tasks,3m2s).
- APK v0.1.5/versionCode6 SHA-256 c09ed3a4fc311d567c6faee421142e8818a5ee02ac832b0d58e472292f967e14.
- PASS: emulator official Material production radio selection and preference persistence across force-stop/relaunch. Separate production profile initially empty. Native screenshot reviewed; OpenAI is Coming soon and has no selection handler.
- PASS: Samsung RFCY310NA7M in-place install, package version confirmed, launch and Transcription service settings opened. UI reports Staging selected and Pro key saved after upgrade. No actual key value retrieved.
- NOT RUN: real production Pro authorization/upload/inference; existing production Router probe /health returned404 and is not claimed as health validation. Worker identity returned401 without credentials, proving only endpoint reachability/auth protection. No production backend deployment.
- Founder can switch services locally, save the matching key, and use a new recording to verify actual target. Existing jobs retain their service. Recorder Free remains staging-only. Master and child remain open pending acceptance; OpenAI implementation is a later milestone.
