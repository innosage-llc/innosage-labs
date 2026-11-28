// All records are scoped to this origin. Resolve writes only after transaction commit.
let pending: Promise<IDBDatabase> | undefined;
export function recorderDatabase() {
  if (!pending) pending = new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('innosage.audio-recorder', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('files');
      open.result.createObjectStore('settings');
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => { db.close(); pending = undefined; };
      resolve(db);
    };
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}

export async function transaction<T>(storeName: 'files' | 'settings', mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await recorderDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let request: IDBRequest<T>;
    try {
      request = run(tx.objectStore(storeName));
    } catch (error) {
      // A synchronous error scheduling a later operation must roll back prior writes.
      tx.abort();
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Browser storage operation failed.'));
  });
}
