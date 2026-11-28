import { Directory, File, Paths } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';

const recordings = new Directory(Paths.document, 'recordings');

// Native Recorder sources are managed by the platform file adapter.
export async function verifyTranscriptionMedia(_file: File) { return true; }

export function listRecordings() {
  if (!recordings.exists) return [];
  return recordings.list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.m4a'))
    .sort((a, b) => Number(b.name.split('-')[1]) - Number(a.name.split('-')[1]));
}

export function playbackSource(file: File) {
  return { uri: file.uri, release: () => {} };
}

export async function pickAudio(): Promise<string | undefined> {
  let cached: File | undefined;
  let label: File | undefined;
  let imported = false;
  try {
    const selection = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (selection.canceled) return;
    const asset = selection.assets[0];
    cached = new File(asset.uri);
    if (!asset.name.toLowerCase().endsWith('.m4a')) {
      return 'Choose an M4A audio file.';
    }
    if (!cached.exists || !cached.size) {
      return 'The selected audio file is empty or unavailable.';
    }
    recordings.create({ idempotent: true });
    const name = `Import-${Date.now()}-${randomUUID()}.m4a`;
    label = new File(recordings, name + '.name');
    await label.write(asset.name);
    await cached.move(new File(recordings, name));
    cached = undefined;
    imported = true;
    return 'Audio imported to this device.';

  } finally {
    try {
      if (cached?.exists) cached.delete();
      if (!imported && label?.exists) label.delete();
    } catch {
      // A cache cleanup failure must not leave the import controls disabled.
    }
  }
}
