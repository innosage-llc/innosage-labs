import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import type { File } from 'expo-file-system';
import { requireNativeModule } from 'expo';

import { draftStore, type DraftKind } from './draftDocumentModel';

type NativeStorage = {
  isBundled(): boolean;
  readDocument(pageId: string): Promise<string | null>;
  writeDocument(pageId: string, contents: string): Promise<void>;
};

export function draftEditorIsBundled() {
  try { return requireNativeModule<NativeStorage>('RecorderDraftEditor').isBundled(); }
  catch { return false; }
}

export async function createDraftDocument(recording: File, kind: DraftKind) {
  const id = await digestStringAsync(CryptoDigestAlgorithm.SHA256, recording.uri + ':' + kind);
  const pageId = 'recorder-' + id;
  const disk = requireNativeModule<NativeStorage>('RecorderDraftEditor');
  return draftStore({pageId, kind}, {
    read: () => disk.readDocument(pageId),
    write: contents => disk.writeDocument(pageId, contents),
  });
}
