/* ══════════════════════════════════════════
   category.js — Async, Supabase-backed
   Supports list/grid view per section
══════════════════════════════════════════ */

let _catUser   = null;
let _catAll    = [];
// Dropped starts closed every time you come to the page — opening it lasts only while you're here
const collapsed   = { watching: false, queue: false, completed: false, dropped: true };
window.addEventListener('pageshow', ev => { if (ev.persisted && !collapsed.dropped) toggleSection('dropped'); });   // Back / Forward restore → closed again
const _sort = { watching: 'newest', queue: 'newest', completed: 'newest', ongoing: 'newest', dropped: 'newest' };

/* ── Info popup: the shared MSSInfo popup (info-popup.js), with your
   own entry's actions (Start Watching / Up Next / Edit / Discover /
   Discover Card / Delete) wired to this page's functions. ── */
// After a delete from either popup: drop it from this page and re-render
function _catRemoveEntry(x) {
  _catAllRaw = _catAllRaw.filter(y => y.id !== x.id);
  _catAll = _catAll.filter(y => y.id !== x.id);
  renderSections();
}

/* ── To Be Continued: new episodes out ──
   A show you'd caught up on stays in To Be Continued — nothing in your library moves by itself.
   Once an episode past where you stopped has fully aired (mssNewEpisodes, config.js: air date
   before today on TMDB — announced / future episodes don't count) it gets the "New Season" poster
   cover + badge, sits at the top of the section (default sort) and an Up Next button (markUpNext). */
let _catNewEps = {};   // entry id → the latest aired episode { s, n, air }
async function _catCheckNewEps() {
  // first: shows saved with seasons that aren't out yet → aired counts (mssFixUnaired, config.js)
  await mssFixUnaired(_catAllRaw, _catUser?.id, () => { _catAll = _applyCatTypeFilter(_catAllRaw); _catRenderStatsAndSections(); });
  const found = await mssNewEpisodes(_catAll);
  if (JSON.stringify(found) === JSON.stringify(_catNewEps)) return;
  _catNewEps = found;
  renderSections();
}
// The Up Next button: the same icon as the Up Next poster cover, everywhere
const _catUpNextIcon = () => icon('skipForward', 15);

function openCatInfoPopup(id) {
  const e = _catAll.find(en => en.id === id);
  if (!e) return;
  MSSViews.open(e, {
    own: true, start: 'info',
    onChange: _catRenderStatsAndSections,   // a status change (Drop / Pick Back Up…) moves it between sections + counts
    onDelete: _catRemoveEntry, onComments: x => MSSComments.open(x),
    handlers: { start: x => (e.status === 'up_next' ? resumeEntry(x) : startWatching(x)), upnext: markUpNext },
  });
}


/* ── Shared ep/runtime badge helper ── */
function _entryMeta(e) {
  const isMovie = e.cat === 'movies' || (e.ratings?._media_type === 'movie');
  if (isMovie) {
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    if (!rtH && !rtM) return '';
    const label = rtH ? `${rtH}h ${rtM}m` : `${rtM}m`;
    return `<div class="w-ep-row"><span class="w-ep-badge">${label}</span></div>`;
  }
  // Same logic as _queueScope — show shape of the show
  const bd = Array.isArray(e.ratings?._season_breakdown)
    ? e.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number) : [];
  const _bdTot = bd.reduce((a,b)=>a+b,0);
  const scope = bd.length ? `S${bd.length} · E${_bdTot}`
    : (e.total_seasons && e.total_eps) ? `S${e.total_seasons} · E${e.total_eps}`
    : e.total_seasons ? `S${e.total_seasons}`
    : e.total_eps ? `${e.total_eps} eps` : '';
  if (!scope) return '';
  return `<div class="w-ep-row"><span class="w-ep-badge">${scope}</span></div>`;
}

/* ── Ongoing badge: shows last watched position (S3 E10) ── */
function _ongoingMeta(e) {
  const isMovie = e.ratings?._media_type === 'movie';
  if (isMovie) return _entryMeta(e);
  // Show current position — where the user stopped watching
  if (e.season != null && e.episode != null) {
    return `<div class="w-ep-row"><span class="w-ep-badge">S${e.season} · E${e.episode}</span></div>`;
  }
  if (e.season != null) {
    return `<div class="w-ep-row"><span class="w-ep-badge">S${e.season}</span></div>`;
  }
  if (e.watched) {
    return `<div class="w-ep-row"><span class="w-ep-badge">${e.watched} eps</span><span class="w-ep-total">watched</span></div>`;
  }
  // No current-position data — fall back to the same season/episode
  // totals the popup already reads (_season_breakdown/total_seasons/
  // total_eps), so an entry with totals filled in but no tracked
  // position still shows something instead of a blank badge.
  return _entryMeta(e);
}

function _enjoymentVal(e) {
  const v = e.ratings?.enjoyment;
  return (v !== undefined && v !== null && v !== '') ? Number(v) : null;
}

/* Generic version — works for any rating key (core or bonus), not just
   enjoyment. Enjoyment itself is just one of the CORE_RATINGS entries now,
   so it's reached through this same path as everything else. */
function _ratingVal(e, key) {
  const v = e.ratings?.[key];
  return (v !== undefined && v !== null && v !== '') ? Number(v) : null;
}

/* Every rating a category supports — core ratings (incl. Enjoyment, which
   lives in CORE_RATINGS/ANIME_CORE_RATINGS already) first, then bonus
   ratings. Animation Quality is a toggleable bonus for non-animated
   categories (TV/Movies) but a built-in core rating for Anime/Cartoons —
   getRatings() already returns the right set per category, so this just
   adds the conditional Animation option for the non-animated case. */
function _ratingFilterOptions(cat) {
  const { core, bonus } = getRatings(cat);
  const isAnimated = cat === 'anime' || cat === 'cartoons';
  const opts = core.map(r => ({ key: r.key, label: r.label, group: 'Core' }));
  if (!isAnimated) opts.push({ key: 'animation', label: 'Animation Quality', group: 'Core' });
  bonus.forEach(r => opts.push({ key: r.key, label: r.label, group: 'Bonus' }));
  return opts;
}

function _ratingFilterLabel(cat, key) {
  const opt = _ratingFilterOptions(cat).find(o => o.key === key);
  return opt ? opt.label : key;
}

// Sorting now lives in js/sort-filter.js (SF.list / SF.setSort).

/* ══════════════════════════════════════════════════════════════════
   Sort & Filter — now powered by the shared js/sort-filter.js module
   (same popups on every page). This block only describes what's
   specific to the category pages.
   ══════════════════════════════════════════════════════════════════ */
function _sfBaseEntries(section) {
  if (section === 'watching') return _catAll.filter(e => e.status === 'watching' || e.status === 'up_next' || e.status === 'paused');
  if (section === 'queue')    return _catAll.filter(e => e.status === 'queue');
  if (section === 'ongoing')  return _catAll.filter(e => e.status === 'ongoing');
  if (section === 'dropped')  return _catAll.filter(e => e.status === 'dropped');
  return _catAll.filter(e => e.status === 'completed');
}

function _catSectionContent(section, sorted) {
  return section === 'watching' ? buildWatchingContent(sorted)
       : section === 'queue'    ? buildQueue(sorted)
       : section === 'ongoing'  ? buildCompleted(sorted, 'ongoing')
       : section === 'dropped'  ? buildDropped(sorted)
       :                          buildCompleted(sorted, 'completed');
}

SF.register('cat', {
  base: _sfBaseEntries,
  render(section, sorted) {
    const inner = document.querySelector(`#body-${section} .accordion-inner`);
    if (!inner) return;
    inner.innerHTML = sortBar(section) + _catSectionContent(section, sorted);
    if (typeof fitTitleYear === 'function') fitTitleYear(inner);
  },
  sortState: _sort,
  watched: section => section === 'completed' || section === 'ongoing',   // Year Watched filter
  // Length: movies by runtime, shows by seasons / episodes (Anime / Cartoons have both)
  sorts: section => ['alpha', 'added', 'release', !IS_MOVIE_CAT() && 'episode', section !== 'queue' && 'ratings',
    ...(IS_MOVIE_CAT() ? ['runtime'] : window.PAGE_CAT === 'tv' ? ['seasons', 'episodes'] : ['runtime', 'seasons', 'episodes'])],
  lengthKind: () => IS_MOVIE_CAT() ? 'movie' : window.PAGE_CAT === 'tv' ? 'show' : 'mixed',
  ratingSort: {
    show: section => section === 'completed' || section === 'ongoing',
    options: () => _ratingFilterOptions(window.PAGE_CAT),
    label: key => _ratingFilterLabel(window.PAGE_CAT, key),
    value: _ratingVal,
  },
  // Currently Watching order: watching → Up Next → Taking a Break
  postSort: (section, list) => section === 'watching'
    ? [...list.filter(e => e.status === 'watching'), ...list.filter(e => e.status === 'up_next'), ...list.filter(e => e.status === 'paused')]
    : list,
  saveRatings: (entry, ratings) => updateProgress(entry.id, _catUser.id, { ratings }).catch(() => {}),
  onSearch: () => renderSections(),          // search narrows every section at once
});
// The page's search box: just above the sections, drawn once (renderSections never touches it)
function _catSearchBox() {
  const wrap = document.getElementById('sectionsWrap');
  if (!wrap || document.querySelector('.sf-search[data-scope="cat"]')) return;
  const label = CAT_META[window.PAGE_CAT]?.label || 'library';
  wrap.insertAdjacentHTML('beforebegin', `<div class="sf-search-row fade-up fade-up-2">${SF.searchHTML('cat', `Search your ${label}…`)}</div>`);
}

function sortBar(section)          { return SF.bar('cat', section); }
function setSort(section, value)   { SF.setSort('cat', section, value); }
function _applySortFilter(section) { SF.refresh('cat', section); }

const IS_MOVIE_CAT = () => window.PAGE_CAT === 'movies';
// Type tag (Movie/TV Show label on cards) is redundant on the Movies/TV
// Shows pages (the whole page is already one type) but still useful on
// Anime/Cartoons pages, where movie and show entries mix together —
// unless the person has filtered that page down to just one type via
// the Movie/TV Show filter, at which point it's redundant there too.
const SHOW_TYPE_TAG = () => (window.PAGE_CAT === 'anime' || window.PAGE_CAT === 'cartoons')
  && (typeof _catTypeFilter === 'undefined' || _catTypeFilter === 'all');
/* Returns the badge context string for the current page */
function catContext() {
  const c = window.PAGE_CAT;
  if (c === 'anime')    return 'anime';
  if (c === 'cartoons') return 'cartoons';
  return null; // tv / movies → no badges in category pages
}

// Back/forward navigation (e.g. returning from detail.html after adding
// or editing an entry) can restore the page from the browser's bfcache
// instead of re-running this script — meaning _catAll stays whatever it
// was BEFORE that add/edit happened, so a just-added entry's tmdb_id
// (and everything else) silently looks missing until an actual reload.
// event.persisted is true specifically for a bfcache restore.
window.addEventListener('pageshow', (event) => {
  if (event.persisted && _catUser) renderPage();
});

document.addEventListener('DOMContentLoaded', () => {
  initPage(async (user) => {
    _catUser = user;
    if (!user) {
      const cat = CAT_META[window.PAGE_CAT];
      document.querySelector('.btn-add-entry')?.style && (document.querySelector('.btn-add-entry').style.display = 'none');
      document.getElementById('sectionsWrap').innerHTML = `
        <div class="guest-page-state fade-up">
          <div class="guest-page-icon">${icon(cat?.icon || 'tv', 36)}</div>
          <h2 class="guest-page-title">Your ${cat?.label || 'Library'}</h2>
          <p class="guest-page-sub">Sign in to start tracking what you watch.</p>
          <div class="guest-cta">
            <a href="login.html" class="guest-btn-primary">Sign In</a>
            <a href="login.html#signup" class="guest-btn-secondary">Create Account</a>
          </div>
        </div>`;
      return;
    }
    _catSearchBox();
    await renderPage();
    _catFocus();
    // Check if we arrived here from "Add to Watchlist" in profile-view
    var _addTitle = sessionStorage.getItem('addModalTitle');
    var _addCat   = sessionStorage.getItem('addModalCat');
    if (_addTitle) {
      sessionStorage.removeItem('addModalTitle');
      sessionStorage.removeItem('addModalCat');
      // Only auto-open if the cat matches this page
      if (!_addCat || _addCat === window.PAGE_CAT) {
        setTimeout(function() {
          openAddModal(window.PAGE_CAT);
          setTimeout(function() {
            var titleEl = document.getElementById('mTitle');
            if (titleEl) {
              titleEl.value = _addTitle;
              titleEl.dispatchEvent(new Event('input'));
            }
          }, 200);
        }, 400);
      }
    }
  });
});

function currentFile() {
  return CAT_META[window.PAGE_CAT]?.page || 'index.html';
}

/* ════════ FETCH + FULL RENDER ════════ */
let _catAllRaw = [];
let _catTypeFilter = 'all'; // 'all' | 'movie' | 'tv' — anime/cartoons only, since those are
                             // the categories that mix movie and show entries together.

function _catEntryIsMovie(e) {
  return e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
}

function _applyCatTypeFilter(arr) {
  if (_catTypeFilter === 'all') return arr;
  const wantMovie = _catTypeFilter === 'movie';
  return arr.filter(e => _catEntryIsMovie(e) === wantMovie);
}

const _CAT_TYPES = [['all', 'All Types'], ['movie', 'Movies'], ['tv', 'TV Shows']];
// Movies vs TV Shows (Anime / Cartoons) — the shared Type filter popup (SF.typeFilter)
function openCatTypeFilterPopup() {
  SF.typeFilter({ groups: [{ key: 'type', label: 'Type', options: _CAT_TYPES }], value: { type: _catTypeFilter }, onApply: v => setCatTypeFilter(v.type) });
}

function _catTypeFilterBar() {
  const wrap = document.getElementById('catTypeFilterWrap');
  if (!wrap) return;
  const isAnimated = window.PAGE_CAT === 'anime' || window.PAGE_CAT === 'cartoons';
  if (!isAnimated) { wrap.innerHTML = ''; return; }
  const label = _CAT_TYPES.find(t => t[0] === _catTypeFilter)[1];
  wrap.innerHTML = `<div class="sf-trigger-row" style="margin:0 0 18px;justify-content:flex-start;">
    ${SF.typeFilterButton('openCatTypeFilterPopup()', _catTypeFilter !== 'all' ? label : 'Filter', _catTypeFilter !== 'all')}
  </div>`;
}








function setCatTypeFilter(value) {
  _catTypeFilter = value;
  _catAll = _applyCatTypeFilter(_catAllRaw);
  _catTypeFilterBar();
  _catRenderStatsAndSections();
}

async function renderPage() {
  if (!_catUser) return;
  showLoading();
  _catAllRaw = await getEntries(_catUser.id, { cat: window.PAGE_CAT });
  _catAll = _applyCatTypeFilter(_catAllRaw);
  _catTypeFilterBar();
  _catRenderStatsAndSections();
  _catCheckNewEps();
}

function _catRenderStatsAndSections() {

  const watching  = _catAll.filter(e => e.status === 'watching' || e.status === 'up_next' || e.status === 'paused');
  const queue     = _catAll.filter(e => e.status === 'queue');
  const completed = _catAll.filter(e => e.status === 'completed');
  const ongoing   = _catAll.filter(e => e.status === 'ongoing');
  const dropped   = _catAll.filter(e => e.status === 'dropped');
  // Dropped (071): its count only once something's been dropped
  const droppedStat = dropped.length ? `<div class="page-stat"><div class="page-stat-num">${dropped.length}</div><div class="page-stat-label">Dropped</div></div>` : '';
  const isMovies  = IS_MOVIE_CAT();
  const onBreak   = watching.filter(e => e.status === 'paused').length;

  const _catLabel = _catAll.length === 1 ? CAT_META[window.PAGE_CAT]?.singular : CAT_META[window.PAGE_CAT]?.label;
  document.getElementById('catSubtitle').textContent =
    isMovies
      ? `${_catAll.length} ${_catLabel} · ${queue.length} on watchlist · ${completed.length} watched`
      : `${_catAll.length} ${_catLabel} · ${watching.filter(e=>e.status==='watching').length} watching · ${completed.length} watched`;

  if (isMovies) {
    const statsEl = document.getElementById('pageStats');
    statsEl.style.cssText = '';
    // Total watch time for completed movies
    const totalMins = _catAll
      .filter(e => e.status === 'completed')
      .reduce((sum, e) => sum + (Number(e.runtime_h)||0)*60 + (Number(e.runtime_m)||0), 0);
    const wtH = Math.floor(totalMins / 60);
    const wtM = totalMins % 60;
    const wtLabel = totalMins ? (wtH ? `${wtH}h ${wtM}m` : `${wtM}m`) : '—';
    statsEl.innerHTML = `
      <div class="page-stat"><div class="page-stat-num">${_catAll.length}</div><div class="page-stat-label">Total</div></div>
      <div class="page-stat"><div class="page-stat-num">${watching.filter(e=>e.status==='watching').length}</div><div class="page-stat-label">Watching</div></div>
      <div class="page-stat"><div class="page-stat-num">${queue.length}</div><div class="page-stat-label">Watchlist</div></div>
      <div class="page-stat"><div class="page-stat-num">${completed.length}</div><div class="page-stat-label">Watched</div></div>
      ${droppedStat}
      ${totalMins ? `<div class="page-stat"><div class="page-stat-num">${wtLabel}</div><div class="page-stat-label">Watch Time</div></div>` : ''}`;
  } else {
    const isTv = window.PAGE_CAT === 'tv';
    const isAnimated = window.PAGE_CAT === 'anime' || window.PAGE_CAT === 'cartoons';
    const totalEpsWatched = _catAll
      .filter(e => e.status === 'watching' || e.status === 'up_next' || e.status === 'paused' || e.status === 'completed' || e.status === 'ongoing' || e.status === 'dropped')   // a dropped show's episodes still count
      .reduce((sum, e) => {
        const mtype = e.ratings?._media_type || 'show';
        if (mtype === 'movie') return sum;
        if (e.status === 'completed' || e.status === 'ongoing') return sum + (Number(e.total_eps) || Number(e.watched) || 0);
        return sum + (Number(e.watched) || 0);
      }, 0);
    const statsEl = document.getElementById('pageStats');
    if (isAnimated) {
      // Anime/Cartoon — 6 stats including movie watch time
      const totalMovieMins = _catAll
        .filter(e => (e.ratings?._media_type === 'movie') && e.status === 'completed')
        .reduce((sum, e) => sum + (Number(e.runtime_h)||0)*60 + (Number(e.runtime_m)||0), 0);
      const wtH2 = Math.floor(totalMovieMins / 60);
      const wtM2 = totalMovieMins % 60;
      const wtLabel2 = totalMovieMins ? (wtH2 ? `${wtH2}h ${wtM2}m` : `${wtM2}m`) : '—';
      statsEl.classList.add('mixed-stats');
      statsEl.innerHTML = `
        <div class="page-stat"><div class="page-stat-num">${_catAll.length}</div><div class="page-stat-label">Total</div></div>
        <div class="page-stat"><div class="page-stat-num">${watching.filter(e=>e.status==='watching').length}</div><div class="page-stat-label">Watching</div></div>
        <div class="page-stat"><div class="page-stat-num">${queue.length}</div><div class="page-stat-label">Watchlist</div></div>
        <div class="page-stat"><div class="page-stat-num">${completed.length}</div><div class="page-stat-label">Watched</div></div>
        <div class="page-stat"><div class="page-stat-num">${ongoing.length}</div><div class="page-stat-label">To Be Continued</div></div>
        ${droppedStat}
        <div class="page-stat"><div class="page-stat-num">${totalEpsWatched ? totalEpsWatched.toLocaleString() : '0'}</div><div class="page-stat-label">Episodes</div></div>
        <div class="page-stat"><div class="page-stat-num">${wtLabel2}</div><div class="page-stat-label">Movie Watch Time</div></div>`;
    } else {
      // TV Shows — 5 stats, no movie watch time
      statsEl.innerHTML = `
        <div class="page-stat"><div class="page-stat-num">${_catAll.length}</div><div class="page-stat-label">Total</div></div>
        <div class="page-stat"><div class="page-stat-num">${watching.filter(e=>e.status==='watching').length}</div><div class="page-stat-label">Watching</div></div>
        <div class="page-stat"><div class="page-stat-num">${queue.length}</div><div class="page-stat-label">Watchlist</div></div>
        <div class="page-stat"><div class="page-stat-num">${completed.length}</div><div class="page-stat-label">Watched</div></div>
        <div class="page-stat"><div class="page-stat-num">${ongoing.length}</div><div class="page-stat-label">To Be Continued</div></div>
        ${droppedStat}
        <div class="page-stat"><div class="page-stat-num">${totalEpsWatched ? totalEpsWatched.toLocaleString() : '0'}</div><div class="page-stat-label">Episodes</div></div>`;
    }
  }

  renderSections(watching, queue, completed);
}

/* Sync re-render from cached data — no network call */
function renderSections(
  watching  = _catAll.filter(e => e.status === 'watching' || e.status === 'up_next' || e.status === 'paused'),
  queue     = _catAll.filter(e => e.status === 'queue'),
  completed = _catAll.filter(e => e.status === 'completed'),
  ongoing   = _catAll.filter(e => e.status === 'ongoing'),
  dropped   = _catAll.filter(e => e.status === 'dropped'),
) {
  // Sorted AND filtered via the shared module — previously any re-render
  // (after an edit, a progress tick, etc.) silently dropped active filters.
  const sw = SF.list('cat', 'watching');
  const sq = SF.list('cat', 'queue');
  const sc = SF.list('cat', 'completed');
  const so = SF.list('cat', 'ongoing');
  const sd = SF.list('cat', 'dropped');
  let html = '';

  // Searching: each section shows only its matches (count = matches) and sections without any step aside
  const q = SF.query('cat');
  if (q) { watching = sw; queue = sq; completed = sc; ongoing = so; dropped = sd; }
  html += buildSection('watching', icon('play',15) + ' Currently Watching', watching.length, buildWatchingContent(sw));
  html += buildSection('queue',    icon('bookmark',15) + ' Watchlist', queue.length,     buildQueue(sq));

  // Only show ongoing section for non-movie categories
  const isMovieCat = IS_MOVIE_CAT();
  // "To Be Continued" doesn't apply to movies — hide it on movies.html
  // itself, and also when Anime/Cartoons' Movie/TV Show filter is
  // narrowed down to just Movie (a filtered-to-movies view shouldn't
  // show a section that can only ever be empty).
  if (!isMovieCat && _catTypeFilter !== 'movie') {
    html += buildSection('ongoing', icon('refresh-cw',15) + ' To Be Continued', ongoing.length, buildCompleted(so, 'ongoing'));
  }

  html += buildSection('completed',icon('check',15)   + ' Watched',    completed.length, buildCompleted(sc));
  // Dropped (071) — only once you've dropped something here
  if (dropped.length) html += buildSection('dropped', icon('drop',15) + ' Dropped', dropped.length, buildDropped(sd));
  if (q && !html) html = mssEmpty({ art: 'search', title: `No luck with “${q}”`, text: 'Nothing in this category matches. Try another title, a year, or check the spelling.',
    actions: [{ label: 'Clear search', icon: 'x', onclick: "SF._search('cat', '', true)" }] });
  // Nothing in this category at all (not just filtered away): one welcome instead of four empty sections
  if (!q && !_catAllRaw.length) html = _catWelcome();

  // Remember this page's shape (its stats, how many cards per section) for the next loading skeleton
  if (!q && _catTypeFilter === 'all') mssSkeleton.shape('cat_' + window.PAGE_CAT, {
    stats: [...document.querySelectorAll('#pageStats .page-stat-label')].map(x => x.textContent),
    n: { watching: watching.length, queue: queue.length, ongoing: ongoing.length, completed: completed.length, dropped: dropped.length } });

  const wrap = document.getElementById('sectionsWrap');
  mssKeepScroll(wrap, () => {              // a redraw keeps your place (rows scrolled sideways too)
    wrap.innerHTML = html;
    if (typeof fitTitleYear === 'function') fitTitleYear(wrap);
  });
  mssScrollReturn(wrap);                   // back from a title's Edit page → where you were
}

/* ── ?focus=<entry id> (title page → "In your library"): open its section, bring the
   card to the middle of the screen and spotlight it for a moment ── */
function _catFocus() {
  const url = new URL(location.href), id = url.searchParams.get('focus');
  if (!id) return;
  url.searchParams.delete('focus');
  history.replaceState(history.state, '', url.pathname.split('/').pop() + url.search + url.hash);   // a refresh doesn't do it again
  const e = _catAll.find(x => x.id === id);
  if (!e) return;
  const key = { watching: 'watching', up_next: 'watching', paused: 'watching', queue: 'queue', completed: 'completed', ongoing: 'ongoing', dropped: 'dropped' }[e.status];
  if (collapsed[key]) toggleSection(key);
  const hit = [...document.querySelectorAll(`#sec-${key} [onclick*="'${CSS.escape(id)}'"]`)][0];
  const card = hit && (hit.closest('.w-card, .wg-card, .comp-row') || hit);
  if (!card) { showToast('It’s in your library, but your filters are hiding it.'); return; }
  setTimeout(() => {
    // sideways into view in its row, then the middle of the space under the sticky header
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    card.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    const top = Math.max(document.querySelector('.cat-page-header')?.getBoundingClientRect().bottom || 0, document.getElementById('mainNav')?.getBoundingClientRect().bottom || 0);
    const bar = document.querySelector('.bnav-bg'), bottom = bar?.getClientRects().length ? bar.getBoundingClientRect().top : innerHeight;   // the phone bottom bar
    const r = card.getBoundingClientRect();
    window.scrollTo({ top: scrollY + r.top - top - Math.max(16, (bottom - top - r.height) / 2), behavior });
    card.classList.remove('mss-spotlight'); void card.offsetWidth; card.classList.add('mss-spotlight');
    setTimeout(() => card.classList.remove('mss-spotlight'), 3600);
  }, 250);
}

/* ════════ SECTION ACCORDION ════════ */
function buildSection(key, title, count, content) {
  const searching   = !!SF.query('cat');
  if (searching && !count) return '';             // no matches in this section
  const isOpen      = searching || !collapsed[key];
  const currentView = getView(key);

  const viewToggle = `<div class="view-toggle">
    <button class="vt-btn ${currentView==='list'?'active':''}" data-view="list" onclick="switchView('${key}','list')" title="List view">${icon('list',13)}</button>
    <button class="vt-btn ${currentView==='grid'?'active':''}" data-view="grid" onclick="switchView('${key}','grid')" title="Grid view">${icon('grid',13)}</button>
  </div>`;

  const qpBtn = key === 'queue'
    ? MSSPick.buttonHTML('showQueuePicker()', count === 0)
    : '';

  return `<div class="section-block" id="sec-${key}">
    <div class="section-block-header">
      <div class="sec-left" onclick="toggleSection('${key}')">
        <div class="section-block-title">${title}</div>
        <span class="section-pill">${count}</span>
      </div>
      <div class="sec-right">
        ${qpBtn}
        ${viewToggle}
        <button class="chevron-btn" onclick="toggleSection('${key}')">
          <span class="accordion-chevron" id="chev-${key}">${isOpen ? icon('chevup',15) : icon('chevdown',15)}</span>
        </button>
      </div>
    </div>
    <div class="accordion-body ${isOpen ? 'open' : ''}" id="body-${key}">
      <div class="accordion-inner">${sortBar(key)}${content}</div>
    </div>
  </div>`;
}

function toggleSection(key) {
  collapsed[key] = !collapsed[key];
  document.getElementById('body-' + key)?.classList.toggle('open', !collapsed[key]);
  const ch = document.getElementById('chev-' + key);
  if (ch) ch.innerHTML = collapsed[key] ? icon('chevdown',16) : icon('chevup',16);
}

function switchView(section, view) {
  setViewPref(section, view);
  document.querySelectorAll(`#sec-${section} .vt-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  const inner = document.querySelector(`#body-${section} .accordion-inner`);
  if (!inner) return;
  inner.innerHTML = sortBar(section) + _catSectionContent(section, SF.list('cat', section));
  if (typeof fitTitleYear === 'function') fitTitleYear(inner);
}

/* ════════ CURRENTLY WATCHING ════════ */

/* ── Empty states (mssEmpty in config.js) — one per section; when a section only looks empty
   because of its filters, it says so and offers to clear them ── */
function mssStarterSkip() { return _catAllRaw; }                 // starter titles skip what you already have
document.addEventListener('mss:library-changed', () => renderPage());
function _catClearFilters(section) { SF.clearFilters('cat', section); renderSections(); }
function _catEmpty(section, o) {
  const raw = section === 'watching' ? _catAll.filter(e => e.status === 'watching' || e.status === 'up_next' || e.status === 'paused')
    : _catAll.filter(e => e.status === section);
  if (raw.length) return mssEmpty({ compact: true, art: 'filter', title: 'Nothing matches these filters',
    text: 'Your filters are a little too picky here. Loosen one and try again.',
    actions: [{ label: 'Clear filters', icon: 'x', onclick: `_catClearFilters('${section}')`, primary: true }] });
  return mssEmpty({ compact: true, ...o });
}
function emptyWatching() {
  const queued = _catAll.some(e => e.status === 'queue');
  return _catEmpty('watching', { art: 'watching', title: 'Nothing on screen right now',
    text: queued ? 'The couch is warm and the remote is ready. Start something from your watchlist.' : 'The couch is warm and the remote is ready.',
    actions: [{ label: 'Add a title', icon: 'plus', onclick: `openAddModal('${window.PAGE_CAT}')`, primary: !queued }] });
}
// A category with nothing in it at all: one welcome instead of four empty sections
function _catWelcome() {
  const m = CAT_META[window.PAGE_CAT] || {}, lower = t => /^TV /.test(t) ? 'TV ' + t.slice(3).toLowerCase() : t.toLowerCase();
  return mssEmpty({ art: 'watchlist', title: `No ${lower(m.label || 'titles')} yet`,
    text: `Every great folio starts with one title. No pressure — but it does look a little lonely in here.`,
    actions: [{ label: `Add ${/^[aeiou]/i.test(m.singular || '') ? 'an' : 'a'} ${lower(m.singular || 'title')}`, icon: 'plus', onclick: `openAddModal('${window.PAGE_CAT}')`, primary: true },
      { label: 'Browse Discover', icon: 'compass', href: 'discover.html' }],
    starter: window.PAGE_CAT });
}

/* Unified entry point — respects category and per-item type */
function buildWatchingContent(items) {
  const isMovies = IS_MOVIE_CAT();

  if (isMovies) {
    const activeItems = items.filter(e => e.status === 'watching');
    const pausedItems = items.filter(e => e.status === 'up_next' || e.status === 'paused');
    if (!activeItems.length && !pausedItems.length) return emptyWatching();
    return buildMoviesWatching(activeItems, pausedItems);
  }

  const showItems  = items.filter(e => (e.ratings?._media_type || 'show') !== 'movie');
  const movieItems = items.filter(e => (e.ratings?._media_type || 'show') === 'movie');

  if (!showItems.length && !movieItems.length) return emptyWatching();

  if (showItems.length && movieItems.length) {
    return `
      <div style="margin-bottom:2rem">
        <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;padding:0 20px;margin-bottom:12px">Shows</div>
        ${buildWatching(showItems)}
      </div>
      <div>
        <div style="font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:1px;padding:0 20px;margin-bottom:12px">Movies</div>
        ${buildMoviesWatching(movieItems.filter(e => e.status === 'watching'), movieItems.filter(e => e.status === 'up_next' || e.status === 'paused'))}
      </div>`;
  }

  if (movieItems.length) {
    return buildMoviesWatching(movieItems.filter(e => e.status === 'watching'), movieItems.filter(e => e.status === 'up_next' || e.status === 'paused'));
  }

  return buildWatching(showItems);
}

function buildWatching(items) {
  if (!items.length) return emptyWatching();
  return getView('watching') === 'grid' ? renderWatchingGrid(items) : renderWatchingList(items);
}

/* Up Next / Taking a Break: the poster gets the shared cover (mssHoldHTML
   in config.js) and the card's button becomes Start / Resume. */
function _catHold(e) {
  if (e.status === 'up_next') return { btn: 'Start', title: 'Start watching', fn: 'startWatching' };
  if (e.status === 'paused')  return { btn: 'Resume', title: 'Resume', fn: 'resumeEntry' };
  return null;
}

/* Movies-style watching: Done button in both grid and list */
function renderMoviesWatchingList(items) {
  return `<div class="watch-list">${items.map(e => {
    const hold = _catHold(e);
    const isPaused = !!hold;
    const cardStyle = isPaused ? 'background:var(--olive-faint);border-color:var(--border-olive);opacity:0.85' : '';
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    const rtStr = (rtH||rtM) ? (rtH ? `${rtH}h ${rtM}m` : `${rtM}m`) : '';
    return `<div class="w-card" style="${cardStyle}" onclick="openCatInfoPopup('${e.id}')">
      <div class="w-poster" style="position:relative">
        ${posterHTML(e)}
        ${isPaused ? mssHoldHTML(e) : ''}
      </div>
      <div class="w-body">
        <div class="w-top"><div class="w-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;" translate="no">${escHTML(e.title)}${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : ''}</div></div>
        <div class="w-genre">${_badge}${rtStr ? `<span class="w-ep-badge">${rtStr}</span>` : ''}</div>
      </div>
      <div class="w-ep-controls" onclick="event.stopPropagation()">
        ${isPaused
          ? `<button class="w-list-action-btn" onclick="${hold.fn}('${e.id}')" title="${hold.title}">${icon('play',14)}</button>`
          : `<button class="w-list-action-btn w-list-done-btn" onclick="markMovieComplete(event, '${e.id}')" title="Mark as Done">${icon('check',15)}</button>`}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function buildMoviesWatching(activeItems, pausedItems = []) {
  const allItems = [...activeItems, ...pausedItems];
  if (!allItems.length) return emptyWatching();

  if (getView('watching') === 'list') {
    return renderMoviesWatchingList(allItems);
  }

  const gid = 'wg-movies-watching';
  const cards = allItems.map(e => {
    const hold = _catHold(e);
    const isPaused = !!hold;
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    const rt  = (rtH||rtM) ? (rtH?`${rtH}h ${rtM}m`:`${rtM}m`) : '';
    const typeClsPcg = 'type-label type-label-overlay-bottom';
    return `<div class="wg-card" onclick="openCatInfoPopup('${e.id}')">
      <div class="wg-poster" style="position:relative;">
        ${posterHTML(e, 'big')}
        ${isPaused ? mssHoldHTML(e) : ''}
        ${SHOW_TYPE_TAG() ? `<span class="${typeClsPcg}">Movie</span>` : ''}
        ${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? '<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>' : ''}
      </div>
      <div class="wg-info" style="padding:8px 12px;gap:6px;">
        <div class="title-year-row">
          <div class="wg-title" style="margin-bottom:0;" translate="no">${escHTML(e.title)}</div>
          ${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}
        </div>
        ${rt ? `<div class="wg-genre" style="font-size:11px;"><span class="w-ep-badge">${rt}</span></div>` : ''}
        <div class="wg-controls" onclick="event.stopPropagation()" style="margin-top:auto;">
          ${isPaused
            ? `<button class="ep-btn ep-btn-resume" onclick="${hold.fn}('${e.id}')">${hold.btn}</button>`
            : `<button class="continue-btn" onclick="markMovieComplete(event, '${e.id}')">Done</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
  return _navWrap(gid, `<div class="watching-grid" id="${gid}">${cards}</div>`);
}

function renderWatchingList(items) {
  return `<div class="watch-list">${items.map(e => {
    const hold = _catHold(e);
    const isPaused = !!hold;
    const pct      = e.total_eps ? Math.round(((e.watched??0) / e.total_eps) * 100) : 0;
    const isDone   = !isPaused && (pct >= 100 || (!e.total_eps && (e.episode??0) > 0));
    const upNext   = e.status === 'up_next';   // not started yet — no episode / progress shown
    const epStr    = upNext ? '' : e.season != null ? `S${e.season} · E${e.episode ?? 0}` : (e.watched ? `Ep ${e.watched}` : 'Ep 1');
    const cardStyle = isPaused ? 'background:var(--olive-faint);border-color:var(--border-olive);opacity:0.85' : '';
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    return `<div class="w-card" style="${cardStyle}" onclick="openCatInfoPopup('${e.id}')">
      <div class="w-poster" style="position:relative">
        ${posterHTML(e)}
        ${isPaused ? mssHoldHTML(e) : ''}
      </div>
      <div class="w-body">
        <div class="w-top"><div class="w-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;" translate="no">${escHTML(e.title)}${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : ''}</div></div>
        <div class="w-ep-row">
          ${_badge}
          ${upNext ? `<span class="up-next-tag">Up Next</span>` : `<span class="w-ep-badge">${epStr}</span>`}
        </div>
        ${upNext ? '' : `<div class="w-prog-track"><div class="w-prog-fill" style="width:${pct}%${isPaused?';background:var(--text-3)':''}"></div></div>
        <div class="w-prog-label">${e.total_eps ? `${e.watched??0} / ${e.total_eps} eps · ${pct}%` : (e.episode ? `Ep ${e.episode}` : '')}</div>`}
      </div>
      <div class="w-ep-controls${isDone?' w-ep-controls--done':''}" onclick="event.stopPropagation()">
        ${isPaused
          ? `<button class="w-list-action-btn" onclick="${hold.fn}('${e.id}')" title="${hold.title}">${icon('play',14)}</button>`
          : isDone
            ? `<button class="ep-btn ep-btn-minus" onclick="adjustEp('${e.id}', -1)" title="−1">−</button>
               <button class="w-list-action-btn w-list-done-btn" onclick="doneWatching('${e.id}')" title="Mark as Done">${icon('check',15)}</button>`
            : `<button class="ep-btn" onclick="adjustEp('${e.id}', +1)" title="+1">+</button>
               <button class="ep-btn" onclick="adjustEp('${e.id}', -1)" title="−1">−</button>
               <button class="ep-btn w-pause-btn" onclick="pauseEntry('${e.id}')" title="Taking a Break" style="font-size:14px;display:flex;align-items:center;justify-content:center;">${icon('pause',14)}</button>`}
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ════════ GRID NAV HELPERS (item 6) ════════ */
const _NAV_LEFT  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const _NAV_RIGHT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

function _navWrap(gridId, gridHTML, extra) {
  return `<div class="grid-nav-wrap">
    <button class="grid-nav-btn arr-left"  onclick="event.stopPropagation();_navScroll('${gridId}',-1)" aria-label="Scroll left">${_NAV_LEFT}</button>
    <button class="grid-nav-btn arr-right" onclick="event.stopPropagation();_navScroll('${gridId}',1)"  aria-label="Scroll right">${_NAV_RIGHT}</button>
    ${gridHTML}
  </div>${extra||''}`;
}

function _navScroll(id, dir) {
  // Try the grid element first, fallback to its scrollable parent
  const el = document.getElementById(id);
  if (!el) return;
  // Find the actual scrollable container (could be grid itself or accordion body)
  let target = el;
  if (el.scrollWidth <= el.clientWidth) {
    // Grid itself isn't overflowing — scroll the parent accordion body
    target = el.closest('.accordion-body') || el.closest('.grid-nav-wrap')?.parentElement || el;
  }
  const amount = target.clientWidth * 0.75 || 220;
  target.scrollBy({ left: dir * amount, behavior: 'smooth' });
}

function renderWatchingGrid(items) {
  const gid = 'wg-watching';
  const cards = items.map(e => {
    const hold = _catHold(e);
    const isPaused = !!hold;
    const pct      = e.total_eps ? Math.round(((e.watched??0) / e.total_eps) * 100) : 0;
    const isDone   = !isPaused && (pct >= 100 || (!e.total_eps && (e.episode??0) > 0));
    const upNext   = e.status === 'up_next';
    const epStr    = upNext ? '' : e.season != null ? `S${e.season} · E${e.episode ?? 0}` : (e.watched ? `Ep ${e.watched}` : '');
    const isMovieG = e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
    const typeCls = (isMovieG ? 'type-label' : 'type-label type-label-tv') + ' type-label-overlay-bottom';
    return `<div class="wg-card" onclick="openCatInfoPopup('${e.id}')">
      <div class="wg-poster" style="position:relative;">
        ${posterHTML(e, 'big')}
        ${isPaused ? mssHoldHTML(e) : ''}
        ${SHOW_TYPE_TAG() ? `<span class="${typeCls}">${isMovieG ? 'Movie' : 'TV Show'}</span>` : ''}
        ${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? '<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>' : ''}
      </div>
      <div class="wg-info">
        <div class="title-year-row">
          <div class="wg-title" translate="no">${escHTML(e.title)}</div>
          ${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}
        </div>
        ${epStr ? `<div class="wg-genre"><span class="w-ep-badge">${epStr}</span></div>` : ''}
        ${upNext ? `<div class="wg-genre"><span class="up-next-tag">Up Next</span></div>` : ''}
        ${!upNext && e.total_eps ? `<div class="wg-prog-track" style="margin-bottom:3px;"><div class="wg-prog-fill" style="width:${pct}%${isPaused?';background:var(--text-3)':''}"></div></div>
        <div style="font-size:10px;color:var(--text-3);margin-bottom:4px;">${e.watched??0} / ${e.total_eps} eps · ${pct}%</div>` : ''}
        <div class="wg-controls${isDone?' wg-controls--done':''}" onclick="event.stopPropagation()">
          ${isPaused
            ? `<button class="ep-btn ep-btn-resume" onclick="${hold.fn}('${e.id}')">${hold.btn}</button>`
            : isDone
              ? `<button class="ep-btn ep-btn-minus" onclick="adjustEp('${e.id}', -1)" title="−1 episode">−</button>
                 <button class="continue-btn wg-done-continue" onclick="doneWatching('${e.id}')">Done</button>`
              : `<button class="ep-btn" onclick="adjustEp('${e.id}', -1)" title="−1 episode">−</button>
                 <button class="ep-btn wg-pause-btn" onclick="pauseEntry('${e.id}')" title="Taking a Break">${icon('pause',16)}</button>
                 <button class="ep-btn" onclick="adjustEp('${e.id}', +1)" title="+1 episode">+</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
  return _navWrap(gid, `<div class="watching-grid" id="${gid}">${cards}</div>`);
}

function renderQueueGrid(items) {
  const gid = 'wg-queue';
  const cards = items.map(e => {
    const scope = _queueScope(e);
    const isMq = e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
    const typeClsQ = (isMq ? 'type-label' : 'type-label type-label-tv') + ' type-label-overlay-bottom';
    return `<div class="wg-card" onclick="openCatInfoPopup('${e.id}')">
      <div class="wg-poster" style="position:relative;">
        ${posterHTML(e, 'big')}
        <div class="wg-overlay"></div>
        ${SHOW_TYPE_TAG() ? `<span class="${typeClsQ}">${isMq ? 'Movie' : 'TV Show'}</span>` : ''}
      </div>
      <div class="wg-info" onclick="openCatInfoPopup('${e.id}')" style="cursor:pointer;">
        <div style="margin-bottom:6px;">
          <div class="title-year-row">
            <div class="wg-title" style="margin-bottom:0;" translate="no">${escHTML(e.title)}</div>
            ${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}
          </div>
          ${scope ? `<div class="w-ep-row"><span class="w-ep-badge">${scope}</span></div>` : ''}
        </div>
      </div>
      <div class="start-watching-wrap" onclick="event.stopPropagation()">
        <button type="button" onclick="startWatching('${e.id}')" class="continue-btn">Start</button>
        <button type="button" onclick="markUpNext('${e.id}')" class="up-next-btn" title="Watch this next (Up Next)" aria-label="Up Next">${_catUpNextIcon()}</button>
      </div>
    </div>`;
  }).join('');
  return _navWrap(gid, `<div class="watching-grid" id="${gid}">${cards}</div>`);
}

/* ════════ DROPPED (071) ════════
   Where you stopped (frozen progress), the score greyed with "doesn't count",
   Pick Back Up lives in the title's popup (tap the card). */
function _droppedProgress(e, cls) {
  if (mssIsMovieEntry(e) || !e.total_eps) return '';
  const pct = Math.min(100, Math.round(((e.watched ?? 0) / e.total_eps) * 100));
  return `<div class="${cls}-track dropped-track"><div class="${cls}-fill" style="width:${pct}%"></div></div>
    <div class="dropped-prog-label">${e.watched ?? 0} / ${e.total_eps} eps · ${pct}%</div>`;
}
function _droppedScore(e) {
  const sc = liveScore(e);
  return sc != null ? `<div class="dropped-score"><span>★ ${Number(sc).toFixed(2)}</span><small>doesn’t count</small></div>` : '';
}
function buildDropped(items) {
  if (!items.length) return _catEmpty('dropped', { art: 'dropped', title: 'Nothing dropped', text: 'You finish what you start. Respect.' });
  if (getView('dropped') !== 'grid') {
    return `<div class="watch-list">${items.map(e => {
      const _ctx = catContext();
      return `<div class="w-card is-dropped" onclick="openCatInfoPopup('${e.id}')">
        <div class="w-poster" style="position:relative">${posterHTML(e)}</div>
        <div class="w-body">
          <div class="w-top"><div class="w-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;" translate="no">${escHTML(e.title)}${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}</div></div>
          <div class="w-ep-row">${_ctx ? getTypeBadge(e, _ctx) : ''}${mssDroppedTagHTML(e)}</div>
          ${_droppedProgress(e, 'w-prog')}
          ${_droppedScore(e)}
        </div>
      </div>`;
    }).join('')}</div>`;
  }
  const gid = 'wg-dropped';
  const cards = items.map(e => {
    const isM = mssIsMovieEntry(e);
    return `<div class="wg-card is-dropped" onclick="openCatInfoPopup('${e.id}')">
      <div class="wg-poster" style="position:relative;">
        ${posterHTML(e, 'big')}
        ${SHOW_TYPE_TAG() ? `<span class="${isM ? 'type-label' : 'type-label type-label-tv'} type-label-overlay-bottom">${isM ? 'Movie' : 'TV Show'}</span>` : ''}
      </div>
      <div class="wg-info">
        <div class="title-year-row">
          <div class="wg-title" translate="no">${escHTML(e.title)}</div>
          ${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}
        </div>
        <div class="wg-genre">${mssDroppedTagHTML(e)}</div>
        ${_droppedProgress(e, 'wg-prog')}
        ${_droppedScore(e)}
      </div>
    </div>`;
  }).join('');
  return _navWrap(gid, `<div class="watching-grid" id="${gid}">${cards}</div>`);
}

/* ════════ COMPLETED GRID (items 6/8/9/10) ════════ */
function _cgBadge(rank) {
  const cls = rank===1?'cg-rank-1':rank===2?'cg-rank-2':rank===3?'cg-rank-3':'cg-rank-other';
  return `<div class="cg-rank-badge ${cls}">${rank}</div>`;
}

function _cgScoreBadge(score, inline) {
  let cls;
  if (score >= 10) cls = 'cg-score-10';
  else if (score >= 9) cls = 'cg-score-9';
  else if (score >= 8) cls = 'cg-score-8';
  else if (score >= 7) cls = 'cg-score-7';
  else if (score >= 6) cls = 'cg-score-6';
  else if (score >= 3) cls = 'cg-score-3-5';
  else cls = 'cg-score-0-2';
  // .cg-score-badge is position:absolute by default (built as a poster
  // overlay) — inline=true renders it in normal document flow instead,
  // for use in a badge row alongside runtime/episode badges.
  const style = inline ? ' style="position:static;box-shadow:none;"' : '';
  return `<div class="cg-score-badge ${cls}"${style}>★ ${Number(score).toFixed(2)}</div>`;
}

function _cgEnjoymentBadge(e) {
  const val = _enjoymentVal(e);
  if (val == null) return `<div class="cg-score-badge cg-score-none">-</div>`;
  return _cgScoreBadge(val);
}
function _cgRatingBadge(e, key) {
  const val = _ratingVal(e, key);
  if (val == null) return `<div class="cg-score-badge cg-score-none">-</div>`;
  return _cgScoreBadge(val);
}

/* ════════ Ratings popup: the shared MSSRate popup (rating-popup.js) ════════ */


function openGridPopup(id) {
  const e = _catAll.find(en => en.id === id);
  if (!e) return;
  MSSViews.open(e, { own: true, start: 'rate', onChange: _catRenderStatsAndSections, onDelete: _catRemoveEntry, onComments: x => MSSComments.open(x) });
}


/* Grid-mode completed detail toggle (legacy inline panels — no longer used in grid, kept for safety) */
let _cgDetailId = null;
function toggleCompGrid(id) {
  openGridPopup(id);
}


function renderCompletedGrid(items, sectionKey = 'completed') {
  const isRanked    = _sort[sectionKey] === 'highest' || _sort[sectionKey] === 'lowest';
  const curSort     = _sort[sectionKey] || '';
  const ratingKey   = curSort.startsWith('rating:') ? curSort.slice(7) : null;
  const gid = `wg-${sectionKey}`;
  const cards = items.map((e, i) => {
    const score = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
    const date  = e.completed_date ? new Date(e.completed_date + 'T12:00:00').toLocaleDateString(MSSI18n.locale,{day:'numeric',month:'short',year:'numeric'}) : '';
    const isMc  = e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
    const typeClsC = (isMc ? 'type-label' : 'type-label type-label-tv') + ' type-label-overlay-bottom';
    const newEp = e.status === 'ongoing' ? _catNewEps[e.id] : null;
    return `<div class="wg-card cg-card-wrap" style="cursor:pointer;">
      <div class="wg-poster" onclick="openGridPopup('${e.id}')" style="position:relative;">
        ${posterHTML(e,'big')}${mssNewSeasonHoldHTML(e, newEp)}
        ${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? '<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>' : ''}
        ${ratingKey ? _cgRatingBadge(e, ratingKey) : (isRanked ? _cgBadge(SF.rank(e, i)) : '')}
        ${SHOW_TYPE_TAG() ? `<span class="${typeClsC}">${isMc ? 'Movie' : 'TV Show'}</span>` : ''}
      </div>
      <div class="cg-grid-info" onclick="openGridPopup('${e.id}')">
        <div class="title-year-row">
          <div class="wg-title" translate="no">${escHTML(e.title)}</div>
          ${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}
        </div>
        ${e.status === 'ongoing' ? _ongoingMeta(e) : _entryMeta(e)}
        ${newEp ? `<div class="w-ep-row">${mssNewSeasonBadgeHTML(e, newEp)}</div>` : ''}
        <div class="cg-score-row"><span class="cg-score">${score != null ? `★ ${score}` : '—'}</span></div>
      </div>
      <div onclick="event.stopPropagation()" style="padding:0 10px 10px;display:flex;flex-direction:column;gap:4px;">
        ${e.status !== 'ongoing' ? '' : newEp ? `<button class="continue-btn" onclick="markUpNext('${e.id}')">${_catUpNextIcon()} Up Next</button>` : `<button class="continue-btn" onclick="continueWatching('${e.id}')">Continue</button>`}
        ${MSSComments.buttonHTML(`_catComments('${e.id}')`)}
      </div>
    </div>`;
  }).join('');

  return _navWrap(gid, `<div class="watching-grid" id="${gid}">${cards}</div>`);
}

/* Comments on one of your titles — the shared MSSComments popup (comments.js) */
function _catComments(id) {
  const e = _catAll.find(en => en.id === id);
  if (e) MSSComments.open(e);
}

async function adjustEp(id, delta, rechecked) {
  const entry = _catAll.find(e => e.id === id);
  if (!entry) return;

  const breakdown = Array.isArray(entry.ratings?._season_breakdown)
    ? entry.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number)
    : [];
  const hasBreakdown = breakdown.length > 0;

  let newSeason  = entry.season  || 1;
  let newEp      = entry.episode ?? 0;
  let newWatched;
  let justFinished = false;

  if (hasBreakdown) {
    if (delta > 0) {
      const maxInSeason = breakdown[newSeason - 1] || 0;
      if (maxInSeason > 0 && newEp >= maxInSeason) {
        // End of current season
        if (newSeason < breakdown.length) {
          newSeason++;
          newEp = 0;
        } else {
          justFinished = true; // end of series
        }
      } else {
        newEp++;
      }
    } else {
      if (newEp > 0) {
        newEp--;
      } else if (newSeason > 1) {
        newSeason--;
        newEp = breakdown[newSeason - 1] || 0;
      }
    }
    // Recalculate watched from season positions
    let w = 0;
    for (let i = 0; i < newSeason - 1 && i < breakdown.length; i++) w += breakdown[i];
    w += newEp;
    newWatched = w;
    // Update total_eps on the entry object for progress display
    entry.total_eps = breakdown.reduce((a, b) => a + b, 0);
  } else {
    // Fallback: simple increment/decrement
    newWatched = Math.max(0, (entry.watched || 0) + delta);
    newEp      = Math.max(0, (entry.episode ?? 0) + delta);
    if (entry.total_eps && newWatched >= entry.total_eps && delta > 0) justFinished = true;
    newSeason  = entry.season || 1;
  }

  // At the end of what we know has aired: check TMDB once — a new episode may have come out since
  // (counts only include aired episodes, mssAired) — and if so, step into it instead of finishing
  if (justFinished && !rechecked && entry.tmdb_id && entry.tmdb_type === 'tv' && typeof _refreshTmdbSeasonData === 'function') {
    const before = JSON.stringify(entry.ratings?._season_breakdown || []);
    await _refreshTmdbSeasonData(entry, _catUser.id);
    if (JSON.stringify(entry.ratings?._season_breakdown || []) !== before) return adjustEp(id, delta, true);
  }

  if (!justFinished) {
    try {
      await updateProgress(id, _catUser.id, { watched: newWatched, episode: newEp, season: newSeason });
      entry.watched = newWatched;
      entry.episode = newEp;
      entry.season  = newSeason;
      SF.refresh('cat', 'watching'); // keeps the active sort + filters
      showToast('Progress updated');
      // "+" marked an episode watched → episode rating (episode-ratings.js)
      if (delta > 0 && newEp > 0 && typeof MSSEp !== 'undefined') MSSEp.afterWatch(entry, newSeason, newEp);
    } catch(e) { showToast('Error updating progress.', 'err'); }
  } else {
    // For movies: auto-complete. For shows: ask Completed or Ongoing
    const isMovie = entry.cat === 'movies' || entry.ratings?._media_type === 'movie';
    if (isMovie) {
      try {
        const today = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
        await updateProgress(id, _catUser.id, { status: 'completed', watched: newWatched, episode: newEp, season: newSeason, completed_date: today });
        entry.status = 'completed'; entry.watched = newWatched; entry.episode = newEp; entry.season = newSeason; entry.completed_date = today;
        renderSections();
        showToast(`"${entry.title}" marked as watched!`);
      } catch(e) { showToast('Error marking complete.', 'err'); }
    } else {
      // First save progress, then show choice popup
      try {
        await updateProgress(id, _catUser.id, { watched: newWatched, episode: newEp, season: newSeason });
        entry.watched = newWatched; entry.episode = newEp; entry.season = newSeason;
      } catch(e) { /* ignore */ }
      _finishShowId = id;
      _finishEntry  = entry;
      _finishWatched = newWatched; _finishEp = newEp; _finishSeason = newSeason;
      showFinishPopup(entry.title);
    }
  }
}

async function markMovieComplete(event, id) {
  event.stopPropagation();
  event.preventDefault();
  const entry = _catAll.find(e => e.id === id);
  if (!entry) return;

  try {
    const now = new Date();
    const isoDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    await updateProgress(id, _catUser.id, { status: 'completed', completed_date: isoDate });
    entry.status = 'completed';
    entry.completed_date = isoDate;
    renderSections();
    _showRateNowPopup(entry);
  } catch(e) {
    showToast('Error marking complete.', 'err');
  }
}

// Just finished → "Added to Watched" with Rate it (straight to the ratings on its Edit page) · Later.
// Already rated (e.g. a rewatch) → just a toast.
function _showRateNowPopup(entry) {
  if (liveScore(entry) != null) { showToast(`Added to ${entry.status === 'ongoing' ? 'To Be Continued' : 'Watched'}.`); return; }
  mssWatchedPopup(entry, {
    onRate: () => {
      sessionStorage.setItem('detailId', entry.id);
      sessionStorage.setItem('detailFrom', currentFile());
      sessionStorage.setItem('detailScrollTo', 'ratings');
      window.location.href = 'detail.html';
    },
  });
}

/* ════════ PAUSED ════════ */
function buildPaused(items) {
  if (!items.length) return _catEmpty('paused', { art: 'paused', title: 'Nothing on pause', text: 'Not a single title on hold. Commitment level: impressive.' });
  return getView('paused') === 'grid' ? renderWatchingGrid(items) : renderPausedList(items);
}

function renderPausedList(items) {
  return `<div class="watch-list">${items.map(e => {
    const pct   = e.total_eps ? Math.round(((e.watched??0) / e.total_eps) * 100) : 0;
    const epStr = e.season != null ? `S${e.season} · E${e.episode ?? 0}` : (e.watched ? `Ep ${e.watched}` : '');
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    return `<div class="w-card" onclick="openCatInfoPopup('${e.id}')">
      <div class="w-poster">${posterHTML(e)}</div>
      <div class="w-body">
        <div class="w-top"><div class="w-title" translate="no">${escHTML(e.title)}${e.year ? `<span class="title-year-inline" style="margin-left:8px;">${escHTML(e.year)}</span>` : ''}</div></div>
        <div class="w-ep-row">
          ${_badge}
          <span class="w-ep-badge" style="background:rgba(168,168,168,0.12);color:var(--text-2);border-color:var(--border-2)">On Pause</span>
          ${epStr ? `<span class="w-ep-badge" style="margin-left:6px">${epStr}</span>` : ''}
        </div>
        <div class="w-prog-track"><div class="w-prog-fill" style="width:${pct}%;background:var(--text-3)"></div></div>
        <div class="w-prog-label">${e.total_eps ? `${e.watched??0} / ${e.total_eps} eps · ${pct}%` : (e.episode ? `Ep ${e.episode}` : '')}</div>
      </div>
      <div class="w-ep-controls" onclick="event.stopPropagation()">
        <button class="w-list-action-btn" onclick="resumeEntry('${e.id}')" title="Resume">${icon('play',14)}</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

async function resumeEntry(id) {
  try {
    const entry = _catAll.find(e => e.id === id);
    const wasUpNext = entry?.status === 'up_next';
    await updateProgress(id, _catUser.id, { status: 'watching' });
    if (entry) entry.status = 'watching';
    renderSections();
    showToast(wasUpNext ? 'Started watching!' : 'Resumed!');
    if (entry) _refreshTmdbSeasonData(entry, _catUser.id, renderSections);
  } catch(e) { showToast('Error resuming.', 'err'); }
}

async function pauseEntry(id) {
  try {
    await updateProgress(id, _catUser.id, { status: 'paused' });
    const entry = _catAll.find(e => e.id === id);
    if (entry) entry.status = 'paused';
    renderSections();
    showToast('Taking a break!');
  } catch(e) { showToast('Error updating.', 'err'); }
}

/* ════════ QUEUE / WATCHLIST ════════ */
/* Returns the scope string for a queue item (e.g. "S4 E4", "12 eps") — empty for movies */
function _queueScope(e) {
  if (e.cat === 'movies' || e.ratings?._media_type === 'movie') {
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    if (rtH||rtM) return rtH ? `${rtH}h ${rtM}m` : `${rtM}m`;
    return '';
  }
  const bd = Array.isArray(e.ratings?._season_breakdown)
    ? e.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number)
    : [];
  if (bd.length) { const tot=bd.reduce((a,b)=>a+b,0); return `S${bd.length} · E${tot}`; }
  if (e.total_seasons && e.total_eps) return `S${e.total_seasons} · E${e.total_eps}`;
  if (e.total_seasons) return `S${e.total_seasons}`;
  if (e.total_eps) return `${e.total_eps} eps`;
  return '';
}

function buildQueue(items) {
  if (!items.length) return _catEmpty('queue', { art: 'watchlist', title: 'Your watchlist is empty', text: 'Nothing queued up yet. Future you is going to be so bored.',
    actions: [{ label: 'Add a title', icon: 'plus', onclick: `openAddModal('${window.PAGE_CAT}')`, primary: true }], starter: window.PAGE_CAT });
  return getView('queue') === 'list' ? renderQueueList(items) : renderQueueGrid(items);
}

/* renderQueueGrid defined above */

function renderQueueList(items) {
  return `<div class="watch-list">${items.map(e => {
    const scope = _queueScope(e);
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    return `<div class="w-card" style="cursor:default;">
      <div class="w-poster" onclick="openCatInfoPopup('${e.id}')" style="cursor:pointer;">${posterHTML(e)}</div>
      <div class="w-body" onclick="openCatInfoPopup('${e.id}')" style="cursor:pointer;">
        <div class="w-top"><div class="w-title" translate="no">${escHTML(e.title)}${e.year ? `<span class="title-year-inline" style="margin-left:8px;">${escHTML(e.year)}</span>` : ''}</div></div>
        <div class="w-ep-row">${_badge}${scope ? `<span class="w-ep-badge">${scope}</span>` : ''}</div>
      </div>
      <div class="w-queue-actions" onclick="event.stopPropagation()">
        <button type="button" onclick="startWatching('${e.id}')" class="w-list-action-btn w-list-play-btn" title="Start Watching" aria-label="Start Watching">${icon('play',14)}</button>
        <button type="button" onclick="markUpNext('${e.id}')" class="w-list-action-btn up-next-btn" title="Watch this next (Up Next)" aria-label="Up Next">${_catUpNextIcon()}</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ════════ COMPLETED ════════ */
/* _cgBadge and renderCompletedGrid defined above */

function buildCompleted(items, sectionKey = 'completed') {
  if (!items.length) return sectionKey === 'ongoing'
    ? _catEmpty('ongoing', { art: 'episodes', title: 'Nothing waiting on new episodes', text: 'Caught up on a show that’s still airing? It waits here until the next episode drops.' })
    : _catEmpty('completed', { art: 'watched', title: 'No finished titles yet', text: 'Your trophy shelf is waiting. Finish something and it lands here, ready to rate.' });
  // To Be Continued, default order: shows with new episodes out first
  if (sectionKey === 'ongoing' && SF.getSort('cat', 'ongoing') === 'newest') items = [...items.filter(e => _catNewEps[e.id]), ...items.filter(e => !_catNewEps[e.id])];
  return getView(sectionKey) === 'grid' ? renderCompletedGrid(items, sectionKey) : renderCompletedList(items, sectionKey);
}

function renderCompletedList(sorted, sectionKey = 'completed') {
  const isRanked  = _sort[sectionKey] === 'highest' || _sort[sectionKey] === 'lowest';
  const curSort   = _sort[sectionKey] || '';
  const ratingKey = curSort.startsWith('rating:') ? curSort.slice(7) : null;
  return `<div class="completed-list">${sorted.map((e, i) => {
    const date  = e.completed_date ? new Date(e.completed_date + 'T12:00:00').toLocaleDateString(MSSI18n.locale,{day:'numeric',month:'short',year:'numeric'}) : '';
    const score = e.final_score != null ? Number(liveScore(e)).toFixed(2) : null;
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    const newEp = e.status === 'ongoing' ? _catNewEps[e.id] : null;
    return `<div class="cc-block">
      <div class="comp-row" style="cursor:pointer;" onclick="openGridPopup('${e.id}')">
        <div class="comp-poster" style="position:relative;">${posterHTML(e)}${mssNewSeasonHoldHTML(e, newEp)}${ratingKey ? _cgRatingBadge(e, ratingKey) : (isRanked ? _cgBadge(SF.rank(e, i)) : '')}</div>
        <div class="comp-info">
          <div class="comp-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;" translate="no">${escHTML(e.title)}${e.year ? `<span class="title-year-inline">${escHTML(e.year)}</span>` : ''}${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : ''}</div>
          <div class="comp-meta">${_badge}</div>
          ${e.status === 'ongoing' ? _ongoingMeta(e) : _entryMeta(e)}
          ${newEp ? `<div class="w-ep-row">${mssNewSeasonBadgeHTML(e, newEp)}</div>` : ''}
          ${e.notes ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px;font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2; line-clamp:2;-webkit-box-orient:vertical;">"${escHTML(MSSRich.plain(e.notes))}"</div>` : ''}
          ${renderFavChips(e.ratings, e.cat)}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;" onclick="event.stopPropagation()">
          <div style="font-family:var(--bebas);color:var(--olive-light);font-size:clamp(17px, 3.8vw, 19px);font-weight:400;">${score != null ? `★ ${score}` : '—'}</div>
          ${e.status !== 'ongoing' ? '' : newEp ? `<button type="button" class="w-list-action-btn up-next-btn" onclick="markUpNext('${e.id}')" title="Watch this next (Up Next)" aria-label="Up Next">${_catUpNextIcon()}</button>` : `<button class="w-list-action-btn w-list-play-btn" onclick="continueWatching('${e.id}')" title="Continue">${icon('play',14)}</button>`}
        </div>
      </div>
      ${MSSComments.buttonHTML(`event.stopPropagation();_catComments('${e.id}')`)}
    </div>`;
  }).join('')}</div>`;
}

/* ── Continue Watching (from Ongoing) ── */
// Watchlist → Up Next (shows in Currently Watching, after what you're watching)
async function markUpNext(id) {
  try {
    await updateProgress(id, _catUser.id, { status: 'up_next' });
    const entry = _catAll.find(e => e.id === id);
    if (entry) entry.status = 'up_next';
    showToast('Added to Up Next!');
    _catRenderStatsAndSections();
  } catch (e) { showToast('Error updating. Please try again.', 'err'); console.error(e); }
}

async function startWatching(id) {
  try {
    const entry = _catAll.find(e => e.id === id);
    const isMovie = !entry || entry.cat === 'movies' || entry.ratings?._media_type === 'movie';
    const updates = { status: 'watching' };
    if (!isMovie) {
      updates.season  = entry?.season  || 1;
      updates.episode = 0;
      updates.watched = 0;
    }
    await updateProgress(id, _catUser.id, updates);
    if (entry) { entry.status = 'watching'; if (!isMovie) { entry.season = updates.season; entry.episode = 0; entry.watched = 0; } }
    showToast('Moved to Currently Watching!');
    renderSections();
    if (entry) _refreshTmdbSeasonData(entry, _catUser.id, renderSections);
  } catch(e) {
    showToast('Error updating. Please try again.', 'err');
    console.error(e);
  }
}

async function continueWatching(id) {
  try {
    await updateProgress(id, _catUser.id, { status: 'watching' });
    showToast('Moved to Currently Watching!');
    sessionStorage.setItem('detailId', id);
    sessionStorage.setItem('detailFrom', currentFile());
    sessionStorage.setItem('detailScrollTo', 'progress');
    window.location.href = 'detail.html';
  } catch(e) {
    showToast('Error updating. Please try again.', 'err');
    console.error(e);
  }
}
/* ── Finish show popup (Completed vs Ongoing choice) ── */
let _finishShowId = null, _finishEntry = null, _finishWatched = 0, _finishEp = 0, _finishSeason = 0;

function doneWatching(id) {
  const entry = _catAll.find(e => e.id === id);
  if (!entry) return;
  _finishShowId  = id;
  _finishEntry   = entry;
  _finishWatched = entry.watched;
  _finishEp      = entry.episode;
  _finishSeason  = entry.season;
  showFinishPopup(entry.title);
}

function showFinishPopup(title) {
  let overlay = document.getElementById('_finishOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_finishOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.75);-webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--bg-3);border:1.5px solid var(--olive-light);border-radius:var(--radius-lg);padding:2rem 1.75rem;max-width:360px;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--olive-faint);border:1.5px solid var(--border-olive);display:flex;align-items:center;justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--olive-light)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
        </div>
        <div style="font-family:var(--serif);font-size:28px;font-weight:500;color:var(--text);" id="_finishTitle">Finished!</div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.6;max-width:260px;">Is the show fully finished, or are there more seasons coming?</div>
        <div style="display:flex;flex-direction:column;gap:8px;width:100%;margin-top:6px;">
          <button onclick="chooseFinishStatus('completed')" style="width:100%;padding:12px;background:var(--olive);border:1.5px solid var(--olive-light);border-radius:var(--radius-sm);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans);">
            ✓ Watched<div style="font-size:11px;font-weight:400;opacity:.75;margin-top:2px;">The show has ended</div>
          </button>
          <button onclick="chooseFinishStatus('ongoing')" style="width:100%;padding:11px;background:transparent;border:1.5px solid var(--border-2);border-radius:var(--radius-sm);color:var(--text-2);font-size:13px;font-weight:500;cursor:pointer;font-family:var(--sans);">
            ↻ To Be Continued<div style="font-size:11px;font-weight:400;opacity:.75;margin-top:2px;">More seasons coming</div>
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('_finishTitle').textContent = `Finished "${title}"`;
  overlay.style.display = 'flex';
}

async function chooseFinishStatus(status) {
  const overlay = document.getElementById('_finishOverlay');
  if (overlay) overlay.style.display = 'none';
  if (!_finishShowId || !_finishEntry) return;
  const id    = _finishShowId;
  const entry = _finishEntry;
  try {
    const today = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
    await updateProgress(id, _catUser.id, {
      status, watched: _finishWatched, episode: _finishEp, season: _finishSeason, completed_date: today
    });
    entry.status = status; entry.watched = _finishWatched;
    entry.episode = _finishEp; entry.season = _finishSeason;
    entry.completed_date = today;
    renderSections();
  } catch(e) { showToast('Error updating.', 'err'); return; }
  _finishShowId = null; _finishEntry = null;
  _showRateNowPopup(entry);
}

function renderFavChips(ratings, cat) {
  if (!ratings || (!ratings._favorites && !ratings._lowlights)) return '';
  const favs = ratings._favorites;
  const low = ratings._lowlights || ratings._favorites?._lowlights;
  const isMovies = cat === 'movies';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const chips = [
    favs?.character ? `<span class="fav-chip"><span class="fav-chip-label">Fav Character</span><span class="fav-chip-val" translate="no">${esc(favs.character)}</span></span>` : '',
    (!isMovies && favs?.episode) ? `<span class="fav-chip"><span class="fav-chip-label">Fav Episode</span><span class="fav-chip-val">${esc(favs.episode)}</span></span>` : '',
    (!isMovies && favs?.season)  ? `<span class="fav-chip"><span class="fav-chip-label">Fav Season</span><span class="fav-chip-val">${esc(favs.season)}</span></span>` : '',
    low?.character ? `<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Character</span><span class="fav-chip-val" translate="no">${esc(low.character)}</span></span>` : '',
    (!isMovies && low?.episode) ? `<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Episode</span><span class="fav-chip-val">${esc(low.episode)}</span></span>` : '',
    (!isMovies && low?.season)  ? `<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Season</span><span class="fav-chip-val">${esc(low.season)}</span></span>` : '',
  ].filter(Boolean).join('');

  return chips ? `<div class="fav-chips" style="margin-top:8px;">${chips}</div>` : '';
}

/* ════════ Loading ════════ */
function showLoading() {
  const sw = document.getElementById('sectionsWrap');
  if (sw) sw.innerHTML = `<div class="page-loading" data-skel="sections"></div>`;
}
function hideLoading() {}

/* ════════ QUEUE PICKER ════════ */
/* "Pick for me" on the Watchlist (MSSPick, js/pick.js): one title from this category's watchlist */
function showQueuePicker() {
  MSSPick.open({ pool: () => _catAll.filter(e => e.status === 'queue'), all: () => _catAllRaw, user: _catUser,
    onStarted: () => renderPage() });
}

/* rewatchEntry, getRewatchCount, isRewatching, rewatchBadgeHTML, rewatchIconHTML
   defined in rewatch.js (loaded before category.js) */

/* createShareCard defined in create-card.js */

/* ── Loading skeleton: this page's own stats, sections and cards (in the views you chose),
   with sample titles masked into placeholders — as many as you had here last time ── */
const _catSkelShape = () => mssSkeleton.shape('cat_' + window.PAGE_CAT) || {
  stats: IS_MOVIE_CAT() ? ['Total', 'Watching', 'Watchlist', 'Watched'] : ['Total', 'Watching', 'Watchlist', 'Watched', 'To Be Continued', 'Episodes'],
  n: { watching: 3, queue: 6, ongoing: 2, completed: 5, dropped: 0 } };
mssSkeleton.define('sections', () => {
  const sh = _catSkelShape(), movie = IS_MOVIE_CAT();
  const fake = status => ({ id: '', title: 'Sample title', year: '2024', cat: window.PAGE_CAT, status, season: 1, episode: 4, total_eps: 10, watched: 4,
    total_seasons: 2, runtime_h: 2, runtime_m: 5, ratings: status === 'completed' || status === 'ongoing' ? { story: 8 } : {} });
  const items = (k, status) => Array.from({ length: Math.min(sh.n[k] || 0, k === 'queue' ? 8 : 5) }, () => fake(status));
  const html = buildSection('watching', icon('play', 15) + ' Currently Watching', 0, buildWatchingContent(items('watching', 'watching')))
    + buildSection('queue', icon('bookmark', 15) + ' Watchlist', 0, buildQueue(items('queue', 'queue')))
    + (movie ? '' : buildSection('ongoing', icon('refresh-cw', 15) + ' To Be Continued', 0, buildCompleted(items('ongoing', 'ongoing'), 'ongoing')))
    + buildSection('completed', icon('check', 15) + ' Watched', 0, buildCompleted(items('completed', 'completed')))
    + (sh.n.dropped ? buildSection('dropped', icon('drop', 15) + ' Dropped', 0, '') : '');
  return html.replace(/class="(section-block-title|sec-right|sort-bar[^"]*|sf-trigger-row[^"]*)"/g, 'class="$1" data-skel-keep').replace(/ id="[^"]*"/g, '');
});
// Header pieces that wait for the data: the count line and the stat boxes (same labels as last time)
(() => {
  const sub = document.getElementById('catSubtitle'), stats = document.getElementById('pageStats');
  if (sub && !sub.textContent.trim()) sub.innerHTML = '<span class="skel-txt">00 titles · 0 watching · 00 watched</span>';
  mssSkeleton.stats(stats, _catSkelShape().stats);
  _catTypeFilterBar();   // Anime / Cartoons: the Type filter doesn't wait for the data
})();
