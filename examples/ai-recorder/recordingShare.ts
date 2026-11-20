import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { audioShareFilename } from './audioShareFilename';

export type AudioShareOutcome = 'dismissed' | 'missing' | 'unavailable' | 'no-space' | 'failed';

const retentionMs = 24 * 60 * 60 * 1000;
const leaseName = '.last-share';
const recentSharesWithoutMarker = new Map<string, number>();

function discard(directory: Directory) {
  try {
    if (directory.exists) directory.delete();
  } catch {
    // The directory remains in cache for a later cleanup.
  }
}

function discardExpired(root: Directory, currentKey: string) {
  const cutoff = Date.now() - retentionMs;
  for (const [key, lastUsed] of recentSharesWithoutMarker) {
    if (lastUsed < cutoff) recentSharesWithoutMarker.delete(key);
  }
  try {
    for (const entry of root.list()) {
      if (!(entry instanceof Directory) || entry.name === currentKey || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      const lastUsed = recentSharesWithoutMarker.get(entry.name)
        ?? (new File(entry, leaseName).lastModified || entry.info().modificationTime);
      if (lastUsed && lastUsed < cutoff) discard(entry);
    }
  } catch {
    // Cache maintenance should not prevent a new handoff.
  }
}

async function retainShare(directory: Directory, key: string) {
  const now = Date.now();
  try {
    await new File(directory, leaseName).write(String(now));
    recentSharesWithoutMarker.delete(key);
  } catch {
    // A complete copy is shareable even if the volume cannot write its timestamp.
    recentSharesWithoutMarker.set(key, now);
  }
}

export async function shareRecording(recording: File, label: string): Promise<AudioShareOutcome> {
  let incomplete: Directory | undefined;
  try {
    if (!recording.uri.startsWith('file://') || !recording.name.endsWith('.m4a') || !recording.exists) {
      return 'missing';
    }
    const sourceSize = recording.size;
    if (!sourceSize) return 'missing';
    if (!await isAvailableAsync()) return 'unavailable';

    const filename = audioShareFilename(label);
    const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256,
      JSON.stringify([recording.uri, sourceSize, recording.lastModified, filename]));
    const root = new Directory(Paths.cache, 'recording-shares');
    root.create({ idempotent: true });
    discardExpired(root, key);

    const directory = new Directory(root, key);
    const copy = new File(directory, filename);
    // A saved recording is immutable. Reuse the complete snapshot on retry,
    // even when the remaining free space could not hold a second full copy.
    if (!copy.exists || copy.size !== sourceSize) {
      discard(directory);
      const available = Paths.availableDiskSpace;
      if (available > 0 && sourceSize > available) return 'no-space';

      directory.create();
      incomplete = directory;
      const pending = new File(directory, '.copying');
      await recording.copy(pending);
      if (pending.size !== sourceSize) return 'failed';
      // A killed copy leaves no complete, reusable filename.
      await pending.move(copy);
    }

    incomplete = undefined;
    await retainShare(directory, key);
    try {
      await shareAsync(copy.uri, { mimeType: 'audio/mp4', UTI: 'public.mpeg-4-audio' });
    } finally {
      // Measure the grace period from settlement, including a long-open chooser.
      // Android recipients may still read from the URI after this point.
      await retainShare(directory, key);
    }
    return 'dismissed';
  } catch {
    return 'failed';
  } finally {
    if (incomplete) discard(incomplete);
  }
}
