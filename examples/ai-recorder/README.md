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
