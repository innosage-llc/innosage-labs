import { FileMode, type File } from 'expo-file-system';
import { m4aDurationMillis } from './m4aDuration';

export async function recordingDurationMillis(file: File) {
  const handle = file.open(FileMode.ReadOnly);
  try {
    return await m4aDurationMillis(handle.size ?? 0, (offset, length) => {
      handle.offset = offset;
      return handle.readBytes(length);
    });
  } finally {
    handle.close();
  }
}
