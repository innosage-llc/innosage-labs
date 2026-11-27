// Limit the offline cache to this Recorder installation's static shell.
// Audio, credentials, provider responses, and other origins never enter CacheStorage.
const scope = new URL(self.registration.scope);
const cacheName = 'recorder-shell-v1:' + scope.pathname;
const root = scope.href;
function isAsset(url) {
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
    && /^(?:_expo\/static\/|assets\/)/.test(url.pathname.slice(scope.pathname.length))
    && !url.search;
}
async function updateShell() {
  const response = await fetch(root, { cache: 'reload', credentials: 'omit' });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Recorder shell unavailable');
  const html = await response.clone().text();
  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => new URL(match[1], root)).filter(isAsset);
  if (!assets.some(asset => asset.pathname.endsWith('.js'))) throw new Error('Recorder bundle unavailable');
  const cache = await caches.open(cacheName);
  await Promise.all(assets.map(async asset => {
    if (!await cache.match(asset)) await cache.add(new Request(asset, { credentials: 'omit' }));
  }));
  await cache.put(root, response.clone());
  return response;
}
self.addEventListener('install', event => event.waitUntil(updateShell().then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === scope.origin && url.pathname === scope.pathname && !url.search) {
    event.respondWith(updateShell().catch(async () => (await (await caches.open(cacheName)).match(root)) ?? Response.error()));
  } else if (isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
