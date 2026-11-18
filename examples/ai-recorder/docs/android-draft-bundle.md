# Local Android Draft editor build

This Recorder integration uses a focused editor built from the canonical
private Draft repository. Keep the Draft checkout, compiled web assets and
any Android package containing them private. A public Git commit should contain
only the integration source and build instructions, never the assets, AAR or
APK. The public source remains buildable without the private editor; this does
not qualify it as the offline Draft Recorder build.

1. Check out the exact reviewed Draft source revision in a clean, authorized
   worktree. Follow that repository's normal dependency setup. From that
   Draft worktree, run `npm run build:recorder-editor`.
2. From `examples/ai-recorder`, stage that build with
   `node scripts/stage-recorder-draft.mjs /path/to/private/draft "$DRAFT_SOURCE_SHA"`.
   The command checks repository identity, clean SHA and the built release
   manifest before copying regular files into the ignored Android asset
   directory. It refuses to overwrite an existing staged bundle. Save its
   source revision and tree SHA-256 with private build verification.
3. Use the usual Android build toolchain for this Recorder app. Verify
   `assets/recorder-draft/release.json` in the final Android package against
   the reviewed Draft source revision. A library `.aar` by itself is not an
   installable Recorder artifact and does not verify the app's UI, offline
   WebView, keyboard, or save/reopen journey.

The WebView must use the paired Draft close protocol: a successful Back receipt
explicitly confirms the editor was sealed after any IME commit and durable save.
Older, unsealed receipts are not accepted. A timed-out Back cancels only its own
flush and lets the same editor continue; it must never silently discard new input.

Use synthetic data for Android evidence and route acceptance separately from
publication. Do not commit screenshots or logs with recordings, account
information, or other private paths.
