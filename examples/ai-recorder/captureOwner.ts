import { Platform } from 'react-native';
import { getFinalizedCapture } from './finalizedCapture';
import {
  AudioModule,
  RecordingPresets,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { CaptureSession } from './captureSession';
import { microphonePermissionMessage, recordingSavedMessage } from './ui/recordFeedback';

let session: CaptureSession | undefined;

/** Activity recreation replaces the screen, not this runtime-scoped capture owner. */
export function getCaptureSession() {
  if (!session) {
    // Same platform options as the installed useAudioRecorder(HIGH_QUALITY) hook.
    const { android, ios, web, ...common } = RecordingPresets.HIGH_QUALITY;
    const options = { ...common, isMeteringEnabled: false,
      ...(Platform.OS === 'ios' ? ios : Platform.OS === 'web' ? web : android) };
    const recorder = new AudioModule.AudioRecorder(options);
    const recovery = getFinalizedCapture(recorder, options);
    session = new CaptureSession({
      recorder,
      recover: recovery?.recover,
      prepare: recovery?.prepare,
      microphone: requestRecordingPermissionsAsync,
      notification: () => Platform.OS === 'android' ? requestNotificationPermissionsAsync() : Promise.resolve(),
      audioMode: () => setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: true, playsInSilentMode: true }),
      permissionMessage: canAskAgain => microphonePermissionMessage(canAskAgain, Platform.OS),
      savedMessage: recordingSavedMessage,
      save: async url => {
        if (recovery) return recovery.save(url);
        const source = new File(url);
        if (!source.exists || !source.size) throw new Error('Recording file is empty.');
        const recordings = new Directory(Paths.document, 'recordings');
        recordings.create({ idempotent: true });
        const saved = new File(recordings, `Recording-${Date.now()}-${source.name}`);
        await source.move(saved);
        return saved.uri;
      },
    });
  }
  return session;
}
