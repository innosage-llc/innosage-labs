import type { File } from './localFiles.web';
import { shareOrDownload } from './browserShare.web';
import { audioShareFilename } from './audioShareFilename';
import type { AudioShareOutcome } from './recordingShare';

export async function shareRecording(recording: File, label: string): Promise<AudioShareOutcome> {
  if (!recording.exists || !recording.size) return 'missing';
  const suffix = recording.name.split('.').at(-1)!;
  const name = audioShareFilename(label).replace(/\.m4a$/, '.' + suffix);
  try {
    await shareOrDownload(new globalThis.File([recording], name, { type: recording.type || 'audio/mp4' }));
    return 'dismissed';
  } catch { return 'failed'; }
}
