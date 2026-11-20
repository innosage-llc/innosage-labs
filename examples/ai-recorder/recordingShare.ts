import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { audioShareFilename } from './audioShareFilename';
export type AudioShareOutcome = 'dismissed' | 'missing' | 'unavailable' | 'no-space' | 'failed';

const retentionMs = 24 * 60 * 60 * 1000;

function discard(directory: Directory) {
  try {
    if (directory.exists) directory.delete();
  } catch {
    // The directory remains in cache for a later cleanup.
  }
}

function discardExpired(root: Directory, now: number) {
  try {
    for (const entry of root.list()) {
      if (!(entry instanceof Directory)) continue;
      const expires = /^(\d{13})-[0-9a-f-]{36}$/i.exec(entry.name);
      if (expires && now - Number(expires[1]) >= retentionMs) discard(entry);
    }
  } catch {
    // Cache maintenance should not prevent a new handoff.
  }
}

export async function shareRecording(recording: File, label: string): Promise<AudioShareOutcome> {
  let staging: Directory | undefined;
  try {
    if (!recording.uri.startsWith('file://') || !recording.name.endsWith('.m4a') || !recording.exists) {
      return 'missing';
    }
    const sourceSize = recording.size;
    if (!sourceSize) return 'missing';
    if (!await isAvailableAsync()) return 'unavailable';

    const root = new Directory(Paths.cache, 'recording-shares');
    root.create({ idempotent: true });
    const now = Date.now();
    discardExpired(root, now);
    const available = Paths.availableDiskSpace;
    if (available > 0 && sourceSize > available) return 'no-space';

    staging = new Directory(root, `${now}-${randomUUID()}`);
    staging.create();
    const copy = new File(staging, audioShareFilename(label));
    await recording.copy(copy);
    if (copy.size !== sourceSize) return 'failed';

    await shareAsync(copy.uri, { mimeType: 'audio/mp4', UTI: 'public.mpeg-4-audio' });

    // A receiving app may open the URI after the chooser result on Android.
    // Keep the completed copy in app-private cache through the grace period.
    staging = undefined;
    return 'dismissed';
  } catch {
    return 'failed';
  } finally {
    if (staging) discard(staging);
  }
}
