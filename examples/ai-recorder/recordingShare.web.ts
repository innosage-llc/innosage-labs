import type { File } from 'expo-file-system';

import type { AudioShareOutcome } from './recordingShare';

export async function shareRecording(_recording: File, _label: string): Promise<AudioShareOutcome> {
  return 'unavailable';
}
