/* ══════════════════════════════════════════
   sw.js — MyScreenScore Service Worker
   Cache strategy: stale-while-revalidate
══════════════════════════════════════════ */

const CACHE_VERSION = 'mss-v117';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;

/* Static assets to pre-cache on install */
const STATIC_ASSETS = [
  '',
  'index.html',
  'tv-shows.html',
  'library.html',
  'movies.html',
  'anime.html',
  'cartoons.html',
  'completed.html',
  'friends.html',
  'friend-view.html',
  'profile.html',
  'profile-view.html',
  'favorites.html',
  'lists.html',
  'notes.html',
  'search.html',
  'detail.html',
  'title.html',
  'person.html',
  'settings.html',
  'login.html',
  'user.html',
  'offline.html',
  'css/style.css',
  'js/config.js',
  'js/db.js',
  'js/nav.js',
  'js/category.js',
  'js/rewatch.js',
  'js/create-card.js',
  'js/fav-lists-popup.js',
  'js/export.js',
];

/* ── Install: pre-cache static assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW: Some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

/* ── Activate: clean up old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('mss-') && k !== STATIC_CACHE && k !== IMAGE_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: route requests ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept Supabase API calls — always fresh
  if (url.hostname.includes('supabase.co')) return;

  // Never intercept TMDB (images or API) — the SW's own fetch() runs in
  // 'cors' mode and needs a readable response, unlike a plain <img> tag
  // load which uses 'no-cors' and just displays pixels. Any CORS friction
  // invisible to normal poster display was failing silently here and
  // falling through networkFirst's catch to the offline.html HTML
  // fallback, which is why fetch()-based poster loads (e.g. for
  // generating a downloadable card) were getting HTML back instead of
  // the actual image.
  if (url.hostname.includes('tmdb.org') || url.hostname.includes('themoviedb.org')) return;

  // Never intercept Cloudinary uploads — always network
  if (url.hostname.includes('cloudinary.com') && request.method === 'POST') return;

  // Cloudinary images — cache first, fallback to network
  if (url.hostname.includes('cloudinary.com') || url.hostname.includes('res.cloudinary.com')) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Google Fonts — cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Static assets (HTML, CSS, JS) — stale-while-revalidate
  if (request.destination === 'document' ||
      request.destination === 'script'   ||
      request.destination === 'style'    ||
      url.pathname.startsWith('/css/')   ||
      url.pathname.startsWith('/js/')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Everything else — network first
  event.respondWith(networkFirst(request));
});

/* ══ Strategies ══ */

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || caches.match('offline.html');
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('offline.html');
  }
}