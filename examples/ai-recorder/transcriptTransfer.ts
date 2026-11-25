import type { File } from 'expo-file-system';

export async function readTranscriptSidecar(file: File) {
  return file.exists ? file.text() : undefined;
}

export type TransferOutcome = 'saved' | 'cancelled' | 'dismissed';

export async function transferTranscript(_filename: string, _markdown: string, _save: boolean): Promise<TransferOutcome> {
  throw new Error('Markdown transfer requires Android.');
}
