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

Open **InnoSage Pro**, enter the API key for the build's environment, then choose
**Verify and save key**. Validation uses Draft's maintained paid transcription
identity endpoint and canonical Gateway entitlement. The masked field clears
after saving. The retained key is encrypted in Expo SecureStore and can be
removed from this screen. New premium operations require canonical authorization.

With verified Pro access, new recording transcriptions default to Pro. The user
can explicitly choose Free before starting. A submitted operation retains its
account, environment, speaker mode and source size through recovery. Existing
Free recordings continue through their original Gateway connection.

The Android build needs `EXPO_PUBLIC_PRO_WORKER_URL` and
`EXPO_PUBLIC_PRO_ROUTER_URL`, both fixed HTTPS origins for the same environment.
A staging key is required for staging. Worker receives the personal key and
returns scoped Router capabilities. The phone sends only the scoped upload or
control capability to Router. API keys remain on-device and in the canonical
authorization request.

Paid transcription follows the existing four-hour decoded-duration policy.
This sample enforces the effective512MiB source limit. Router's larger source
advertisement is tracked separately in Infra #205. Audio hashing reads1MiB at a
time; the Android Expo module uploads the app-private file in64KiB chunks using
fixed-length HTTPS, redirect refusal and cancellation. Originals and attributed
text are saved before remote cleanup. Retained capabilities allow same-operation
cleanup recovery. This Android milestone's real Pro and long-audio acceptance is
recorded separately from deterministic protocol tests.

Run `npm run test:transcript` and `npm run typecheck` for local protocol checks.
