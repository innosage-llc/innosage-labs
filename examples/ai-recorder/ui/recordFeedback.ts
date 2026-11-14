import type { CapturePhase } from './navigation';

export const recordingSavedMessage = 'Recording saved on this device.';

/** A retained file identity alone is not current successful-save feedback. */
export function hasSavedFeedback(phase: CapturePhase, savedUri: string | undefined, message: string) {
  return phase === 'idle' && Boolean(savedUri) && message === recordingSavedMessage;
}

/** Describe the recovery the actual native permission response still permits. */
export function microphonePermissionMessage(canAskAgain: boolean, platform = 'android') {
  return canAskAgain
    ? 'Microphone access was not allowed. Tap Start recording to ask again.'
    : platform === 'ios'
      ? 'Microphone access is blocked. In iPhone Settings, open Privacy & Security > Microphone > AI Recorder. Allow access, return here, then tap Start recording.'
      : 'Microphone access is blocked. In Android device Settings, open Apps > AI Recorder > Permissions > Microphone. Allow access, return here, then tap Start recording.';
}
