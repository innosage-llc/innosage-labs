import { AudioRecorderWeb } from 'expo-audio/build/AudioRecorder.web';
import { RecordingPresets } from 'expo-audio';
import { CaptureSession } from './captureSession';
import { loadFiles, storeAudio } from './localFiles.web';
import { recordingSavedMessage } from './ui/recordFeedback';

let session: CaptureSession | undefined;
export function getCaptureSession() {
  if (!session) {
    const supported = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus']
      .find(mime => globalThis.MediaRecorder?.isTypeSupported(mime));
    const options = { ...RecordingPresets.HIGH_QUALITY, mimeType: supported };
    session = new CaptureSession({
      recorder: new AudioRecorderWeb(options),
      // prepareToRecordAsync opens the microphone once, after the actual Start gesture.
      microphone: async () => ({ granted: !!supported && !!navigator.mediaDevices?.getUserMedia, canAskAgain: true }),
      permissionMessage: () => 'This browser needs microphone access on a secure page to record.',
      startErrorMessage: error => {
        if (!(error instanceof DOMException)) return;
        if (error.name === 'NotAllowedError') return 'Microphone access was denied. Allow the microphone for this site in your browser settings, then try again.';
        if (error.name === 'NotFoundError') return 'No microphone is available to this browser.';
        if (error.name === 'NotReadableError') return 'The browser could not open the microphone. Check the device, then try again.';
      },
      notification: async () => {}, audioMode: async () => {},
      recover: loadFiles,
      save: async uri => {
        try { return await storeAudio(await (await fetch(uri)).blob()); }
        finally { URL.revokeObjectURL(uri); }
      },
      savedMessage: recordingSavedMessage,
    });
  }
  return session;
}
