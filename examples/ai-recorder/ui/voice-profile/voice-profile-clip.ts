import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { File, FileMode } from 'expo-file-system';
import { Platform } from 'react-native';

const MAX_CLIP_BYTES = 10 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const FORMAT_MESSAGE = 'Choose a WAV or M4A audio clip.';
const UNAVAILABLE_MESSAGE = 'The audio clip is unavailable.';
const READ_MESSAGE = 'The audio clip could not be read.';

export type VoiceProfileAudio = Readonly<{
  bytes: Uint8Array;
  mimeType: 'audio/mp4' | 'audio/wav';
}>;

export type PickedVoiceClip = VoiceProfileAudio & Readonly<{
  filename: string;
  digest: string;
}>;

export class VoiceClipError extends Error {}

function clipMime({ name, mimeType }: DocumentPickerAsset): VoiceProfileAudio['mimeType'] {
  const extension = /\.(m4a|wav)$/i.exec(name)?.[1].toLowerCase();
  const mime = mimeType?.split(';', 1)[0].trim().toLowerCase() ?? '';
  const genericMime = !mime || mime === 'application/octet-stream';
  if (extension === 'wav' && (genericMime || ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'].includes(mime))) {
    return 'audio/wav';
  }
  if (extension === 'm4a' && (genericMime || ['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'application/mp4'].includes(mime))) {
    return 'audio/mp4';
  }
  throw new VoiceClipError(FORMAT_MESSAGE);
}

function checkSize(size: number | null | undefined) {
  if (!size || !Number.isSafeInteger(size) || size < 0) {
    throw new VoiceClipError('The audio clip is empty or unavailable.');
  }
  if (size > MAX_CLIP_BYTES) throw new VoiceClipError('Choose an audio clip no larger than 10 MiB.');
  return size;
}

function matchesContainer(bytes: Uint8Array, mimeType: VoiceProfileAudio['mimeType']) {
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return bytes.length >= 12 && (mimeType === 'audio/wav'
    ? tag(0) === 'RIFF' && tag(8) === 'WAVE'
    : tag(4) === 'ftyp');
}

async function readDocument(file: File, size: number) {
  let statSize: number | null | undefined;
  try {
    statSize = file.size;
  } catch {
    // Some document providers support reading without exposing a stat size.
  }
  if (statSize != null && checkSize(statSize) !== size) {
    throw new VoiceClipError(READ_MESSAGE);
  }

  const bytes = new Uint8Array(size);
  const handle = file.open(FileMode.ReadOnly);
  try {
    let offset = 0;
    while (offset < size) {
      const limit = Math.min(READ_CHUNK_BYTES, size - offset);
      const chunk = await handle.readBytes(limit);
      if (!chunk.length || chunk.length > limit) throw new VoiceClipError(READ_MESSAGE);
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    // Probe for EOF without reading more than the picker size plus one byte.
    if ((await handle.readBytes(1)).length !== 0) throw new VoiceClipError(READ_MESSAGE);
    return bytes;
  } finally {
    handle.close();
  }
}

export async function pickVoiceClip(): Promise<PickedVoiceClip | undefined> {
  if (Platform.OS !== 'android') throw new VoiceClipError(UNAVAILABLE_MESSAGE);

  try {
    const selection = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: false, base64: false });
    if (selection.canceled) return;
    const asset = selection.assets[0];
    if (!asset?.uri.startsWith('content://')) throw new VoiceClipError(UNAVAILABLE_MESSAGE);

    const mimeType = clipMime(asset);
    const size = checkSize(asset.size);
    const bytes = await readDocument(new File(asset.uri), size);
    if (!matchesContainer(bytes, mimeType)) throw new VoiceClipError(FORMAT_MESSAGE);
    return { bytes, mimeType, filename: asset.name, digest: bytesToHex(sha256(bytes)) };
  } catch (error) {
    if (error instanceof VoiceClipError) throw error;
    throw new VoiceClipError('Could not open the audio clip.');
  }
}
