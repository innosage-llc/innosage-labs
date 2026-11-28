import type { ImportSelection } from './libraryImport';
import { hasMP4AudioTrack } from './m4aDuration';
import { getDocumentAsync } from 'expo-document-picker';
import { File, recordings, storeAudio } from './localFiles.web';

export async function verifyTranscriptionMedia(file: Blob, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const audioTrack = await hasMP4AudioTrack(file.size, async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()));
  signal?.throwIfAborted();
  return audioTrack && (await decodedSamples(file, signal)) > 0;
}

async function decodedSamples(file: Blob, signal?: AbortSignal) {
  // A movie header can declare an audio track and positive duration while the
  // payload has no readable samples. Verify local muted decode, without ever
  // expanding the entire compressed stream into a PCM buffer.
  const media = document.createElement('audio');
  media.muted = true;
  media.preload = 'auto';
  const uri = URL.createObjectURL(file);
  try {
    return await new Promise<number>(resolve => {
      const abort = () => finish(0);
      const finish = (samples: number) => { clearTimeout(timeout); clearInterval(interval); signal?.removeEventListener('abort', abort); resolve(samples); };
      const check = () => {
        const decoded = (media as HTMLAudioElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
        const hasSamples = decoded === undefined ? media.buffered.length > 0 : decoded > 0;
        if (hasSamples && media.currentTime > 0 && media.readyState >= media.HAVE_CURRENT_DATA) finish(1);
        else if (media.ended || media.error) finish(0);
      };
      const timeout = setTimeout(() => finish(0), 5000);
      const interval = setInterval(check, 50);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      media.onended = check;
      media.onerror = () => finish(0);
      media.src = uri;
      void media.play().then(check, () => finish(0));
    });
  } finally {
    media.onended = media.onerror = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
    URL.revokeObjectURL(uri);
  }
}

export function listRecordings() {
  return recordings.list().filter(file => /\.(m4a|ogg|webm)$/.test(file.name))
    .sort((a, b) => Number(b.name.split('-')[1]) - Number(a.name.split('-')[1]));
}
export function playbackSource(file: File) {
  const uri = URL.createObjectURL(file);
  return { uri, release: () => URL.revokeObjectURL(uri) };
}
export async function pickAudio(): Promise<ImportSelection | undefined> {
  const result = await getDocumentAsync({ type: '*/*', base64: false });
  if (result.canceled || !result.assets.length) return;
  const { file, uri, name } = result.assets[0];
  return {
    name, size: file?.size ?? 0,
    read: async (offset, length) => new Uint8Array(await file!.slice(offset, offset + length).arrayBuffer()),
    decodedSamples: () => decodedSamples(file!),
    commit: async id => { await storeAudio(file!.slice(0, file!.size, 'audio/mp4'), name, id.slice(0, -4)); },
    dispose: () => URL.revokeObjectURL(uri),
  };
}
