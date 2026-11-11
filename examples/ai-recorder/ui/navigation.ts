/** Bounded Android shell: three existing roots and one modal detail at a time. */
export const destinations = [
  { id: 'record', label: 'Record' },
  { id: 'library', label: 'Library' },
  { id: 'settings', label: 'Settings' },
] as const;
export type RootDestination = typeof destinations[number]['id'];
export type CapturePhase = 'idle' | 'starting' | 'recording' | 'saving' | 'importing';
export function canSwitchDestination(phase: CapturePhase) {
  return phase === 'idle' || phase === 'recording';
}
export function canLeaveTranscript(busy: boolean, summaryLocked: boolean, unsavedResult: boolean) {
  return !busy && !summaryLocked && !unsavedResult;
}

export function canEditTranscript(showOriginal: boolean, busy: boolean) {
  return !showOriginal && !busy;
}
