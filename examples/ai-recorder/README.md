# AI Recorder

An Android Expo example for recording a conversation while the screen is locked
or another app is in front. Recordings are AAC in an M4A container. Finished files
are stored in the app's documents directory and available for offline playback
after reopening the app.

Use Node 24, a JDK and an Android SDK compatible with Expo SDK 58. Connect an
Android phone with USB debugging or start an emulator, then run:

```sh
npm ci
npm run android
```

This sample needs a native build because Expo Audio configures a microphone
foreground service. [Expo Audio background recording](https://docs.expo.dev/versions/latest/sdk/audio/#recording-audio-in-the-background)
describes the service and notification. The app asks for microphone permission and
offers notification permission so Android can show the ongoing recording.

1. Start recording in the app and say “before lock.”
2. Lock the screen, wait briefly and say “while locked.”
3. Unlock, switch to another app and say “in background.”
4. Return to Recorder, stop, and play the saved M4A. Check that all three phrases
   appear in order. Reopen the app and play it again with airplane mode on.

Start each recording from the visible app. Stop the recording before force-stopping
or uninstalling the app. Android app storage is removed on uninstall. This example
covers Android capture and playback. Those features work offline without a server.

Engineering verification used an Android API 36 emulator with no default
network. The recording service remained active while the emulator was asleep
and while Settings was foregrounded. Stopping added a playable 19-second AAC
M4A to the list immediately. Playback started after a cold relaunch. Physical
phone acceptance and spoken-marker continuity remain separate checks.

## Transcription milestone

Build with `EXPO_PUBLIC_RECORDER_GATEWAY_URL` set to your HTTPS Gateway base URL.
The acceptance build uses a public staging endpoint. Opening Transcript provisions
a device guest credential and retains it in Expo SecureStore. The phone needs
ordinary internet access. A VPN, service credential or manual token entry is not
part of this journey. Without a build URL, the sample offers manual pilot setup.

The single-worker FastAPI Gateway uses SQLite and the Speech Router's
Recorder-specific Free Guest profile. Configure these server-only variables:

- `RECORDER_DB`, a private SQLite database path.
- `RECORDER_ROUTER_URL`, the Router HTTPS origin or loopback forward.
- `RECORDER_ROUTER_TOKEN`, the Router service credential.
- Optional `RECORDER_PILOT_TOKEN`, a random credential for manual pilot setup.

Install `server/requirements.txt` in a virtual environment, then run
`uvicorn gateway:app --app-dir server --host 127.0.0.1 --port 8785 --workers 1 --no-access-log`
behind HTTPS. For this bounded staging milestone, the existing staging Router
can forward its explicitly enabled `/recorder` paths to the private Gateway.
Guest registration is capped at 1,000 identities per deployment. Production
onboarding, account recovery and public distribution need a later milestone.

Each guest can retrieve only its own operations. The Gateway buffers an upload
up to the existing Free limit before forwarding it. The Router owns decoded
duration, size and admission limits. A saved operation ID recovers the same
Router job after ambiguous network failure. An expired or terminal failed job
requires an explicit new transcription. Global ASR concurrency remains one.

The Gateway commits the original transcript before reporting completion and
cleaning up the upstream artifact. Original and edited transcripts are also
retained separately on the phone. Reopening a saved transcript works offline.
The staging Gateway stores originals server-side. It does not provide server-side
editing or cross-device synchronization in this milestone.

### Identify speakers

Before a new transcription, optionally turn on **Identify speakers**. The default
is off. The selection belongs to the saved operation and stays fixed during
retry/recovery. Existing recordings and plain-mode operations remain readable.
The staging Router must already support speaker attribution; unavailable
admission offers an explicit new transcription with the switch off.

Attributed editable text uses Speaker 1 / Speaker 2 and Unknown speaker labels.
These labels distinguish voices within the recording. The plain original,
speaker attribution and saved revision are retained independently on the phone.
An attribution failure leaves the plain transcript available with a visible
message. Speaker processing may take longer than plain transcription.

Saved word-level speaker timelines are presented as readable same-speaker
paragraphs using the original transcript's punctuation and spacing. Reopening
an existing result applies the presentation fix without another transcription.
Custom saved revisions remain editable as saved. If source words do not align,
the existing attributed text is retained rather than guessing missing words.

## InnoSage Pro access

Open **Transcription service** and choose **InnoSage · Staging** or
**InnoSage · Production**. The default remains Staging on upgrade. Changes apply
only to new transcriptions; saved and in-flight jobs keep their original service.
The transcript screen shows that actual service, even if the default has changed.

Enter the matching environment's Pro key and choose **Verify and save key**.
The masked field clears after saving and when switching services. Each service
has a separate encrypted SecureStore profile; removing one key leaves the other
untouched. Validation and new paid admissions use the canonical paid API.
Keys are never migrated, silently retried against another service, or sent to
Router/Edge. A staging key is not a production key.

Production uses the existing paid Draft Worker at `https://api.draft.innosage.co`
and Router at `https://speech-router.innosage.co:8443`. Staging uses
`https://api-staging.draft.innosage.co` and `https://rd.innosage.co:8443`.
These origins are fixed in `ServiceConfig.ts`; the old Pro build environment
variables no longer control runtime routing. No backend deployment is required.
The Recorder Free gateway is staging-only; production requires a production Pro
key and never silently falls back to staging. New staging jobs can choose Free.
Existing Free jobs retain their legacy Gateway connection and recovery identity.

For the personal Android OpenAI pilot, choose **OpenAI** in **Transcription
service**, then verify and save your OpenAI Platform project key. The project
needs access to GPT-Transcribe and sufficient API quota. The key is stored
in device SecureStore. Recorder sends a new M4A under 25 MB directly to OpenAI
over HTTPS. The first transcription verifies actual access and uses your
project quota. The result and any revisions are stored locally. Reopen the
recording to read or manually play the original audio.

Paid transcription follows the existing four-hour decoded-duration policy.
This sample enforces the effective512MiB source limit. Router's larger source
advertisement is tracked separately in Infra #205. Audio hashing reads1MiB at a
time; the Android Expo module uploads the app-private file in64KiB chunks using
fixed-length HTTPS, redirect refusal and cancellation. Originals and attributed
text are saved before remote cleanup. Retained capabilities allow same-operation
cleanup recovery. This Android milestone's real Pro and long-audio acceptance is
recorded separately from deterministic protocol tests.

Run `npm run test:transcript` and `npm run typecheck` for local protocol checks.

### Import an existing Android recording

Tap **Import audio** and select an M4A from Android Files. Recorder keeps a local
copy and shows its original filename in Recordings. Use **Play** to listen or
**Transcript** to transcribe with the selected service. That service's limits
apply when submitting. Reopening the app keeps the imported audio and any
saved transcript.
