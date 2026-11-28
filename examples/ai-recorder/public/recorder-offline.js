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
async function installRelease() {
  const response = await fetch(root, { cache: 'reload', credentials: 'omit', redirect: 'error' });
  if (!response.ok || response.url !== root || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Recorder shell unavailable');
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(match => new URL(match[1], root)).filter(isAsset);
  if (!assets.some(url => url.pathname.endsWith('.js'))) throw new Error('Recorder bundle unavailable');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
  const release = prefix + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  const previous = await releases();
  if (previous[0] === release && await caches.has(release)) return response;
  const cache = await caches.open(release);
  try {
    for (const url of assets) {
      const asset = await fetch(url, { cache: 'reload', credentials: 'omit', redirect: 'error' });
      checkAsset(asset, url);
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
      const [current] = await releases();
      if (current) await (await caches.open(current)).put(request, response.clone());
      return response;
    })());
  }
});
