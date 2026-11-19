import { requireNativeModule } from 'expo';
import { randomUUID } from 'expo-crypto';
import type { AudioRecorder } from 'expo-audio';
import type { CapturePersistence } from './finalizedCapture';
export function getFinalizedCapture(
  recorder: AudioRecorder, options: Parameters<AudioRecorder['prepareToRecordAsync']>[0],
): CapturePersistence {
  const native = requireNativeModule<{
    recoverFinalizedRecordings(): Promise<string[]>;
    commitFinalizedRecording(uri: string): Promise<string>;
  }>('RecorderUpload');
  return {
    recover: () => native.recoverFinalizedRecordings(),
    prepare: () => recorder.prepareToRecordAsync({ ...options,
      directory: 'document', fileName: `Recording-${Date.now()}-${randomUUID()}`,
    }),
    save: uri => native.commitFinalizedRecording(uri),
  };
}
