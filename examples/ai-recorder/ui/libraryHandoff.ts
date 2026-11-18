/** Ephemeral UI state only: audio and playback remain owned by RecorderScreen. */
export type HandoffState = {
  savedUri?: string;
  sequence: number;
  request?: { id: number; uri: string; located: boolean };
};
export type HandoffEvent =
  | { type: 'saved'; uri: string }
  | { type: 'reset' }
  | { type: 'view' }
  | { type: 'leave' }
  | { type: 'located' | 'expire'; id: number };

export const initialHandoff: HandoffState = { sequence: 0 };

export function handoffReducer(state: HandoffState, event: HandoffEvent): HandoffState {
  switch (event.type) {
    case 'saved': return { savedUri: event.uri, sequence: state.sequence + 1 };
    case 'reset': return { sequence: state.sequence + 1 };
    case 'leave': return { ...state, request: undefined };
    case 'view':
      if (!state.savedUri || state.request) return state;
      return { ...state, sequence: state.sequence + 1,
        request: { id: state.sequence + 1, uri: state.savedUri, located: false } };
    case 'located':
      return state.request?.id === event.id
        ? { ...state, request: { ...state.request, located: true } } : state;
    case 'expire':
      return state.request?.id === event.id ? { ...state, request: undefined } : state;
  }
}

/** Virtualized rows may need another layout pass; retries are bounded and cancellable. */
export function locateRecording(attempt: () => boolean, unavailable: () => void) {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  function tryLocate() {
    if (cancelled) return;
    let found = false;
    try { found = attempt(); } catch { /* Retry after the list measures more rows. */ }
    if (found || cancelled) return;
    if (++attempts >= 10) { unavailable(); return; }
    timer = setTimeout(tryLocate, 200);
  }
  tryLocate();
  return () => { cancelled = true; clearTimeout(timer); };
}
