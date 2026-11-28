import { hasMP4AudioTrack } from './m4aDuration';
import { getDocumentAsync } from 'expo-document-picker';
import { File, recordings, storeAudio } from './localFiles.web';

export async function verifyTranscriptionMedia(file: Blob) {
  const audioTrack = await hasMP4AudioTrack(file.size, async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()));
  if (!audioTrack) return false;
  // A movie header can declare an audio track and positive duration while the
  // payload has no readable samples. Verify local muted decode, without ever
  // expanding the entire compressed stream into a PCM buffer.
  const media = document.createElement('audio');
  media.muted = true;
  media.preload = 'auto';
  const uri = URL.createObjectURL(file);
  try {
    return await new Promise<boolean>(resolve => {
      const finish = (valid: boolean) => { clearTimeout(timeout); clearInterval(interval); resolve(valid); };
      const check = () => {
        const decoded = (media as HTMLAudioElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
        const hasSamples = decoded === undefined ? media.buffered.length > 0 : decoded > 0;
        if (hasSamples && media.currentTime > 0 && media.readyState >= media.HAVE_CURRENT_DATA) finish(true);
        else if (media.ended || media.error) finish(false);
      };
      const timeout = setTimeout(() => finish(false), 5000);
      const interval = setInterval(check, 50);
      media.onended = check;
      media.onerror = () => finish(false);
      media.src = uri;
      void media.play().then(check, () => finish(false));
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
export async function pickAudio(): Promise<string | undefined> {
  const result = await getDocumentAsync({ type: '*/*', base64: false });
  if (result.canceled) return;
  const { file, uri, name } = result.assets[0];
  try {
    if (!name.toLowerCase().endsWith('.m4a')) return 'Choose an M4A audio file.';
    if (!file?.size) return 'The selected audio file is empty or unavailable.';
    if (!await verifyTranscriptionMedia(file)) return 'Choose an M4A containing an MP4 audio track.';
    await storeAudio(file.slice(0, file.size, 'audio/mp4'), name);
    return 'Audio imported to this device.';
  } finally { URL.revokeObjectURL(uri); }
}
