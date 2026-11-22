# Android Library speaker probe

Related to [Labs #101](https://github.com/innosage-llc/innosage-labs/issues/101).
This diagnostic checks what the installed app emits when you tap a specific
Library Play control. It connects to the emulator's speaker stream before the
tap and retains PCM, the Library hierarchy and a JSON result. Four
frequency bands per marker make the check tolerant of the app's AAC encoding,
volume changes and leading silence. B passes only when all four B tones recur
and the capture does not also match A.

## Run the offline recording journey

Use Node 24, the installed Android Emulator, and an empty task-owned
`labs85-` Pixel 8 AVD with its default 1080×2400 portrait display and 420 dpi.
The supported setup on the Mac Studio is emulator 37.2.13.0 (16740729) and the
Android 16 API 36 Google APIs arm64 system image (revision 7). Use an ordinary
Release APK built locally with the embedded JS bundle. The existing
[local startup gate](../../../scripts/recorder-gate/README.md) describes that
build. Use separate task-owned Android state, ADB, npm and Gradle caches.

Start ADB restricted to the dedicated serial and boot the task AVD using
unused loopback ports. In this example, use the environment variables of your
task-owned directories and the installed SDK.

```sh
export ANDROID_ADB_SERVER_PORT=5101 ADB_SERVER_SOCKET=tcp:localhost:5101
adb -L tcp:localhost:5101 --one-device emulator-5680 server nodaemon
```

In another shell with the same Android state and ADB endpoint:

```sh
env -u QEMU_AUDIO_DRV QEMU_AUDIO_IN_DRV=none   "$ANDROID_HOME/emulator/emulator" -avd labs85-101-audio -port 5680   -grpc 8611 -grpc-use-token -audio none -no-window -no-snapshot   -no-boot-anim -camera-back none -camera-front none -gpu swiftshader_indirect -no-metrics
```

Find `pid` in the emulator's printed discovery filename `pid_<pid>.ini`.
Keep its contents private. Set airplane mode on and disable Wi-Fi and mobile
data **on the dedicated emulator** before starting Recorder.

```sh
adb_task() { adb -H localhost -P 5101 -s emulator-5680 "$@"; }
adb_task shell cmd connectivity airplane-mode enable
adb_task shell svc wifi disable
adb_task shell svc data disable

node examples/ai-recorder/scripts/android-speaker-probe.mjs journey   5101 emulator-5680 labs85-101-audio "$pid" "$apk" "$task/new-journey"
```

The command installs the supplied APK and requires an empty Library. For a new
trial use a fresh task AVD or reset only the previous trial's synthetic app
data **before** invoking the command. Keep the saved data intact during the
tested process restart. The script uses normal guest permission prompts,
Start recording, Stop & save, Library and Play. While the native Recorder
microphone operation is active, it sends eight seconds of deterministic
48 kHz mono PCM via the emulator's authenticated virtual input after a
two-second silent primer in the same recording. The
`QEMU_AUDIO_IN_DRV=none` configuration excludes physical host microphone
input. Each injection connection is closed before playback measurement.

The test checks that each save added a distinct Library row. It records the
old PID, force-stops it, confirms that the process is gone, cold-launches
offline and checks both rows in the new process. It captures the guest's
speaker stream independently and checks for B after tapping B. It uses the
same B assertion to reject the idle speaker capture and the playback of A,
which must independently identify as A. The run exits nonzero if required
evidence is missing. `result.json` records the source revision, APK digest,
guest build, launch process identity, timings and marker results. Keep the
PCM and UI snapshots local. Each capture uses a new evidence directory.

The Stop tap is tied to this Pixel 8 display profile because the live timer
can keep UIAutomator from producing a fresh hierarchy. The test checks the
display and active recording, and then requires Saved confirmation and a
distinct new Library entry. Other controls use fresh UI hierarchy labels.

This command is opt-in. The existing Android, iOS and Web cold-start checks
retain their own scope. The audio journey needs an isolated audio-configured
emulator and a fresh synthetic Library. Keep it out of pre-merge until
repeatability and runtime justify adoption.

## Verify repeat capture and recording detail

For the redesigned Library in [Labs #120](https://github.com/innosage-llc/innosage-labs/issues/120),
run the same command with `journey-detail` in place of `journey`. Keep the
dedicated emulator offline and start with an empty Library. The probe saves A,
starts B from the same Record control, and verifies that the control returns
to the same position after each save. It terminates and cold-launches Recorder
before selecting the earlier recording. The earlier row must open silently,
and explicit Play must emit A. It plays B as a separate positive control and
checks that both the detail Back control and Android Back return to the list.

The result retains the APK and screenshot hashes alongside the speaker
evidence. Keep the raw screenshots, PCM, and emulator discovery data local.

## Replay the speaker controls

Use Node 24, an installed Android Emulator and a **task-owned** `labs85-` AVD
with the built-in microphone and speaker configured. The verified setup used
macOS 26.6.2 arm64, emulator 37.2.13.0 (16740729), Pixel 8, Android 16 / API
36 Google APIs arm64, and the existing local Release APK with embedded JS.
Use a separate ADB server restricted to the dedicated serial. Pick unused
loopback ports and set task-owned Android, npm and Gradle state before launch.

```sh
# Run on the task's own AVD. Use unused ports if these are occupied.
export ANDROID_ADB_SERVER_PORT=5101 ADB_SERVER_SOCKET=tcp:localhost:5101
adb -L tcp:localhost:5101 --one-device emulator-5680 server nodaemon
```

In a second shell with the same environment, choose absolute paths for
`task` (private evidence and AVD state) and `ANDROID_HOME` (installed SDK).
Generate a silent input fixture and boot the audio backend. The WAV driver
uses only the designated files, and microphone passthrough stays off.

```sh
probe=examples/ai-recorder/scripts/android-speaker-probe.mjs
node "$probe" fixture silence "$task/backend-input.wav"
QEMU_AUDIO_DRV=wav QEMU_WAV_FREQUENCY=16000 \
  QEMU_WAV_IN_PATH="$task/backend-input.wav" QEMU_WAV_PATH="$task/backend-output.wav" \
  "$ANDROID_HOME/emulator/emulator" -avd labs85-101-audio -port 5680 \
  -grpc 8611 -grpc-use-token -no-snapshot -no-window -no-boot-anim \
  -camera-back none -camera-front none
```

Install the ordinary offline-built Release APK via the dedicated serial. Set
airplane mode on and disable guest Wi-Fi and mobile data before starting
Recorder. The probe checks airplane mode and no active default network before
and after playback, and verifies host microphone passthrough is off.

```sh
adb_task() { adb -H localhost -P 5101 -s emulator-5680 "$@"; }
adb_task shell cmd connectivity airplane-mode enable
adb_task shell svc wifi disable
adb_task shell svc data disable
for clip in A B silence; do
  node "$probe" fixture "$clip" "$task/Labs101-$clip.wav"
  ffmpeg -hide_banner -loglevel error -i "$task/Labs101-$clip.wav" \
    -c:a aac "$task/Labs101-$clip.m4a"
  adb_task push "$task/Labs101-$clip.m4a" /sdcard/Download/
done
```

FFmpeg is only needed to make the imported calibration files. In Library,
use **Import audio** to choose the three fixtures from Downloads. Find
`pid` in the emulator's printed discovery filename `pid_<pid>.ini`.
Keep its contents private. From the Labs root, run these commands with a fresh
directory for each capture. Wait for each command to exit before starting the
next one.

```sh
node "$probe" observe 5101 emulator-5680 labs85-101-audio "$pid" \
  'Play Labs101-B.m4a' B "$task/positive-B"
node "$probe" observe 5101 emulator-5680 labs85-101-audio "$pid" \
  'Play Labs101-A.m4a' B "$task/stale-A"
node "$probe" observe 5101 emulator-5680 labs85-101-audio "$pid" \
  'Play Labs101-silence.m4a' B "$task/silence"
```

Expect exit 0 for B and exit 1 for A and silence. Inspect `result.json` to
confirm the intended failures. Stale A must report marker A and silence must
supply PCM with no recognized marker. A transport or setup failure also exits
nonzero and does not count as a negative control. To rerun the exact content
assertion from a previously captured stream, use
`node "$probe" score B "$task/stale-A/speaker.pcm"`. The score reads raw
16 kHz mono little-endian signed 16-bit PCM from the speaker stream.

## Recording-input investigation

The offline Release build from Labs
[`0d2a86d`](https://github.com/innosage-llc/innosage-labs/commit/0d2a86dfaf1db0f9551d986aa1409a69aad7526e)
took 2m 8s and produced APK SHA-256
`0200c2076e9a4690eb0621deecad262cb4dac2db3e1943d362da867f86dbb905`.
The tests used separate task caches and a serial-restricted ADB server.
All speaker samples below were taken after the source stream had closed.
These are initial feasibility results. See the journey setup above for the later
configuration confirmed with the [#95 recovery evidence](https://github.com/innosage-llc/innosage-labs/pull/99).

| Input experiment | Observed result |
| --- | --- |
| Default CoreAudio backend, 16 kHz mono gRPC while permission dialog was open | Emulator exited 139. The crash report for the same process put SIGSEGV in `audio_forwarder_enable`. That attempt used an earlier feasibility APK. |
| Emulator `-audio wav` switch, 16 kHz realtime after Record was active | CoreAudio still handled input and could not create `virtio-snd-mic0`. The forwarder crashed again. |
| Explicit `QEMU_AUDIO_DRV=wav` with host input off, file backend only | Record and Save worked. Real Library playback yielded 137,859 samples at 16 kHz and neither marker matched. |
| API 36, explicit WAV driver, 16 kHz realtime gRPC after Record was active | Injection RPC completed. Library playback yielded 137,077 samples and neither marker matched. |
| API 36, explicit WAV driver, 48 kHz mono blocking gRPC after Record was active | Android reported an active, unsilenced built-in microphone track. The RPC completed, but Library playback yielded 136,903 samples and neither marker matched. |
| API 36, alternate virtual sound card (`-feature -VirtioSndCard`) | Record, Save and the RPC completed. The speaker stream supplied zero samples. |
| API 36, default sound card, 44.1 kHz mono gRPC opened before Record | Emulator exited 139 during input setup. |
| API 35, default sound card, explicit WAV driver, 44.1 kHz mono blocking gRPC after Record was active | RPC completed. Actual Library playback yielded 139,760 samples and neither marker matched. |
| API 36, same image and emulator as #95, `QEMU_AUDIO_IN_DRV=none -audio none`, 48 kHz PCM sent after AppOps confirmed active Record | The 600, 1000 and 1600 Hz source tones were present in the independently captured Library PCM. This was a one-clip routing proof. |
| API 36, known B imported for output calibration | Library playback yielded 121,760 samples. B matched with 8, 11, 15 and 15 qualifying windows across its four frequencies. |

For an input diagnostic, use the installed
`emulator/lib/emulator_controller.proto` with the
[Android Emulator gRPC client](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android/android-grpc/python/aemu-grpc).
Open Record and accept only the normal guest microphone prompt. After **Stop
& save** appears, submit 6 seconds of synthetic marker A, 20 ms per
`injectAudio` packet, via the same loopback endpoint. Set the format on the
first packet, send signed 16-bit mono PCM, and close the input RPC before
stopping the recording. Identify the new row in Library and apply the same
speaker assertion with expected marker A. Keep RPC status, the cue's sample
rate and delivery mode, device and build identity, guest AudioFlinger state,
and the PCM receipt. RPC success cannot substitute for audible content.
