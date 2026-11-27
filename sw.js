/* ══════════════════════════════════════════
   sw.js — MyScreenFolio Service Worker
   Cache strategy: the site's own files from this version's cache (siteFirst); see each route below
══════════════════════════════════════════ */

const CACHE_VERSION = 'msf-v142';     // MyScreenFolio — restarted at v1 for the redesign launch on 18 Nov 2026 (was msf-v520; before that mss-v787)
const STATIC_CACHE  = `${CACHE_VERSION}-site`;   // a new suffix: an old "msf-v1-static" left on a device from the first v1 is never reused

/* Long-lived caches — deliberately NOT tied to CACHE_VERSION. Every deploy
   bumps the version, which used to wipe ALL cached posters, fonts and the
   Supabase library too, so the first visit after every update re-downloaded
   everything (the "sometimes slow" loads). These rarely change, so they now
   survive deploys. */
const IMAGE_CACHE   = 'mss-images';
const FONT_CACHE    = 'mss-fonts';
const CONFIG_CACHE  = 'mss-config';   // the guest showcase + poster wall (public reads, the same for everyone)
const KEEP_CACHES   = [STATIC_CACHE, IMAGE_CACHE, FONT_CACHE, CONFIG_CACHE];   // (the old CDN cache, mss-vendor, is cleared — libraries live in js/vendor now)
const IMAGE_CACHE_MAX = 500;   // oldest posters dropped past this

/* Static assets to pre-cache on install */
const STATIC_ASSETS = [
  '',
  'index.html',
  'discover.html',
  'discover-list.html',
  'browse.html',
  'tv-shows.html',
  'library.html',
  'movies.html',
  'anime.html',
  'cartoons.html',
  'item.html',
  'diary.html',
  'friends.html',
  'activity.html',
  'compare.html',
  'blend.html',
  'movie-night.html',
  'challenges.html',
  'polls.html',
  'episode-chat.html',
  'messages.html',
  'profile.html',
  'profile-view.html',
  'lists.html',
  'list-view.html',
  'episodes.html',
  'season.html',
  'episode.html',
  'notes.html',
  'notifications.html',
  'cabinet.html',
  'export.html',
  'ratings.html',
  'detail.html',
  'title.html',
  'person.html',
  'settings.html',
  'admin.html',
  'login.html',
  'user.html',
  'offline.html',
  'about.html',
  'contact.html',
  'privacy.html',
  'terms.html',
  'cookies.html',
  'css/legal.css',
  'js/legal.js',
  'js/consent.js',
  'css/theme.css',
  'css/style.css',
  'css/profile.css',
  'css/title.css',
  'css/social.css',
  'css/messages.css',
  'css/settings.css',
  'js/i18n.js',
  'js/config.js',
  'js/emoji-data.js',
  'js/db.js',
  'js/msf-store.js',
  'js/nav.js',
  'js/notif-settings.js',
  'js/settings-nav.js',
  'js/qr.js',
  'js/profile-stats.js',
  'js/settings-uploads.js',
  'js/settings-import.js',
  'js/discover-categories.js',
  'js/discover-results.js',
  'js/discover-home.js',
  'js/home.js',
  'js/home-guest.js',
  'css/discover.css',
  'css/showcase.css',
  'js/sort-filter.js',
  'js/pick.js',
  'js/follows.js', 'js/report.js',
  'css/fonts.css',
  'js/vendor/supabase-2.118.0.js',
  'js/rewatch.js',
  'js/create-card.js',
  'js/export.js',
  'js/export-studio.js',
  'js/export-formats.js',
  'js/export-image.js',
  'js/taste-profile.js',
  'js/year-review.js',
  'js/rating-curve.js',
  'fonts/Oswald-500.ttf',
  'fonts/Oswald-600.ttf',
  'fonts/Manrope-400.ttf',
  'fonts/Manrope-600.ttf',
  'fonts/BebasNeue-400.ttf',
  'js/info-popup.js',
  'js/title-view.js',
  'js/title-page.js',
  'js/person-page.js',
  'js/easter-egg.js',
  'js/screensaver.js',
  'js/note-popup.js',
  'js/panel.js',
  'js/list-popup.js',
  'js/list-studio.js',
  'js/list-actions.js',
  'js/profile-tabs.js',
  'js/profile-v2.js',
  'js/fav-suggest.js',
  'js/backdrop-tools.js',
  'js/backdrop-picker.js',
  'js/medal-card.js',
  'js/showcase-studio.js',
  'js/library-view.js',
  'js/episode-ratings.js',
  'js/episodes-home.js',
  'js/rate-form.js',
  'js/ep-chart.js',
  'js/tv-schedule.js',
  'js/browse.js',
  'js/social.js',
  'js/social-core.js',
  'js/social-nav.js',
  'js/msg-keys.js',
  'js/pin-pad.js',
  'js/messages.js',
  'js/vendor/sodium-sumo-0.8.4.js',
  'js/episode-chat.js',
  'js/show-pages.js',
  'js/movie-night.js',
  'js/date-range.js',
  'js/diary.js',
  'js/diary-views.js',
  'js/on-this-day.js',
  'js/splash.js',
  'js/shell-search.js',
  'js/folio-cards.js',
  'js/medals.js',
  'js/showcase.js',
  'js/spotlights.js',
  'js/challenges.js',
  'js/onboarding.js',
  'js/poster-wall.js',
  'js/avatar-upload.js',
  'js/guide.js',
  'js/guide-content.js',
  'css/onboarding.css',
  'css/guide.css',
  'manifest.json',
  'manifest-dark.json',
  'icons/logo-light.svg',
  'icons/logo-dark.svg',
  'icons/logo-nav.png',
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/icon-180.png',
  'icons/icon-dark-180.png',
  'icons/icon-192.png',
  'icons/icon-dark-192.png',
  'icons/icon-512.png',
  'icons/icon-dark-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/icon-maskable-dark-192.png',
  'icons/icon-maskable-dark-512.png',
];

/* ── Install: pre-cache static assets ──
   Each version's files go into its own cache, all fetched before it takes over, so a version's pages and code always
   come together. Files that didn't change since the last version aren't downloaded again (perf audit, 23 Nov 2026):
   the server is asked "still this one?" (If-None-Match with the saved copy's ETag) and a 304 keeps the saved copy —
   a deploy that changes three files costs a device three files, not the whole site (~7 MB). */
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const oldName = (await caches.keys()).filter(k => /^msf-v\d+-site$/.test(k) && k !== STATIC_CACHE).sort((a, b) => parseInt(b.slice(5)) - parseInt(a.slice(5)))[0];
    const old = oldName ? await caches.open(oldName) : null;
    // One by one (not cache.addAll, which is all-or-nothing: one missing file would leave NOTHING precached).
    // 'no-store' skips the browser's HTTP cache — GitHub Pages keeps files there for 10 minutes, so right after a
    // deploy the new version could otherwise be precached with OLD copies of some files.
    await Promise.allSettled(STATIC_ASSETS.map(async asset => {
      try {
        const prev = old && await old.match(asset), tag = prev?.headers.get('etag');
        const res = await fetch(new Request(asset, { cache: 'no-store', headers: tag ? { 'If-None-Match': tag } : {} }));
        if (res.status === 304 && prev) return cache.put(asset, prev);
        if (res.ok) return cache.put(asset, res);
        throw new Error(res.status);
      } catch (err) { console.warn('SW: failed to cache', asset, err); }
    }));
  })());
  self.skipWaiting();
});

/* ── Activate: clean up old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => (k.startsWith('msf-') || k.startsWith('mss-')) && !KEEP_CACHES.includes(k))
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
      await Promise.all(keys.filter(k => (k.startsWith('msf-') || k.startsWith('mss-')) && !KEEP_CACHES.includes(k) || k === STATIC_CACHE).map(k => caches.delete(k)));
      try {
        return await fetch(request);
      } catch {
        return caches.match('offline.html');
      }
    })());
    return;
  }

  // The guest showcase and the poster wall (117 / 078): public rows every visitor reads the same way —
  // answered from the device at once and refreshed in the background (stale-while-revalidate), so the
  // splash and the locked menus never wait on the network. Only these two tables' GETs.
  if (url.hostname.includes('supabase.co') && request.method === 'GET' && /^\/rest\/v1\/(site_config|sign_in_wall)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, CONFIG_CACHE));
    return;
  }

  // Never intercept other Supabase API calls — always fresh
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

  // The site's own font files (fonts/, css/fonts.css) — they never change, so cache first
  if (url.origin === self.location.origin && /\/fonts\/[^/]+\.(woff2|ttf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // The site's own pages, JS and CSS — from this version's cache at once (perf audit, 23 Nov 2026). It used to ask
  // the network first and wait up to 3.5 s on every file, so a weak phone signal slowed every page. Mixed versions
  // can't happen: each version's files are all fetched at install, into that version's own cache (above), and a
  // new version takes over only once its files are in. Every deploy bumps CACHE_VERSION — without it nobody gets
  // the changed files. A page's address with ?… uses the one saved copy of that page.
  if (url.origin === self.location.origin && (
      request.destination === 'document' ||
      request.destination === 'script'   ||
      request.destination === 'style'    ||
      url.pathname.includes('/css/')     ||
      url.pathname.includes('/js/'))) {
    event.respondWith(siteFirst(request));
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


// This version's saved copy at once; a file it doesn't have (never precached, or wiped by a hard refresh) from the
// network, saved for next time. Offline with nothing saved → the offline page.
async function siteFirst(request) {
  const cache = await caches.open(STATIC_CACHE), page = request.mode === 'navigate';
  const hit = await cache.match(request, { ignoreSearch: page });
  if (hit) return hit;
  try {
    const res = page ? await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }) : await fetch(request, { cache: 'no-cache' });
    if (res.ok) { const u = new URL(request.url); if (page) u.search = ''; cache.put(page ? u.href : request, res.clone()); }
    return res;
  } catch {
    return page ? (await caches.match('offline.html')) || Response.error() : Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const net = fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response; });
  if (cached) { net.catch(() => {}); return cached; }
  try { return await net; } catch { return new Response('[]', { status: 503, headers: { 'Content-Type': 'application/json' } }); }
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