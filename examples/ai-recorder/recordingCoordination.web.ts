import { getItemAsync } from './credentialStore.web';

function locks() {
  if (!navigator.locks) throw new Error('This browser cannot coordinate a safe upload. Use a browser with Web Locks support.');
  return navigator.locks;
}

export function withGuestProvision<T>(service: string, action: () => Promise<T>) {
  // Re-read the persisted credential after acquiring the origin-wide lock.
  return locks().request('recorder.guest.' + service, action);
}

export function withRecordingSubmission(key: string, expectedID: string | undefined, action: () => Promise<void>) {
  return locks().request('recorder.submit.' + key, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('Another tab is submitting this recording. Reopen the transcript to check its status.');
    const record = await getItemAsync(key);
    const currentID = record?.startsWith('{') ? JSON.parse(record).id : record ?? undefined;
    if (currentID !== expectedID) throw new Error('Another tab updated this transcription. Reopen the transcript to check its status.');
    await action();
  });
}
