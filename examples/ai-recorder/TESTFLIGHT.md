# TestFlight delivery (no USB connection required)

The owner's revised goal is to install and test on their own iPhone through TestFlight. This is the delivery target; a USB-attached phone is not required. It does **not** mean an App Store production release.

[Expo's official iOS submission guide](https://docs.expo.dev/submit/ios/) documents cloud iOS build and submission without local Xcode. [TestFlight](https://docs.expo.dev/submit/testflight/) handles installation after Apple processing. A paid Apple Developer Program team with App Store Connect access is required; ordinary Apple ID ownership or a free Personal Team alone is insufficient.

## Prepared in this repository

- `eas.json` has a `testflight` store-distribution Release build for a real device, not a simulator or development client. Build numbers use EAS remote versioning/autoincrement to avoid reusing an already-uploaded number once the intended project is linked.
- Submission is a separate explicit command. There is no automatic build/submit workflow, public invitation link or external testing group.
- `.easignore` excludes native generated directories, local dependencies/output, logs, environment files, signing material and the example server. Never add provider keys to `EXPO_PUBLIC_*`, source, assets or a build profile.
- The app's bundle ID is `co.innosage.labs.airecorder`. Its ownership and App Store Connect record must be verified against the intended team before any cloud build/upload.

## Required account setup, checked before execution

1. Authenticate the intended existing Expo account and verify its project/organization and available build quota. The repository currently has no linked EAS project. Creating/linking a project must use the intended account; do not guess an organization or create a paid plan.
2. Authenticate the intended App Store Connect account, verify the paid team and app record matching the bundle ID, and confirm distribution/upload permission. Choose an existing app when appropriate. A new paid membership, new legal agreement, signing/upload credential creation or expanded service access requires the applicable owner action/authorization.
3. Identify the already authorized distribution certificate/profile and upload credential route. EAS may offer to generate/manage credentials or an App Store Connect API key; do not approve that silently. Do not paste Apple passwords, app-specific passwords, private keys or tokens into chat or commit them. Use the supported secure authentication flow/approved storage.
4. Determine whether the owner's Apple account is already an internal tester of this app. If not, external TestFlight testing can require Beta App Review. Do not grant the owner an unnecessary App Store Connect administration role just to avoid review. Do not create public testing links or invite other people.
5. Resolve any Apple agreement, export-compliance, beta review or metadata question using verified facts and required owner approval. This repository does not predeclare an export-compliance answer or accept legal terms.

## Commands after account/project/signing prerequisites are authorized

Run from `examples/ai-recorder`, using the official `eas-cli` npm package:

1. `npm run typecheck`, `npm run test:platform` and (Node 24) `npm run test:transcript`.
2. `npx eas-cli whoami` to verify the selected Expo account. If unauthenticated, use the supported sign-in flow; do not guess credentials.
3. Link/configure only the verified intended project, then inspect `npx eas-cli config --platform ios --profile testflight` and ensure secrets are absent from public app configuration. Before any upload, run `npx eas-cli build:inspect --platform ios --profile testflight --stage archive --output /tmp/ai-recorder-testflight-archive` into a fresh local output directory, then inspect the actual archive contents. This application is nested in a larger repository; `.easignore` patterns alone do not prove the archive scope. Reject unrelated private files, logs, environments, credentials, databases and recordings. Do not upload until the exact archive is verified.
4. `npm run ios:testflight:build`. Inspect any credential, account, cost or legal prompt before acting. Use the existing authorized free quota only when confirmed; no upgrade/extra paid build is preapproved.
5. Record the exact candidate Git SHA, EAS build ID, app version/build number and successful signed IPA result. A cloud build can expose native compilation issues that JavaScript exports cannot catch.
6. `npm run ios:testflight:submit`, selecting that exact verified build and the verified App Store Connect app. Do not submit a different/latest build accidentally. The separate submission profile intentionally leaves the private app ID/account binding to authenticated setup rather than committing a guessed value. Noninteractive submission requires the verified `ascAppId` and an already authorized upload credential.
7. Wait for App Store Connect processing; resolve any reported compliance/review blocker rather than claiming success from upload alone. Enable the build only for the owner using the correct authorized tester route. An internal tester needs existing eligible App Store Connect access; an external tester may need Beta App Review and a private invitation to the verified Apple account email.
8. Verify the owner can see/install the exact build in TestFlight, then use the recording/playback/Files import/relaunch/provider checklist in `IOS_DEVELOPMENT.md`. A TestFlight build is Release and does not offer a Metro/JS development debugger; report that the original issue's local-debugging requirement remains separately unverified rather than treating TestFlight as a substitute for debugger attachment.

No Apple account identity, team ID, device identifier or credential belongs in public evidence. Report only app/build identity, exact revision, processing/testing status, and redacted outcomes. Keep issue #51 open until the revised acceptance and any retained local-debugging requirement are satisfied or explicitly changed by its owner.

## Current readiness

Code/configuration preparation, iOS prebuild/export, shared tests, independent review and Android regression are complete. Actual cloud build, signed IPA, upload, App Store Connect processing and TestFlight installation have not occurred. This Mac has no saved Expo authentication, exposed Apple upload credentials or valid signing identity. The intended Apple team's membership/app permissions and tester account are not yet verified. No account was created, no credential generated/transmitted and no cloud build quota was spent during preparation.
