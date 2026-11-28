import { requireNativeModule } from 'expo';
import type { File } from 'expo-file-system';
import type { TransferOutcome } from './transcriptTransfer';

type NativeTransfer = {
  readSidecar(name: string): Promise<string | null>;
  exportMarkdown(filename: string, markdown: string, save: boolean): Promise<TransferOutcome>;
};

const transfer = () => requireNativeModule<NativeTransfer>('RecorderTranscriptExport');

export async function readTranscriptSidecar(file: File) {
  return (await transfer().readSidecar(file.name)) ?? undefined;
}

export function transferTranscript(filename: string, markdown: string, save: boolean) {
  return transfer().exportMarkdown(filename, markdown, save);
}

export const markdownTransfer: 'share-and-save' | 'share-sheet' | 'unavailable' = 'share-and-save';
