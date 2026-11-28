import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { TransferOutcome } from './transcriptTransfer';

export const markdownTransfer = 'share-sheet' as const;

const shareRetentionMs = 24 * 60 * 60 * 1000;
const dismissalMarker = '.last-share';
const activeShares = new Set<string>();
const unsavedDismissals = new Map<string, number>();

function shareCache() {
  return new Directory(Paths.cache, 'transcript-exports');
}

export function pruneTranscriptShareCache() {
  const cutoff = Date.now() - shareRetentionMs;
  for (const [uri, dismissedAt] of unsavedDismissals) {
    if (dismissedAt < cutoff) unsavedDismissals.delete(uri);
  }
  try {
    const root = shareCache();
    if (!root.exists) return;
    for (const entry of root.list()) {
      if (!(entry instanceof Directory) || activeShares.has(entry.uri)) continue;
      try {
        const lastUsed = unsavedDismissals.get(entry.uri)
          ?? (new File(entry, dismissalMarker).lastModified || entry.info().modificationTime);
        if (lastUsed && lastUsed < cutoff) entry.delete();
      } catch { /* One inaccessible temporary attachment must not prevent other cleanup. */ }
    }
  } catch { /* Cache access is best effort at startup and before a share. */ }
}

export async function readTranscriptSidecar(file: File) {
  return file.exists ? file.text() : undefined;
}

export async function transferTranscript(filename: string, markdown: string, _save: boolean): Promise<TransferOutcome> {
  if (!filename.endsWith('.md') || /[/\\]/.test(filename) || !markdown.trim()) {
    throw new Error('Invalid saved transcript attachment.');
  }
  if (!await isAvailableAsync()) throw new Error('No share destination is available.');
  pruneTranscriptShareCache();
  const root = shareCache();
  root.create({ idempotent: true });
  const directory = new Directory(root, randomUUID());
  directory.create();
  activeShares.add(directory.uri);
  const attachment = new File(directory, filename);
  try {
    attachment.create();
    await attachment.write(markdown);
    await shareAsync(attachment.uri);
    // Extensions may still consume the URL after the sheet closes, including after cancellation.
    const dismissedAt = Date.now();
    try { await new File(directory, dismissalMarker).write(String(dismissedAt)); }
    catch { unsavedDismissals.set(directory.uri, dismissedAt); }
    return 'dismissed';
  } catch (error) {
    try { directory.delete(); } catch { /* Startup or a later share retries cleanup. */ }
    throw error;
  } finally {
    activeShares.delete(directory.uri);
  }
}
