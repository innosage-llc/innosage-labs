import type { File } from './localFiles.web';
import { m4aDurationMillis } from './m4aDuration';

export async function recordingDurationMillis(file: File): Promise<number | undefined> {
  const header = await m4aDurationMillis(file.size, async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()));
  if (header !== undefined) return header;

  // A MediaRecorder can produce fragmented MP4 without a duration in mvhd.
  // Ask the browser's local media demuxer. Never guess if neither source knows.
  const audio = document.createElement('audio');
  const uri = URL.createObjectURL(file);
  try {
    return await new Promise<number | undefined>(resolve => {
      const finish = () => {
        clearTimeout(timer);
        const millis = audio.duration * 1000;
        resolve(Number.isFinite(millis) && millis > 0 ? millis : undefined);
      };
      const timer = setTimeout(finish, 3000);
      audio.onloadedmetadata = finish;
      audio.onerror = finish;
      audio.preload = 'metadata';
      audio.src = uri;
    });
  } finally {
    audio.onloadedmetadata = audio.onerror = null;
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(uri);
  }
}
