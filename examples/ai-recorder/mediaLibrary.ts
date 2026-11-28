import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { requireNativeModule } from 'expo';
import type { ImportSelection } from './libraryImport';

const recordings = new Directory(Paths.document, 'recordings');

// Native Recorder sources are managed by the platform file adapter.
export async function verifyTranscriptionMedia(_file: File, _signal?: AbortSignal) { return true; }

export function listRecordings() {
  if (!recordings.exists) return [];
  return recordings.list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.m4a'))
    .sort((a, b) => Number(b.name.split('-')[1]) - Number(a.name.split('-')[1]));
}

export function playbackSource(file: File) {
  return { uri: file.uri, release: () => {} };
}

export async function pickAudio(): Promise<ImportSelection | undefined> {
  const selection = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (selection.canceled) return;
  const asset = selection.assets[0];
  const cached = new File(asset.uri);
  let handle: ReturnType<File['open']> | undefined;
  return {
    name: asset.name,
    get size() { return cached.size; },
    async read(offset, length) {
      handle ??= cached.open(FileMode.ReadOnly);
      handle.offset = offset;
      return handle.readBytes(length);
    },
    decodedSamples: () => requireNativeModule('RecorderMediaProbe').decodedSamples(cached.uri),
    async commit(id) {
      recordings.create({ idempotent: true });
      const destination = new File(recordings, id);
      const staged = new File(recordings, id + '.pending');
      const label = new File(recordings, id + '.name');
      if (destination.exists || label.exists || staged.exists) throw new Error('Recording ID in use');
      // Only the last rename makes the recording visible to listRecordings.
      try {
        await cached.copy(staged);
        if (staged.size !== cached.size) throw new Error('Incomplete recording copy');
        await label.write(asset.name);
        await staged.move(destination);
      } catch (error) {
        if (label.exists) label.delete();
        throw error;
      } finally {
        // File.move updates the File object's URI. Reopen the staging path.
        const pending = new File(recordings, id + '.pending');
        if (pending.exists) pending.delete();
      }
    },
    dispose() {
      try { handle?.close(); } finally { if (cached.exists) cached.delete(); }
    },
  };
}
