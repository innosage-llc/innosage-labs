import { hasMP4AudioTrack } from './m4aDuration.ts';

export const libraryImportAction = {
  label: 'Import audio', busyLabel: 'Importing audio', icon: 'import', placement: 'top-trailing',
} as const;

export function importActionState(phase: string, onPress: () => void) {
  const importing = phase === 'importing';
  return { ...libraryImportAction, importing, disabled: phase !== 'idle', onPress,
    accessibilityName: importing ? libraryImportAction.busyLabel : libraryImportAction.label };
}

export interface ImportSelection {
  name: string;
  size: number;
  read: (offset: number, length: number) => Promise<Uint8Array>;
  decodedSamples: () => Promise<number>;
  commit: (filename: string) => Promise<void>;
  dispose: () => void;
}

export type ImportOutcome = { kind: 'saved'; id: string }
  | { kind: 'cancelled' | 'unsupported' | 'unavailable' | 'malformed' | 'saveFailed' };

export const importMessages: Record<ImportOutcome['kind'], string> = {
  saved: 'Audio imported to this device.',
  cancelled: '',
  unsupported: 'Choose an M4A audio file.',
  unavailable: 'The selected audio file is empty or unavailable.',
  malformed: 'Choose an M4A containing an MP4 audio track.',
  saveFailed: 'Could not import the audio. Check available storage and try again.',
};

export async function importLibraryAudio(pick: () => Promise<ImportSelection | undefined>,
  allocateId: () => string): Promise<ImportOutcome> {
  let asset: ImportSelection | undefined;
  try {
    asset = await pick();
    if (!asset) return { kind: 'cancelled' };
    if (!asset.name.toLowerCase().endsWith('.m4a')) return { kind: 'unsupported' };
    if (!(asset.size > 0)) return { kind: 'unavailable' };
    if (!await hasMP4AudioTrack(asset.size, asset.read) || !(await asset.decodedSamples() > 0)) {
      return { kind: 'malformed' };
    }
    try {
      const id = allocateId();
      await asset.commit(id);
      return { kind: 'saved', id };
    } catch {
      return { kind: 'saveFailed' };
    }
  } catch {
    return { kind: 'unavailable' };
  } finally {
    try { asset?.dispose(); } catch { /* The picker cache is disposable. */ }
  }
}
