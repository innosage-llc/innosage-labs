// Only the static app shell belongs in CacheStorage. Local recordings and
// provider traffic use different storage and never pass through this handler.
const scope = new URL(self.registration.scope);
const root = scope.href;
const prefix = 'recorder-shell-v2:' + scope.pathname + ':';
const registry = prefix + 'registry';
const pointer = new URL('./.recorder-cache-state', root).href;
let updating;

function isAsset(url) {
  return url.origin === scope.origin && !url.search && url.pathname.startsWith(scope.pathname)
    && /^(?:_expo\/static\/|assets\/)/.test(url.pathname.slice(scope.pathname.length));
}
async function releases() {
  const record = await (await caches.open(registry)).match(pointer);
  return record ? record.json() : [];
}
function checkAsset(response, url) {
  if (!response.ok || response.url !== url.href || response.redirected) throw new Error('Missing static asset');
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('text/html') || (/\.js$/.test(url.pathname) && !/javascript|ecmascript/i.test(type))
    || (/\.css$/.test(url.pathname) && !/text\/css/i.test(type))) throw new Error('Unexpected static asset type');
}
async function digest(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
async function installRelease() {
  const response = await fetch(root, { cache: 'reload', credentials: 'omit', redirect: 'error' });
  if (!response.ok || response.url !== root || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Recorder shell unavailable');
  const manifestURL = new URL('./recorder-shell.json', root);
  const manifestResponse = await fetch(manifestURL, { cache: 'reload', credentials: 'omit', redirect: 'error' });
  if (!manifestResponse.ok || manifestResponse.url !== manifestURL.href) throw new Error('Missing Recorder asset manifest');
  const manifest = await manifestResponse.json();
  const indexBytes = await response.clone().arrayBuffer();
  if (manifest.version !== 1 || manifest.index !== await digest(indexBytes) || !Array.isArray(manifest.files)) throw new Error('Mismatched Recorder shell');
  const assets = new Map();
  for (const file of manifest.files) {
    const url = new URL(file.path, root);
    if (!isAsset(url) || assets.has(url.href) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid Recorder asset');
    assets.set(url.href, file.sha256);
  }
  const entries = [...new TextDecoder().decode(indexBytes).matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(match => new URL(match[1], root)).filter(isAsset);
  if (!entries.some(url => url.pathname.endsWith('.js')) || entries.some(url => !assets.has(url.href))) throw new Error('Missing Recorder bundle');
  const release = prefix + await digest(new TextEncoder().encode(JSON.stringify(manifest)));
  const previous = await releases();
  if (previous[0] === release && await caches.has(release)) return response;
  const cache = await caches.open(release);
  try {
    for (const [href, expected] of assets) {
      const url = new URL(href);
      const asset = await fetch(url, { cache: 'reload', credentials: 'omit', redirect: 'error' });
      checkAsset(asset, url);
      if (await digest(await asset.clone().arrayBuffer()) !== expected) throw new Error('Incomplete Recorder asset');
      await cache.put(url, asset);
    }
    await cache.put(root, response.clone());
    const kept = [release, ...previous.filter(name => name !== release)].slice(0, 2);
    await (await caches.open(registry)).put(pointer, Response.json(kept));
    // Cleanup is best effort after the generation pointer has committed.
    await caches.keys().then(names => Promise.all(names.filter(name => name.startsWith(prefix) && name !== registry
      && !kept.includes(name)).map(name => caches.delete(name)))).catch(() => {});
  } catch (error) {
    if (!previous.includes(release)) await caches.delete(release);
    throw error;
  }
  return response;
}
function updateShell() {
  if (!updating) updating = installRelease().finally(() => { updating = undefined; });
  return updating.then(response => response.clone());
}
async function cached(request) {
  for (const name of await releases()) {
    const hit = await (await caches.open(name)).match(request);
    if (hit) return hit;
  }
}
self.addEventListener('install', event => event.waitUntil(updateShell().then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await caches.delete('recorder-shell-v1:' + scope.pathname);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === scope.origin && url.pathname === scope.pathname) {
    event.respondWith(updateShell().catch(async () => await cached(root) ?? Response.error()));
  } else if (isAsset(url)) {
    event.respondWith((async () => {
      const hit = await cached(request);
      if (hit) return hit;
      const response = await fetch(request);
      checkAsset(response, url);
      // Only build-manifest entries are retained in a release cache.
      return response;
    })());
  }
});
