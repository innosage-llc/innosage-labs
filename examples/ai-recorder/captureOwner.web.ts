import { AudioRecorderWeb } from 'expo-audio/build/AudioRecorder.web';
import { RecordingPresets } from 'expo-audio';
import { CaptureSession } from './captureSession';

let session: CaptureSession | undefined;
/** Keep the real capture owner and idle recorder contract without requesting input.
 * Native storage capture is unavailable on Web; the control is explicitly disabled.
 */
export function getCaptureSession() {
  if (!session) session = new CaptureSession({
    recorder: new AudioRecorderWeb(RecordingPresets.HIGH_QUALITY),
    microphone: async () => { throw new Error('Recording is available in the native apps.'); },
    notification: async () => {}, audioMode: async () => {},
    save: async () => { throw new Error('Native file storage is unavailable on Web.'); },
    permissionMessage: () => 'Recording is available in the native apps.',
    savedMessage: '',
  });
  return session;
}
