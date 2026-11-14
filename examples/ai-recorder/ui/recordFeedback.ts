import type { CapturePhase } from './navigation';

export const recordingSavedMessage = 'Recording saved on this device.';

/** A retained file identity alone is not current successful-save feedback. */
export function hasSavedFeedback(phase: CapturePhase, savedUri: string | undefined, message: string) {
  return phase === 'idle' && Boolean(savedUri) && message === recordingSavedMessage;
}

/** Describe the recovery the actual native permission response still permits. */
export function microphonePermissionMessage(canAskAgain: boolean) {
  return canAskAgain
    ? 'Microphone access was not allowed. Tap Start recording to ask again.'
    : 'Microphone access is blocked. Enable Microphone for AI Recorder in Android Settings, then tap Start recording.';
}
