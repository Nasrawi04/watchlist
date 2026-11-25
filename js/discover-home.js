/* ═══════════════════════════════════════════════════════════════
   discover-home.js — the Discover page (Discover redesign)

   1. Featured — #1 of Trending This Week over its backdrop, rotating through the top five
      (year · runtime · genres · your MSF score or TMDB's · your status · Open title · Trailer · Recommend)
   2. Also trending — #2–#5, See all → the Trending This Week list
   3. Picked for your taste — the one recommendation engine (MSSRecs): a reason on each card, Wild card on the
      wild ones, ⋯ → Not interested
   4. Browse by list — 12 colour tiles with fanned posters, the other 4 under More lists
   5. Top rated on MSF — a rail, with how many of them you've seen
   6. Your TV — new episodes, guide and calendar (tv-schedule.js), as before
   Guests see everything except what's personal (marks, progress, For your taste).
   Requires config.js, nav.js, discover-categories.js, discover-results.js, info-popup.js.
═══════════════════════════════════════════════════════════════ */

const MSSDiscoverHome = (() => {
  const esc = s => escHTML(s == null ? '' : String(s));
  const $ = id => document.getElementById(id);
  const TTL = 15 * 60 * 1000;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── A list's first page, kept 15 minutes for this visit (the same keys Home's Explore cards read) ── */
  const cacheKey = cat => 'disc_cache_' + cat.key + (cat.v ? '_v' + cat.v : '');
  function cached(cat) {
    try { const c = JSON.parse(sessionStorage.getItem(cacheKey(cat)) || 'null'); return c && Date.now() - c.t < TTL && c.items?.length ? c.items : null; } catch { return null; }
  }
  const asking = {};
  function firstPage(key) {
    const cat = getDiscoverCategory(key);
    const c = cached(cat);
    if (c) return Promise.resolve(c);
    return asking[key] ||= cat.fetch(1).then(items => {
      try { sessionStorage.setItem(cacheKey(cat), JSON.stringify({ t: Date.now(), items: items.slice(0, 20) })); } catch {}
      return items;
    }).finally(() => { delete asking[key]; });
  }

  /* ══ 1. Featured ══ */
  const F = { items: [], i: 0, timer: 0, paused: false, d: {} };
  const typeOf = it => it.media_type === 'movie' ? 'movie' : 'tv';
  function detailsOf(it) {
    const k = `${typeOf(it)}:${it.id}`;
    return F.d[k] ||= _discFetchJSON(`${TMDB_BASE}/${typeOf(it)}/${it.id}?language=en-US&append_to_response=videos,images&include_image_language=en,null`).catch(() => null);
  }
  const runtimeOf = (it, d) => {
    if (!d) return '';
    if (typeOf(it) === 'movie') { const m = d.runtime || 0; return m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : ''; }
    const s = d.number_of_seasons || 0; return s ? `${s} ${s === 1 ? 'season' : 'seasons'}` : '';
  };
  function featHTML(it, d, i) {
    const s = window._navUser ? MSSResults.stateOf(it) : null;
    const tmdb = it.score != null ? _discFloorScore(it.score) : null;
    const genres = (d?.genres || []).map(g => g.name.replace(' & ', ' · ')).slice(0, 3).join(' · ') || (it.genres || []).slice(0, 3).join(' · ');
    const trailer = d ? ((d.videos?.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer') || (d.videos?.results || []).find(v => v.site === 'YouTube')) : null;
    const key = `${typeOf(it)}:${it.id}`;
    window._discItemMap[key] = it;
    const chips = [it.year, runtimeOf(it, d), genres, s?.score == null && tmdb ? `★ ${tmdb} TMDB` : ''].filter(Boolean);
    // rated: your score ring on the title's row (owner, 16 Nov 2026); otherwise TMDB's (in the chips) and where it is in your library
    const ring = s?.score != null ? MSSViews.ring(Number(s.score), '', s.e?.status === 'dropped') : '';
    const you = s && s.score == null ? `<div class="df-you is-status"><span>${esc(s.label)}</span></div>` : '';
    const title = d ? tmdbTitleHTML(d, it.title, 'df-title', 'h2') : `<h2 class="df-title" translate="no">${esc(it.title)}</h2>`;
    const rec = window._navUser ? `onclick="MSSDiscoverHome.recommend('${key}')"` : `onclick="mssJoin('recommend titles to friends')"`;
    return `<div class="df-eyebrow">#${i + 1} Trending this week</div>
      ${ring ? `<div class="df-head">${title}${ring}</div>` : title}
      <div class="df-chips">${chips.map(c => `<span class="df-chip">${esc(c)}</span>`).join('')}</div>
      ${it.overview ? `<p class="df-ov" translate="no">${esc(it.overview)}</p>` : ''}
      ${you}
      <div class="df-acts">
        <button type="button" class="df-btn is-main" onclick="goToTitle('${typeOf(it)}', ${Number(it.id)})">Open title</button>
        ${trailer ? `<a class="df-btn" href="https://www.youtube.com/watch?v=${esc(trailer.key)}" target="_blank" rel="noopener" aria-label="Trailer (opens YouTube)">${icon('play', 15)}<span>Trailer</span></a>` : ''}
        <button type="button" class="df-btn" ${rec} aria-haspopup="dialog" aria-label="Recommend">${icon('send', 15)}<span>Recommend</span></button>
        ${window._navUser && !s ? `<span class="dx-act df-add">${MSSResults.actHTML(it)}</span>` : ''}
      </div>`;
  }
  async function featShow(i, first) {
    const it = F.items[i]; if (!it) return;
    F.i = i;
    const box = $('dzFeat'), inner = $('dzFeatIn');
    const d = await Promise.race([detailsOf(it), new Promise(r => setTimeout(() => r(null), first ? 1500 : 4000))]);
    if (F.i !== i) return;
    // the picture: loaded first, then cross-faded
    const bdPath = d?.backdrop_path || it.backdrop_path;
    if (bdPath) {
      const u = `https://image.tmdb.org/t/p/w1280${bdPath}`, im = new Image();
      im.onload = () => {
        if (F.i !== i) return;
        const layers = box.querySelectorAll('.df-bg img'), front = box.querySelector('.df-bg img.in'), back = [...layers].find(x => x !== front) || layers[0];
        back.src = u; back.classList.add('in'); front?.classList.remove('in'); box.classList.add('has-bd');
      };
      im.src = u;
    }
    const swap = () => { inner.innerHTML = featHTML(it, d, i); inner.classList.remove('is-out'); };
    if (first || reduced()) swap(); else { inner.classList.add('is-out'); setTimeout(() => { if (F.i === i) swap(); }, 280); }
    box.querySelectorAll('.df-dot').forEach((b, j) => { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; });
    box.setAttribute('aria-label', `Trending this week: ${it.title} (${i + 1} of ${F.items.length})`);
    detailsOf(F.items[(i + 1) % F.items.length]);        // the next one is ready when it comes round
    featSchedule();
  }
  function featSchedule() {
    clearTimeout(F.timer);
    if (reduced() || F.items.length < 2) return;
    F.timer = setTimeout(() => { if (F.paused || document.hidden) return featSchedule(); featShow((F.i + 1) % F.items.length); }, 10000);
  }
  function featGo(i) { featShow(i); }
  function renderFeatured(items) {
    F.items = items.slice(0, 5);
    const box = $('dzFeat');
    if (!F.items.length) { $('dzTop').hidden = true; return; }
    box.querySelector('.df-dots').innerHTML = F.items.map((it, j) => `<button type="button" class="df-dot" role="tab" aria-label="${esc(`#${j + 1} ${it.title}`)}" aria-selected="${j === 0}" tabindex="${j === 0 ? 0 : -1}" onclick="MSSDiscoverHome.go(${j})"></button>`).join('');
    box.onmouseenter = () => { F.paused = true; }; box.onmouseleave = () => { F.paused = false; };
    box.addEventListener('focusin', () => { F.paused = true; }); box.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget)) F.paused = false; });
    box.querySelector('.df-dots').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); const j = (F.i + (e.key === 'ArrowRight' ? 1 : -1) + F.items.length) % F.items.length; featShow(j); box.querySelectorAll('.df-dot')[j]?.focus();
    });
    featSwipe(box);
    featShow(0, true);
  }
  /* Swipe: left → the next title, right → the one before.
     - touch, pen and mouse: drag across it (vertical drags still scroll the page, touch-action: pan-y); a drag that
       started on a button or link doesn't also press it, and a mouse press on one is left to it
     - laptop trackpad (and sideways scroll wheels): a two-finger swipe sideways, one title per swipe */
  function featSwipe(box) {
    const dirOf = left => (getComputedStyle(box).direction === 'rtl' ? -1 : 1) * (left ? 1 : -1);
    const step = d => featShow((F.i + d + F.items.length) % F.items.length);
    let x0 = null, y0 = 0, id = null, swiped = false;
    box.addEventListener('pointerdown', e => {
      if (F.items.length < 2 || e.button > 0) return;
      if (e.pointerType === 'mouse' && e.target.closest('a, button, input, select, textarea')) return;
      x0 = e.clientX; y0 = e.clientY; id = e.pointerId; swiped = false;
    }, { passive: true });
    const end = e => {
      if (x0 == null || e.pointerId !== id) return;
      const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      swiped = true;
      if (e.pointerType === 'mouse') getSelection()?.removeAllRanges();   // the drag isn't left as selected text
      step(dirOf(dx < 0));
    };
    box.addEventListener('pointerup', end, { passive: true });
    box.addEventListener('pointercancel', () => { x0 = null; }, { passive: true });
    box.addEventListener('click', e => { if (swiped) { swiped = false; e.preventDefault(); e.stopPropagation(); } }, true);
    box.addEventListener('dragstart', e => e.preventDefault());   // a mouse drag over the picture moves the titles, not the image
    // trackpad: add up the sideways scroll; once it's a swipe, step once and ignore the rest of that gesture
    // (its momentum) until the fingers have been still for a moment
    let sum = 0, locked = false, quiet = 0;
    box.addEventListener('wheel', e => {
      if (F.items.length < 2 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();   // no browser back/forward swipe while moving through the titles
      clearTimeout(quiet); quiet = setTimeout(() => { sum = 0; locked = false; }, 180);
      if (locked) return;
      sum += e.deltaX;
      if (Math.abs(sum) < 60) return;
      locked = true;
      step(dirOf(sum > 0));
      sum = 0;
    }, { passive: false });
  }
  function recommend(key) {
    const it = window._discItemMap[key]; if (!it) return;
    mssRecommend({ tmdb_id: Number(it.id), media_type: it.media_type, title: it.title, poster_url: it.poster_url, year: it.year });
  }

  /* ══ 2. Also trending ══ */
  function renderAlso(items) {
    // the list row every Discover list uses, in its compact size (MSSResults.row)
    $('dzAlsoList').innerHTML = items.slice(1, 5).map((it, j) => MSSResults.row(it, { rank: j + 2, compact: true })).join('');
  }

  /* ══ 3. Picked for your taste — the one recommendation engine (MSSRecs, discover-categories.js; owner, 19 Nov 2026) ══
     Each card says why it's there; a wild card says so on its poster; ⋯ → Not interested (gone at once, Undo) */
  const andList = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} & ${a[a.length - 1]}`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function tasteHead(t) {
    $('dzTasteT').textContent = t.genres.length ? `Because you love ${andList(t.genres)}` : 'Picked for your taste';
    const b = t.basis || {}, from = [b.favs ? plural(b.favs, 'favourite', 'favourites') : '', b.rated ? plural(b.rated, 'rated title', 'rated titles') : '', b.people ? plural(b.people, 'favourite person', 'favourite people') : ''].filter(Boolean);
    $('dzTasteSub').textContent = t.newbie || !from.length ? 'A starting point — rate what you watch and pick favourites, and these get sharper' : `From your ${andList(from)}`;
  }
  // It sits above Browse by list but takes longest to work out: when this device showed it before, its heading and
  // placeholder cards hold its place from the start, so the lists below don't jump down when it arrives
  function tasteHold() {
    const t = MSSRecs.last();
    if (!window.mssSignedInHint || !t?.items?.length) return;
    tasteHead(t);
    $('dzTasteRail').innerHTML = MSSCard.skel(8);
    $('dzTaste').hidden = false;
  }
  let tasteShown = '';
  function paintTaste(t) {
    const ids = t.items.slice(0, 20).map(it => it.media_type + it.id).join();
    if (ids === tasteShown) return;                   // the same picks: nothing redrawn
    tasteShown = ids;
    tasteHead(t);
    $('dzTasteRail').innerHTML = t.items.slice(0, 20).map(it => MSSResults.recCard(it, 'discover')).join('');
    $('dzTaste').hidden = false;
    mssRailEdges($('dzTasteRail'));
  }
  async function renderTaste() {
    const sec = $('dzTaste');
    // your library now comes from this device in a few ms (msf-store.js) — often before the header has finished
    // signing you in, so wait for it rather than hiding the row (owner, 25 Nov 2026: the row had vanished)
    for (let i = 0; i < 50 && !window._navUser; i++) await new Promise(r => setTimeout(r, 100));
    if (!window._navUser) { sec.hidden = true; return; }
    // your last picks at once (this device, this account), then checked
    const was = MSSRecs.last(MSSResults.entries());
    if (was?.items.length) paintTaste(was);
    for (let i = 0; i < 40 && !window._navUserProfile; i++) await new Promise(r => setTimeout(r, 100));   // your favourites come with your profile
    const t = await MSSRecs.build(MSSResults.entries(), window._navUserProfile || {}).catch(e => { console.warn('Picked for your taste:', e); return null; });
    if (!t || !t.items.length) { if (!was?.items.length) sec.hidden = true; return; }
    paintTaste(t);
  }
  MSSResults.recHooks('discover', { empty: () => { $('dzTaste').hidden = true; }, undo: () => { tasteShown = ''; renderTaste(); } });

  /* ══ 4. Browse by list ══ */
  // six groups of up to four (owner, 25 Nov 2026): what's on now · MSF's Top 250s · TMDB's Top 250s · seasons &
  // episodes (TMDB's and MSF's) · upcoming · the niche picks. The first three on show, the rest under More lists.
  // Each group has its own heading, so its tiles carry short names (Movies, TV Shows…) — the full name is the link's label.
  const GROUPS = [
    { h: 'Right now', note: 'What everyone’s watching this week, tonight and in cinemas',
      keys: ['trending_week', 'popular', 'airing_today', 'out_now'] },
    { h: 'Top 250 on MyScreenFolio', note: 'Ranked by members’ own scores',
      keys: ['top_rated_mss_movies', 'top_rated_mss_tv', 'top_rated_mss_anime', 'top_rated_mss_cartoons'], short: ['Movies', 'TV Shows', 'Anime', 'Cartoons'] },
    { h: 'Top 250 on TMDB', note: 'The all-time greats, by TMDB score',
      keys: ['top250_movies', 'top250_shows', 'top250_anime', 'top250_cartoons'], short: ['Movies', 'TV Shows', 'Anime', 'Cartoons'] },
    { h: 'Best seasons and episodes', note: 'By TMDB score, and by members’ scores',
      keys: ['top_seasons', 'top_episodes', 'top_seasons_mss', 'top_episodes_mss'], short: ['Seasons', 'Episodes', 'Seasons on MSF', 'Episodes on MSF'] },
    { h: 'Coming soon', note: 'Not out yet, most anticipated first',
      keys: ['upcoming_movies', 'upcoming_tv', 'upcoming_anime', 'upcoming_cartoons'], short: ['Movies', 'TV Shows', 'Anime', 'Cartoons'] },
    { h: 'Hidden gems', note: 'Glowing scores, barely any votes',
      keys: ['niche_movies', 'niche_shows'], short: ['Movies', 'TV Shows'] },
  ];
  const SHOWN = 3, MAIN = GROUPS.slice(0, SHOWN).flatMap(g => g.keys), MORE = GROUPS.slice(SHOWN).flatMap(g => g.keys);
  const XP_STORE = 'mss_explore_posters_v1', XP_FRESH = 6 * 3600e3;
  const xpAll = () => { try { return JSON.parse(localStorage.getItem(XP_STORE) || '{}'); } catch { return {}; } };
  // the Explore card (owner, 25 Nov 2026: the old design, with the groups' short names): the list's #1 poster blurred
  // under its colours, a big faint number, a badge, the name and a line, Explore, and its top three posters fanned
  const NUM = { top_rated_mss_movies: 'MSF', top_rated_mss_tv: 'MSF', top_rated_mss_anime: 'MSF', top_rated_mss_cartoons: 'MSF', top_seasons_mss: 'MSF', top_episodes_mss: 'MSF',
    trending_week: '#1', popular: 'HOT', airing_today: 'NEW', out_now: 'NOW', top250_movies: '250', top250_shows: '250', top250_anime: '250', top250_cartoons: '250',
    niche_movies: 'GEM', niche_shows: 'GEM', upcoming_movies: 'SOON', upcoming_tv: 'SOON', upcoming_anime: 'SOON', upcoming_cartoons: 'SOON', top_seasons: 'S', top_episodes: 'EP' };
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  function tileHTML(key, short, group) {
    const cat = getDiscoverCategory(key), m = discoverMeta(key);
    // read out as "<group>: <name>, <line>" — the group's name is only heard (its heading is right above)
    return `<a class="dk-tile" href="discover-list.html?list=${encodeURIComponent(key)}" style="--xp-a:${m.a};--xp-b:${m.b}" data-tile="${key}">
      <span class="dk-bg" aria-hidden="true"></span><span class="dk-shade" aria-hidden="true"></span>
      <span class="dk-num" aria-hidden="true">${NUM[key] || ''}</span>
      <span class="dk-text">
        <span class="dk-badge" aria-hidden="true">${esc(m.eyebrow.split(' · ')[0])}</span>
        <span class="dk-title">${short && group ? `<span class="sr-only">${esc(group)}: </span>` : ''}${esc(short || cat.title)}</span>
        <span class="dk-sub">${esc(m.tile)}</span>
        <span class="dk-cta" aria-hidden="true">Explore ${ARROW}</span>
      </span>
      <span class="dk-fan" aria-hidden="true"><span class="dk-p"></span><span class="dk-p"></span><span class="dk-p"></span></span></a>`;
  }
  function fillTile(key, posters) {
    document.querySelectorAll(`.dk-tile[data-tile="${key}"]`).forEach(tile => {
      const first = safeURL(posters[0]), bg = tile.querySelector('.dk-bg');
      if (first && bg && !bg.classList.contains('on')) {
        const im = new Image(); im.onload = () => { bg.style.backgroundImage = `url('${first.replace(/\/(w\d+|original)\//, '/w342/')}')`; bg.classList.add('on'); };
        im.src = first.replace(/\/(w\d+|original)\//, '/w342/');
      }
      tile.querySelectorAll('.dk-p').forEach((p, i) => {
        const u = safeURL(posters[i]); if (!u || p.firstChild) return;
        const im = new Image(); im.alt = ''; im.decoding = 'async'; im.onload = () => p.classList.add('in'); im.src = u.replace(/\/(w\d+|original)\//, '/w185/'); p.appendChild(im);
      });
    });
  }
  function postersFor(keys) {
    const saved = xpAll();
    let delay = 0;
    keys.forEach(key => {
      // posters saved before the list's rules last changed (its v) are dropped, not shown (owner, 25 Nov 2026:
      // The Lion King stayed on Top 250 Movies on MSF after cartoons got their own list)
      const s0 = saved[key], s = s0 && (s0.v || 0) === (getDiscoverCategory(key)?.v || 0) ? s0 : null;
      if (s?.posters?.length) fillTile(key, s.posters);
      if (s && Date.now() - s.t < XP_FRESH && s.posters?.length >= 3) return;
      const cat = getDiscoverCategory(key);
      const c = cached(cat);
      const use = items => { const posters = _discSaveTilePosters(key, items); if (posters) fillTile(key, posters); };
      // seasons / episodes: the saved top three stay until the list is opened (discover-list.html saves them again);
      // with none saved yet, once from the weekly shared list (never worked out just for a tile)
      if (cat.lazy) { if (!s?.posters?.length) cat.peek().then(items => items && use(items)).catch(() => {}); return; }
      if (c) return use(c);
      setTimeout(() => firstPage(key).then(use).catch(() => {}), (delay += 260));
    });
  }
  // phones: the More lists rows are always shown and the button hides (CSS) — owner, 19 Nov 2026
  const PHONE = matchMedia('(max-width:640px)');
  const group = g => `<div class="dk-group">
      <div class="dk-gh"><h3>${esc(g.h)}</h3><span>${esc(g.note)}</span></div>
      <div class="dk-grid dk-line">${g.keys.map((k, i) => tileHTML(k, g.short?.[i], g.h)).join('')}</div>
    </div>`;
  function renderLists() {
    $('dzTiles').innerHTML = GROUPS.slice(0, SHOWN).map(group).join('');
    $('dzTilesMore').innerHTML = GROUPS.slice(SHOWN).map(group).join('');
    let seenOnce = false;
    const seen = () => { if (seenOnce) return; seenOnce = true; postersFor(PHONE.matches ? MAIN.concat(MORE) : MAIN); };
    PHONE.addEventListener('change', () => { if (PHONE.matches && seenOnce) postersFor(MORE); });
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); seen(); } }, { rootMargin: '300px 0px' }) : null;
    io ? io.observe($('dzLists')) : seen();
    // …and quietly in the background once the page has settled (owner, 23 Nov 2026): every list's first page and
    // tile posters, so scrolling down — or opening a list — has them ready. Not on Data Saver / 2G.
    const c = navigator.connection;
    if (c && (c.saveData || /2g$/.test(c.effectiveType || ''))) return;
    const later = () => { io?.disconnect(); seen(); postersFor(MORE); };
    const soon = () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(later, { timeout: 4000 }) : later()), 1500);
    document.readyState === 'complete' ? soon() : addEventListener('load', soon, { once: true });
  }
  function toggleMore(btn) {
    const box = $('dzTilesMore'), open = box.hidden;
    box.hidden = !open;
    btn.setAttribute('aria-expanded', open);
    btn.querySelector('span').textContent = open ? 'Fewer lists' : `More lists (${MORE.length})`;
    if (open) { postersFor(MORE); box.querySelector('a')?.focus({ preventScroll: true }); }
  }

  /* ══ 5. Top rated on MSF ══ */
  let mssItems = [];
  function renderMss(items) {
    mssItems = items.slice(0, 12);
    if (!mssItems.length) { $('dzMss').hidden = true; return; }
    $('dzMssRail').innerHTML = mssItems.map((it, i) => MSSResults.card(it, { rank: i + 1 })).join('');
    mssRailEdges($('dzMssRail'));
    mssProgress();
  }
  function mssProgress() {
    const box = $('dzMssProg');
    if (!window._navUser || !mssItems.length) { box.hidden = true; return; }
    const linked = mssItems.filter(it => it.id != null);
    const seen = linked.filter(it => { const s = MSSResults.stateOf(it); return s && (s.k === 'seen' || s.score != null); }).length;
    const pct = linked.length ? Math.round(seen / linked.length * 100) : 0;
    box.innerHTML = `<span class="dz-prog-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Seen ${seen} of ${linked.length}"><i style="width:${pct}%"></i></span>
      <span class="dz-prog-t">You’ve seen <b>${seen}</b> of ${linked.length}</span>`;
    box.hidden = false;
  }

  /* ══ The page ══ */
  async function load(k, fn, onFail) {
    try { fn(await firstPage(k)); } catch (e) { console.error(`Discover (${k}):`, e); onFail?.(e); }
  }
  // your library arrived (or changed): every mark, the hero's status and the progress follow
  function redrawMine() {
    if (F.items.length) { const it = F.items[F.i]; detailsOf(it).then(d => { if (F.items[F.i] === it) $('dzFeatIn').innerHTML = featHTML(it, d, F.i); }); }
    const t = firstPage('trending_week'); t.then(renderAlso).catch(() => {});
    if (mssItems.length) renderMss(mssItems);
  }
  function init() {
    tasteHold();
    renderLists();
    // what's cached shows at once; the rest comes in (Trending first — it fills the top of the page)
    load('trending_week', items => { renderFeatured(items); renderAlso(items); }, () => { $('dzTop').hidden = true; });
    setTimeout(() => load('top_rated_mss', renderMss, () => { $('dzMss').hidden = true; }), cached(getDiscoverCategory('top_rated_mss')) ? 0 : 300);
  }
  async function signedIn() {
    if (!(await MSSResults.ready())) { $('dzTaste').hidden = true; return; }   // a guest (or no library): no taste row, even one held from before
    redrawMine();
    renderTaste();
  }
  document.addEventListener('mss:library-changed', () => { MSSResults.refresh().then(ok => { if (ok) redrawMine(); }).catch(() => {}); });

  return { init, signedIn, go: featGo, recommend, toggleMore };
})();
