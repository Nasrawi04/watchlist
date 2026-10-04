/* ══════════════════════════════════════════
   sw.js — MyScreenScore Service Worker
   Cache strategy: stale-while-revalidate
══════════════════════════════════════════ */

const CACHE_VERSION = 'mss-v697';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;

/* Long-lived caches — deliberately NOT tied to CACHE_VERSION. Every deploy
   bumps the version, which used to wipe ALL cached posters, fonts and the
   Supabase library too, so the first visit after every update re-downloaded
   everything (the "sometimes slow" loads). These rarely change, so they now
   survive deploys. */
const IMAGE_CACHE   = 'mss-images';
const FONT_CACHE    = 'mss-fonts';
const VENDOR_CACHE  = 'mss-vendor';
const KEEP_CACHES   = [STATIC_CACHE, IMAGE_CACHE, FONT_CACHE, VENDOR_CACHE];
const IMAGE_CACHE_MAX = 500;   // oldest posters dropped past this

/* Static assets to pre-cache on install */
const STATIC_ASSETS = [
  '',
  'index.html',
  'discover.html',
  'discover-list.html',
  'tv-shows.html',
  'library.html',
  'movies.html',
  'anime.html',
  'cartoons.html',
  'completed.html',
  'friends.html',
  'profile.html',
  'profile-view.html',
  'lists.html',
  'list-view.html',
  'episodes.html',
  'notes.html',
  'notifications.html',
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
  'js/discover-categories.js',
  'js/sort-filter.js',
  'js/category.js',
  'js/rewatch.js',
  'js/create-card.js',
  'js/export.js',
  'js/info-popup.js',
  'js/rating-popup.js',
  'js/note-popup.js',
  'js/list-popup.js',
  'js/profile-tabs.js',
  'js/dashboard.js',
  'js/library-view.js',
  'js/episode-ratings.js',
  'js/tv-schedule.js',
  'js/friend-popups.js',
  'manifest.json',
  'icons/logo-nav.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
];

/* ── Install: pre-cache static assets ── */
self.addEventListener('install', event => {
  event.waitUntil(
    // Cached one-by-one (not cache.addAll) — addAll is all-or-nothing,
    // so a single missing/renamed file would silently leave NOTHING
    // precached, including offline.html.
    caches.open(STATIC_CACHE).then(cache =>
      // cache:'reload' skips the browser's HTTP cache — GitHub Pages lets files
      // sit there for 10 minutes, so right after a deploy the new version could
      // otherwise get precached with OLD copies of some files (mixed versions:
      // new pages calling code that isn't there yet).
      Promise.allSettled(STATIC_ASSETS.map(asset =>
        cache.add(new Request(asset, { cache: 'reload' })).catch(err => console.warn('SW: failed to cache', asset, err))
      ))
    )
  );
  self.skipWaiting();
});

/* ── Activate: clean up old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('mss-') && !KEEP_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* Local development (VS Code Live Server etc.): never cache anything, so
   every save shows up on the next reload. */
const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

/* ── Fetch: route requests ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (IS_LOCAL) return;

  // A user-triggered hard refresh (Ctrl/Cmd+Shift+R) only bypasses the
  // browser's HTTP cache for THIS ONE request — it says nothing about
  // every other page's cached copy. Browsers mark a hard reload's
  // navigation request with request.cache === 'reload' (and usually a
  // Cache-Control/Pragma: no-cache header too). We treat that as "the
  // user wants everything fresh" and wipe every cache we own — same-
  // origin pages, JS, CSS, everything — so the NEXT navigation to any
  // other page also comes from the network, not stale cache, instead
  // of needing a separate hard refresh on every single page.
  const isHardReload = request.mode === 'navigate' && (
    request.cache === 'reload' ||
    request.headers.get('cache-control') === 'no-cache' ||
    request.headers.get('pragma') === 'no-cache'
  );
  if (isHardReload && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const keys = await caches.keys();
      // Only the versioned page/JS/CSS cache — posters, fonts and vendor
      // libraries are content-addressed and never go stale in a way a
      // hard refresh would fix, so wiping them just made the next loads slow.
      await Promise.all(keys.filter(k => k.startsWith('mss-') && !KEEP_CACHES.includes(k) || k === STATIC_CACHE).map(k => caches.delete(k)));
      try {
        return await fetch(request);
      } catch {
        return caches.match('offline.html');
      }
    })());
    return;
  }

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
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_MAX));
    return;
  }

  // Third-party libraries (Supabase JS etc.) — served instantly from cache,
  // refreshed in the background.
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(staleWhileRevalidate(request, VENDOR_CACHE));
    return;
  }

  // Google Fonts — cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // The site's own pages, JS and CSS — network first, so you always get the
  // version that's live (stale-while-revalidate kept serving the PREVIOUS
  // copy, so new pages could load next to old scripts). The cached copy is
  // used when offline, or if the network takes longer than 3.5s.
  if (url.origin === self.location.origin && (
      request.destination === 'document' ||
      request.destination === 'script'   ||
      request.destination === 'style'    ||
      url.pathname.includes('/css/')     ||
      url.pathname.includes('/js/'))) {
    event.respondWith(networkFirstFresh(request, STATIC_CACHE, 3500));
    return;
  }

  // Everything else — network first
  event.respondWith(networkFirst(request));
});

/* ══ Strategies ══ */

async function cacheFirst(request, cacheName, maxEntries) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // Opaque (no-cors) responses are skipped on purpose — browsers count
    // each one as several MB of storage quota, which fills the cache fast.
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
      if (maxEntries) trimCache(cacheName, maxEntries);
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Background refresh always checks with the server (no-cache = revalidate,
  // a quick 304 when nothing changed) so a stale HTTP-cache copy can't win.
  // (A page navigation can't be re-created with options, so it's fetched by URL.)
  const fresh = request.mode === 'navigate'
    ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(request, { cache: 'no-cache' });
  const fetchPromise = fresh.then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await fetchPromise || caches.match('offline.html');
}

async function networkFirstFresh(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  // (A page navigation can't be re-created with options, so it's fetched by URL.)
  const net = (request.mode === 'navigate'
      ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
      : fetch(request, { cache: 'no-cache' }))
    .then(response => { if (response.ok) cache.put(request, response.clone()); return response; });
  const timeout = new Promise(res => setTimeout(res, timeoutMs, null));
  try {
    const first = await Promise.race([net, timeout]);
    if (first) return first;
    // Slow network: show the saved copy now, the fresh one is saved for next time
    const cached = await cache.match(request);
    return cached || await net;
  } catch {
    const cached = await cache.match(request);
    return cached || (request.mode === 'navigate' ? caches.match('offline.html') : Response.error());
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match('offline.html');
  }
}

// Keeps a cache from growing forever — drops the oldest entries first.
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
}
