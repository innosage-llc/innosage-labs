import type { AudioRecorder } from 'expo-audio';
export type CapturePersistence = {
  recover(): Promise<unknown>;
  prepare(): Promise<void>;
  save(uri: string): Promise<string>;
};
// iOS retains its existing save path; the Android-only module is never loaded.
export function getFinalizedCapture(
  _recorder: AudioRecorder, _options: Parameters<AudioRecorder['prepareToRecordAsync']>[0],
): CapturePersistence | undefined { return undefined; }
