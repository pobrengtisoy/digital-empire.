/* RZ Tindahan: keep the counter working without internet. The page and its files are kept on the
   tablet; /api is never cached (sales wait in the tablet's own queue until they are sent). */
const CACHE = 'rz-tindahan-v1';
const SHELL = ['./', 'app.js', 'logic.mjs', 'style.css', 'manifest.webmanifest', 'icon-192.png', '../kit.js', '../kit.css', '../fonts/tindahan.css',
  '../fonts/rubik-normal-400_700-latin.woff2', '../fonts/rubik-normal-400_700-latin-ext.woff2', '../fonts/jetbrains-mono-normal-400_700-latin.woff2', '../fonts/jetbrains-mono-normal-400_700-latin-ext.woff2', '../../rz-mark.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('rz-tindahan-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Network first, so the tablet gets updates when online; the kept copy when offline.
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok && !res.redirected) { const c = await caches.open(CACHE); c.put(e.request, res.clone()); }
      return res;
    } catch {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      if (e.request.mode === 'navigate') return (await caches.match('./', { ignoreSearch: true })) || Response.error();
      return Response.error();
    }
  })());
});
