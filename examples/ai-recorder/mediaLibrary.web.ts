import { hasMP4AudioTrack } from './m4aDuration';
import { getDocumentAsync } from 'expo-document-picker';
import { File, recordings, storeAudio } from './localFiles.web';

export async function verifyTranscriptionMedia(file: Blob) {
  return hasMP4AudioTrack(file.size, async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()));
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
