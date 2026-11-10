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
