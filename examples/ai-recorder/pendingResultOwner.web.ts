// If storage is temporarily full, retain exclusive save ownership until the
// successful provider result has been journaled or committed by its owning tab.
const held = new Map<string, () => void>();
const name = (key: string) => 'recorder.unsaved-result.' + key;
export async function retainResultOwner(key: string) {
  if (held.has(key)) return;
  await new Promise<void>((resolve, reject) => {
    void navigator.locks.request(name(key), { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('Another tab has a completed transcript waiting to be saved.');
      await new Promise<void>(release => { held.set(key, release); resolve(); });
    }).catch(reject);
  });
}
export async function assertResultOwnerAvailable(key: string) {
  if (held.has(key)) return;
  await navigator.locks.request(name(key), { ifAvailable: true }, lock => {
    if (!lock) throw new Error('A completed transcript is waiting in another tab. Return there to retry saving it.');
  });
}
export function releaseResultOwner(key: string) { held.get(key)?.(); held.delete(key); }
