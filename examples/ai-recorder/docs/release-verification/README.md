# Android staging release verification

Use this local check for one release promise. After you save two distinct
recordings offline, force-stop Recorder, and reopen offline, the second saved
Library item must actually play the second recording. A row, timer, or
waveform alone is insufficient. The Founder owns the release decision.

## Prepare the candidate

Use Node, Android SDK Platform Tools (`adb`) and SDK Build Tools (`aapt2`).
Put them on your PATH or set `ADB` and `AAPT2` to the installed executables.
Reuse the embedded-JS Release APK and its `android/result.json` from the
[local Android startup gate](../../../../scripts/recorder-gate/README.md).
Take `sourceRevision` from that receipt's `candidate.tested`, and the recorded
APK SHA-256 from `artifact.files[0].sha256`. The top-level `artifact.sha256`
is the digest of the file manifest. Use the artifact's actual package version
(`aapt2 dump badging <apk>`) and calculate the receipt file digest with
`shasum -a 256 <android/result.json>`.

In a private writable directory, save a `candidate.json` like this. The
placeholders are illustrative and cannot pass verification. Paths are
relative to this file or absolute.

```json
{
  "schemaVersion": 1,
  "sourceRevision": "<40 hex from candidate.tested>",
  "versionName": "0.1.9",
  "versionCode": 10,
  "apk": "app-release.apk",
  "apkSha256": "<64 hex for staging APK>",
  "androidReceipt": "android/result.json",
  "androidReceiptSha256": "<64 hex for android/result.json>"
}
```

If a local distribution artifact is available, add an optional `distribution`
object with `artifact` (its path), `sha256` (its SHA-256), and `relationship`
(how it was produced relative to staging). A different APK or an AAB stays
`SEPARATE_UNVERIFIED` even if the tested staging build earns `PASS`. A later
candidate needs its own verification. Keep the same candidate directory
throughout the session.

## Verify on the authorized USB test phone

1. Use a dedicated Android test device and synthetic data. Install the exact
   staging APK in the approved way. For an authorized USB staging device,
   `adb -s <USB-serial> install -r <app-release.apk>` preserves existing app
   data on a compatible update. If the key or version is incompatible, stop
   and use a clean dedicated device. Never uninstall Recorder or clear data to
   make an install fit.
2. Put the phone in airplane mode, turn off Wi-Fi, and keep it offline for
   the whole journey. Open Recorder. From `examples/ai-recorder`, run:

   ```sh
   npm run verify:release -- --candidate /path/to/candidate.json --serial <USB-serial>
   ```

   Expect `PENDING_MANUAL` (exit 2) and a `before` checkpoint. Keep the printed
   `candidateId`. You can also run without `--serial` to check only local build
   evidence; that mode leaves `before` empty and cannot be confirmed.
3. In Recorder, make and save short, distinct clips using normal recording.
   For example, say “alpha one” repeatedly in the first and “bravo two” in
   the second. Make both long enough to hear clearly, and identify the second
   newly saved item so older Library recordings cannot be mistaken for it.
   Leave transcription, summaries and uploads unused.
4. Force-stop the process with Android's app info **Force stop** action (or
   `adb -s <USB-serial> shell am force-stop co.innosage.labs.airecorder`).
   Confirm it stopped, for example with
   `adb -s <USB-serial> shell pidof co.innosage.labs.airecorder` (no PID).
   Cold-open Recorder from its launcher icon while still offline. Go to
   **Library**, select the second new clip, and listen to its actual output.
5. Leave Recorder open and use an interactive terminal on the same host:

   ```sh
   npm run verify:release -- --candidate /path/to/candidate.json --serial <USB-serial> --confirm <candidateId>
   ```

   Enter `HEARD SECOND CLIP` only if you supervised the full journey and heard
   “bravo two” clearly from that item. Enter `FAILED` for wrong audio, silence,
   or a failed journey on the verified setup. Leave the response blank to
   defer. If Recorder closed or a required check already failed, the command
   reports failure without requesting confirmation.

The command rechecks the APK, startup receipt, device installation, offline
status and new PID before recording a result. It queries only the explicitly
selected device, and reads the base APK checksum on-device. If Android denies
that checksum or reports split APKs, the install is unverified. Use an
eligible staging install without changing device permissions.

## Read the result

The JSON printed in the terminal points to a local `release-<candidateId>.json`
with timestamps, candidate/build evidence, target checkpoints and any manual
result. The receipt contains hashes of the serial and install path, without
audio, credentials, or clip contents. Keep receipts private. The integrity
digest detects accidental edits and is neither a signature nor a substitute
for the supervisor.

- **0 / PASS** means the exact verified staging install passed both the
  automatic checks and the supervised listening check.
- **1 / FAIL** means required evidence, candidate identity, setup or the
  supervised check failed. Resolve the named failure and restart the
  supervised journey if needed.
- **2 / PENDING_MANUAL** means release acceptance is incomplete. A partial
  or example run cannot be counted as staging acceptance.

A completed PASS receipt is preserved if you rerun the command in its
directory. Use a fresh private directory for an independent retest. For
example, a real APK checked without a phone produces a report with this
shape (excerpt only):

```json
{
  "status": "PENDING_MANUAL",
  "reason": "A physical staging install and supervised listening are still required",
  "before": null,
  "after": null,
  "manual": null
}
```

Run the synthetic regression fixtures with `npm run test:verify-release`.
The [emulator audio probe](../android-speaker-probe.md) remains an
optional diagnostic. Its results do not affect this check.
