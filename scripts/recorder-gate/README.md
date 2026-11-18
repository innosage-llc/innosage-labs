# Local AI Recorder startup gate

Refs https://github.com/innosage-llc/innosage-labs/issues/85 (#86–#90).

All CI, builds and startup observations run on the local Mac. GitHub supplies PR/ref metadata and receives one ordinary, expected-head merge request only after the gates pass. No Actions, cloud CI/build, remote status publisher, native auto-merge, admin override or branch-protection changes are used. Direct web merges are outside this local policy boundary.

**Implementation checkpoint, not runtime qualification:** offline fixtures, product typecheck/tests, Web export, Swift typecheck and generated Xcode test-target inspection have been exercised. Actual Android/iOS/Web startup green/red observations, screenshots and a first Founder preview are still NOT RUN. Do not merge this implementation until those results and independent exact-head review are available.

## Candidate and commands

Use Node 24 and the existing installed Xcode, CocoaPods, Android SDK/JDK and Google Chrome. This code never installs a toolchain, downloads a browser, grants microphone access, chooses a phone, signs for distribution or requests a provider. `npm ci` and Gradle are offline; missing cached inputs fail. CocoaPods uses the existing local installation with no repo update; missing pods may still need registry access and must fail under any existing network denial.

From the Labs root, prepare a manifest for an explicit same-repository PR targeting main (drafts can be tested):

```sh
node scripts/auto-merge-ci.mjs --repo innosage-llc/innosage-labs --pr <PR> --head <40-char-PR-head> --base <40-char-current-main> --prepare /tmp/labs-candidate.json
```

Preparation requires a clean checkout at that PR head. It verifies GitHub's PR/current-main identities, fetches into this repository, and uses Git's real merge-tree result. Conflicts fail. The deterministic local integration commit has exactly `[current-main, PR-head]` as parents. It is a local test commit, not a published PR head or an actual merge. No old green receipt is imported or reused. Reconcile the PR if base changes the gate scripts, or if head/base advances; prepare and review the updated candidate.

Run the canonical CI/startup-only command (it has no merge capability):

```sh
node scripts/recorder-gate/run.mjs --candidate /tmp/labs-candidate.json --output /tmp/labs-gate-new-run --android emulator-5554 --ios-runtime com.apple.CoreSimulator.SimRuntime.iOS-27-2
```

Supply the actual installed iOS runtime identifier, not the example above. Android must be an explicitly selected emulator whose AVD name begins `labs85-`, created/owned for this task. Physical Android targets are rejected. iOS creates a fresh task-named Simulator UUID, never uses a phone or another owner's Simulator, and shuts its own Simulator down afterward. The generated Simulator is retained for diagnosis; no device erase/deletion is performed. Missing/denied tools, targets, monitoring or evidence fail closed.

For the known Homebrew toolchain, set existing tool locations in the invoking environment, without changing system settings:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
# If Gradle cannot discover the already installed JDK 17 required by its plugin:
export LABS85_JAVA_TOOLCHAINS="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home,$JAVA_HOME"
```

If system Ruby cannot load `xcodeproj`, use the Ruby/gem environment of the already installed CocoaPods. `LABS85_RUBY` chooses that existing Ruby executable; `GEM_HOME` remains its ordinary installed gem directory. Do not install gems or change permissions to silence a preflight failure. Record the actual versions. Offline gate fixtures also exercise the generated XCTest project through this Ruby environment. `LABS85_PYTHON` can select the existing test environment for Recorder server changes.

The merge entry point additionally requires the independently produced review receipt:

```sh
node scripts/auto-merge-ci.mjs --repo innosage-llc/innosage-labs --pr <PR> --head <head> --base <base> --candidate /tmp/labs-candidate.json --review /tmp/labs-review.json --output /tmp/labs-merge-new-run --android emulator-5554 --ios-runtime <installed-runtime>
```

The review receipt contains `candidate` copied exactly from the prepared manifest, `decision: "PASS"`, `role: "independent-reviewer"`, the exact resolved Sol `model`, `effort: "high"`, and SHA-256 `catalog_sha256` / `report_sha256`. The accountable V5 lead must obtain and preserve the fresh complete same-host catalog, exact route and bounded read-only independent report on that tested integration revision, not author the review themselves. The parser checks binding/completeness; it is not an authentication or model-attestation service. Keep actual review evidence with the local receipt. Repository-required human approvals and platform protections remain mandatory. Draft PRs are rejected by the merge entry point.

The controller creates a clean detached task worktree, runs applicable local CI first, then all affected startup gates. Before merge it rechecks that source revision/tree, initiating checkout head and current PR head/base still match. The final request is `PUT repos/innosage-llc/innosage-labs/pulls/<PR>/merge`, with `sha=<expected PR head>` and `merge_method=squash`. Observed base drift aborts. GitHub's ordinary API provides an atomic expected-head check, not an atomic expected-base parameter; the immediately preceding base read does not eliminate that API race. No actual merge may be used as a test. Worktrees/evidence are retained; cleanup is separate.

## Gate behavior and evidence

- Android builds an embedded-JS Release APK for the selected emulator ABI, checks the embedded entry, installs it, force-stops and invokes the normal launcher Activity. A logcat marker confirms monitoring before launch. PID/start-time identity, foreground Activity, fatal logs and accessibility-labelled Record controls are sampled. UIAutomator snapshots have a bounded 4-second maximum coverage gap; a slow/stalled probe fails. Observation commands are asynchronous and cancelled by the enclosing deadline; a separate post-completion wall-clock check also rejects synchronous timeout races. Library/Record navigation and a final ready control prove responsiveness. No Start tap occurs.
- iOS generates only ignored native project/test files, builds the Simulator Release app and UI-test bundle, checks `main.jsbundle`, installs and launches the normal bundle ID. Scoped logging begins before launch. An attached XCTest requires successful accessibility samples of the actual SwiftUI Record control/foreground state across five monotonic seconds. Query duration and completed-sample gaps are capped at 1.5 seconds; a runner pause or stalled query fails, and a successful query must complete the window. The host independently validates the retained sample timeline, navigates Library/Record and retains a screenshot attachment. The external driver independently checks original PID continuity and fatal logs. Xcode test output/deadlines/cleanup are bounded; missing observation markers fail.
- Web exports production files, freezes the hashed export in memory, and serves only loopback. Clean Chromium has crash/error/rejection/resource listeners installed before navigation. External requests are blocked, no microphone permission is granted, readiness is bounded to 30 seconds including navigation, and the actual shared Record screen must remain present for five monotonic seconds. Library/Record navigation and final instance/focus/control checks establish responsiveness. Desktop and 390px screenshots are hashed. A browser timeout, white/splash page or missing entry fails.

Each fresh output directory retains platform `result.json`, complete artifact-file SHA-256 manifest, input hashes, command/exit/signal/duration logs, target/runtime, observation and PNG digests. The aggregate writes `startup-gate.json`; the local command writes `local-gate.json`; merge invocation writes `merge-gate.json`. No PASS is produced for missing platform results or interrupted commands. Raw logs/device UUIDs stay local and must be redacted before sharing. A synthetic fixture PASS is not a live result.

Recorder source/dependencies/build inputs/gates and unknown paths run all three. Rename/deletion handling includes both path names. Only paths wholly within known other examples can skip Recorder startup, with an explicit reason; they still run their existing applicable local CI. The local CI registry covers Recorder typecheck/unit/helper tests, changed Recorder server tests, Studio tests/typecheck, existing CMO checks, and Python tests for the two Python examples. For is-clean-my-mac it additionally runs the documented standalone runtime-boundary check and native lsof/execution discovery with both opt-ins enabled against disposable fixtures only. Unavailable, empty or skipped native coverage blocks the gate. Failed CI preserves stdout, stderr, exit/signal and duration in applicable-ci.json plus the enclosing controller receipt. Unknown new example owners block until their local CI is added. Git diff checks and gate fixtures always run. No optional GitHub checks stand in for this CI.

## Red controls and preview

After the canonical command creates/installs dependencies in its retained exact candidate worktree, single-platform diagnostics can use:

```sh
node scripts/recorder-gate/platform.mjs --platform android --source <retained-candidate-source> --candidate /tmp/labs-candidate.json --output /tmp/android-red-new --android emulator-5554 --fault terminate
node scripts/recorder-gate/platform.mjs --platform ios --source <retained-candidate-source> --candidate /tmp/labs-candidate.json --output /tmp/ios-red-new --ios-runtime <runtime> --fault terminate
node scripts/recorder-gate/platform.mjs --platform web --source <retained-candidate-source> --candidate /tmp/labs-candidate.json --output /tmp/web-red-new --fault missing-entry
```

Termination is scheduled within the ready observation window. Web returns HTTP 200 for the real index but intercepts the entry script with HTTP 404. A valid red-control receipt must be nonzero/FAIL **and** `fault.applied: true`; a generic missing-target failure is not proof of an injected red control. The merge path accepts no fault/skip options and always runs fresh positive checks.

For the first human preview, after a successful Web receipt:

```sh
node scripts/recorder-gate/preview.mjs --receipt /tmp/labs-gate-new-run/web/result.json
```

This serves the identical digest-pinned export on loopback and prints tested revision/digest/URL. Stop with Ctrl-C. It creates no public exposure. Any remotely accessible preview requires separate applicable authorization. Browser scope is Record/Library/Settings navigation and explicit capability messages; recording, file import, transcription and key storage remain native-only. The genuine shared app and state are used, with platform adapters and existing theme/labels; there is no readiness-only substitute app.

Run offline regression/spy fixtures with `node --test scripts/recorder-gate/gate.test.mjs`. They call the actual CLI controller with in-memory synthetic dependencies; production CLI has no fixture/skip hook. No test makes a real merge request.
