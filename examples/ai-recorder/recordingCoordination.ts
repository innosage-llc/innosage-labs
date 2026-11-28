// The native app owns a single JS capture/submit session.
export async function withGuestProvision<T>(_service: string, action: () => Promise<T>) { return action(); }
export async function withRecordingSubmission(_key: string, _operation: string | undefined, action: () => Promise<void>) {
  return action();
}
