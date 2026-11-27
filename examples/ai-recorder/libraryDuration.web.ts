import type { File } from './localFiles.web';
import { m4aDurationMillis } from './m4aDuration';
export async function recordingDurationMillis(file: File) {
  return m4aDurationMillis(file.size, async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()));
}
