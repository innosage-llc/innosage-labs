import { shareOrDownload } from './browserShare.web';
export { readSidecar as readTranscriptSidecar } from './localFiles.web';
export async function transferTranscript(filename: string, markdown: string, save: boolean) {
  return shareOrDownload(new globalThis.File([markdown], filename, { type: 'text/markdown;charset=utf-8' }), save);
}

export const markdownTransfer: 'share-and-save' | 'share-sheet' | 'unavailable' = 'share-and-save';
