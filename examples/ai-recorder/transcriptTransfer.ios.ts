import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import type { TransferOutcome } from './transcriptTransfer';

export const markdownTransfer = 'share-sheet' as const;

export async function readTranscriptSidecar(file: File) {
  return file.exists ? file.text() : undefined;
}

export async function transferTranscript(filename: string, markdown: string, _save: boolean): Promise<TransferOutcome> {
  if (!filename.endsWith('.md') || /[/\\]/.test(filename) || !markdown.trim()) {
    throw new Error('Invalid saved transcript attachment.');
  }
  if (!await isAvailableAsync()) throw new Error('No share destination is available.');
  const root = new Directory(Paths.cache, 'transcript-exports');
  root.create({ idempotent: true });
  // A receiving extension can still be consuming the URL when the sheet dismisses.
  for (const entry of root.list()) {
    if (!(entry instanceof Directory)) continue;
    try {
      const modified = entry.info().modificationTime;
      if (modified && Date.now() - modified > 86_400_000) entry.delete();
    } catch { /* Retry cache cleanup on the next export. */ }
  }
  const directory = new Directory(root, randomUUID());
  directory.create();
  const attachment = new File(directory, filename);
  try {
    attachment.create();
    await attachment.write(markdown);
    await shareAsync(attachment.uri);
    return 'dismissed'; // The same system sheet offers Save to Files and cancellation.
  } catch (error) {
    try { directory.delete(); } catch { /* A later export cleans abandoned cache entries. */ }
    throw error;
  }
}
