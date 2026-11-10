# Studio Workspace

A small local-first Expo reference application for Projects, Tasks, Notes and Tags.
No account, backend, cloud synchronization or AI service. Data stays in local app
storage; uninstalling the application can remove it. Synthetic demo data is
optional and never automatically replaces existing work.

## Develop

Node24 and the ordinary Expo native toolchain are required. From this directory:

```sh
npm ci
npm run verify:snapshot
npm test
npm run typecheck
npm start
```

Android is the runtime acceptance target. Use a dedicated emulator, not an
implicitly selected attached physical device. `npm run build:android` builds an
arm64 Release APK. Install using an explicit emulator serial. `npm run build:ios`
performs a generic simulator-target native Release build; it requires full Xcode
and its platform SDK. `npm run export:web` creates the Web production export.
Neither iOS nor Web runtime support is claimed by a successful build alone.

## Source and license

The `ui/` directory contains exactly four original MIT files from InnoSage UI
System0.1.0 Experimental. `.innosage-ui-manifest.json` records component IDs,
source and release commits, metadata hashes, source/local hashes and dependencies.
The canonical registry is maintained by InnoSage Design; this example is a
consumer, not a second authority. The snapshot can be used under its included MIT
license without access to the private authoring repository.

The offline verifier checks local consistency, not remote authenticity. A
maintainer with access to the canonical source must verify metadata hashes at the
recorded release commit before accepting a snapshot update. Never copy private
Brain material, Skills, evidence or logs into this public example.

The app uses Expo/React Native and their separately licensed dependencies.
NativeWind and Expo UI are retained at the qualified baseline versions; local
persistence uses Expo58-compatible AsyncStorage2.2.0. The lockfile is authoritative.

## Data behavior

The saved document has a version and validated item relationships. Invalid or
unsupported stored data causes an explicit load error; it is not silently replaced
with an empty workspace. Changes report success only after a local write succeeds.
Project deletion keeps tasks/notes and unassigns them. Tag deletion removes its
references. No operation uploads content.

Implementation and platform validation are in progress; this README does not
claim a finished runtime acceptance until the accompanying verification record
is complete.

## Preview small UI changes

Use a populated demo workspace to review one change at a time. For Web, run
`npm start -- --web --localhost` without `CI=1` so Metro can watch source changes.
For Android, use a local debug build and keep Metro running for Fast Refresh.
Rebuild the native binary when native dependencies or configuration change.
Keep the Release APK for phone handoff and release checks.

Use a dedicated emulator for agent-driven previews. [Expo's agent-device guide](https://docs.expo.dev/agents/agent-device/)
covers opening an installed app, inspecting semantic controls and capturing
screenshots. Select the emulator explicitly when a phone is also connected.
