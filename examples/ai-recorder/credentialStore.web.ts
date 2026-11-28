import { transaction } from './browserDatabase.web';

// Use a non-exportable browser-managed key. Tokens are never placed in web storage
// or exposed to another origin. Same-origin code can use the key while the site runs.
const keyName = '@encryption-key';
let keyPromise: Promise<CryptoKey> | undefined;
function key(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = (async () => {
    const existing = await transaction('settings', 'readonly', s => s.get(keyName));
    if (existing) return existing as CryptoKey;
    const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    try {
      await transaction('settings', 'readwrite', s => s.add(created, keyName));
      return created;
    } catch (error) {
      // A second tab may have initialized the same origin first.
      const installed = await transaction('settings', 'readonly', s => s.get(keyName));
      if (!installed) throw error;
      return installed as CryptoKey;
    }
  })().catch(error => { keyPromise = undefined; throw error; });
  return keyPromise;
}
export async function getItemAsync(name: string): Promise<string | null> {
  const item = await transaction('settings', 'readonly', s => s.get('value:' + name));
  if (!item) return null;
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: item.iv, additionalData: new TextEncoder().encode(name) }, await key(), item.ciphertext);
  return new TextDecoder().decode(plain);
}
export async function setItemAsync(name: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(name) }, await key(), new TextEncoder().encode(value));
  await transaction('settings', 'readwrite', s => s.put({ iv, ciphertext }, 'value:' + name));
}
export async function deleteItemAsync(name: string) {
  await transaction('settings', 'readwrite', s => s.delete('value:' + name));
}
