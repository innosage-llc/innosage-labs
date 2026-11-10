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
covers Android capture and playback. It has no server dependency.

Engineering verification used an Android API 36 emulator with no default
network. The recording service remained active while the emulator was asleep
and while Settings was foregrounded. Stopping added a playable 19-second AAC
M4A to the list immediately. Playback started after a cold relaunch. Physical
phone acceptance and spoken-marker continuity remain separate checks.

## Transcription milestone

The Transcript action connects to a privately deployed AI Recorder Gateway.
Enter its HTTPS origin and a provisioned pilot access token once. The app keeps
that credential in Expo SecureStore. Use a separate random pilot token for each
private workspace. It authorizes access to that workspace's saved transcripts.

The gateway uses FastAPI with one worker, SQLite, and the Speech Router's
Recorder-specific Free Guest profile. Set these private environment variables on
the host:

- RECORDER_PILOT_TOKEN, a random string of at least 32 characters.
- RECORDER_DB, the path to a private SQLite database.
- RECORDER_ROUTER_URL, the staging Router HTTPS origin or a loopback forward.
- RECORDER_ROUTER_TOKEN, the Router service credential.

Install server/requirements.txt into a virtual environment, then run
`uvicorn gateway:app --app-dir server --host 127.0.0.1 --port 8785 --workers 1 --no-access-log`
behind your private authenticated HTTPS ingress.

The gateway buffers one bounded upload before passing it to the Router. The
Router owns size, decoded duration and job admission. Repeated submissions for
the same operation recover the same Router session. The gateway commits the
original transcript before acknowledging completion and upstream cleanup.
Original and edited transcripts are also retained separately on the phone.

The pilot gateway is one private workspace per deployment. It stores the original
transcript on the server and the original plus current revision on the phone.
