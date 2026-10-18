// Service worker for the installed (PWA) app.
//
// Update-safe caching:
//   • Pages (index.html) — network first, so every visit gets the newest
//     version of the app; the cached copy is used only when offline.
//   • /assets/* — files with a content hash in their name never change, so
//     they are served from cache (fast) once downloaded.
//   • Everything else — network first, cache as offline fallback.
// The previous version served index.html from cache forever, which kept
// people on an old build after every update.

// v3: drops copies saved by older versions, which could hold the app page
// saved under a program file's name after a broken deploy.
// v4: version.json is never cached (open tabs use it to notice updates).
const CACHE_NAME = 'kalaboboarding-v4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// A program file answered with a web page means the server is misconfigured
// or mid-deploy. Never keep such an answer: it would break the app on every
// visit, even after the server is fixed.
const isPageResponse = (response) => (response.headers.get('content-type') || '').includes('text/html');

const putInCache = (request, response) => {
  if (response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Firebase etc. go straight to the network
  if (url.pathname.startsWith('/api/')) return;
  // Face recognition models (38 MB): the face engine keeps its own copy in
  // the browser cache, so don't store a second one here.
  if (url.pathname.startsWith('/models/')) return;
  // Update checks must always reach the server.
  if (url.pathname === '/version.json') return;

  // Hashed build files: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit && !isPageResponse(hit)) return hit;
        return fetch(request).then((res) => (isPageResponse(res) ? res : putInCache(request, res)));
      }),
    );
    return;
  }

  // Pages and other files: network first, cached copy only when offline.
  const isPage = request.mode === 'navigate';
  event.respondWith(
    fetch(request)
      .then((res) => putInCache(isPage ? '/index.html' : request, res))
      .catch(() => caches.match(isPage ? '/index.html' : request).then((hit) => hit || caches.match('/index.html'))),
  );
});
