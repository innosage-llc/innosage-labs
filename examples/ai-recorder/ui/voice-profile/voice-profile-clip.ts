import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const MAX_CLIP_BYTES = 10 * 1024 * 1024;
const FORMAT_MESSAGE = 'Choose a WAV or M4A audio clip.';

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

async function readCacheCopy(file: File) {
  const size = checkSize(file.size);
  const handle = file.open(FileMode.ReadOnly);
  try {
    const bytes = await handle.readBytes(size);
    if (bytes.length !== size || file.size !== size) {
      throw new VoiceClipError('The audio clip could not be read.');
    }
    return bytes;
  } finally {
    handle.close();
  }
}

export async function pickVoiceClip(): Promise<PickedVoiceClip | undefined> {
  const selection = await getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, base64: false });
  if (selection.canceled) return;
  const asset = selection.assets[0];
  if (!asset) throw new VoiceClipError('The audio clip is unavailable.');

  const web = Platform.OS === 'web';
  let ownedCopy: File | undefined;
  if (!web) {
    // The picker creates a fresh copy in its own cache directory on native.
    // Only take ownership of a direct child of that directory.
    const copy = new File(asset.uri);
    const pickerCache = new Directory(Paths.cache, 'DocumentPicker');
    if (copy.parentDirectory.uri.replace(/\/$/, '') !== pickerCache.uri.replace(/\/$/, '')) {
      throw new VoiceClipError('The audio clip could not be copied to the cache.');
    }
    ownedCopy = copy;
  }

  try {
    const mimeType = clipMime(asset);
    if (asset.size !== undefined) checkSize(asset.size);

    let bytes: Uint8Array;
    if (ownedCopy) {
      bytes = await readCacheCopy(ownedCopy);
    } else {
      const browserFile = asset.file;
      if (!browserFile) throw new VoiceClipError('The audio clip is unavailable.');
      const size = checkSize(browserFile.size);
      bytes = new Uint8Array(await browserFile.slice(0, size).arrayBuffer());
      if (bytes.length !== size) throw new VoiceClipError('The audio clip could not be read.');
    }

    if (!matchesContainer(bytes, mimeType)) throw new VoiceClipError(FORMAT_MESSAGE);
    return { bytes, mimeType, filename: asset.name, digest: bytesToHex(sha256(bytes)) };
  } finally {
    if (ownedCopy?.exists) ownedCopy.delete();
    if (web && asset.uri.startsWith('blob:')) URL.revokeObjectURL(asset.uri);
  }
}
