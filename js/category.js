/* ══════════════════════════════════════════
   category.js — Async, Supabase-backed
   Supports list/grid view per section
══════════════════════════════════════════ */

let _catUser   = null;
let _catAll    = [];
const collapsed   = { watching: false, queue: false, completed: false };
const _sort = { watching: 'newest', queue: 'newest', completed: 'newest', ongoing: 'newest' };

/* ══════════════════════════════════════════
   Watching / Watchlist info popup
   Same popup used on library.html for these sections, with two
   added actions: Edit (→ the personal entry editor) and
   Discover (→ the TMDB title page, when the entry has a tmdb_id).
══════════════════════════════════════════ */
let _catInfoId = null;

function _catYearSpanHTML(e, escFn, cls) {
  const isMovie = e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const start = e.year || null;
  const end = e.ratings?._completion_year || null;
  const title = escFn(e.title);
  if (!start) return title;
  const yr = (isMovie || String(end) === String(start)) ? start : (start + '\u2013' + (end || 'Present'));
  return `${title} <span class="${cls || ''}" style="font-size:0.6em;vertical-align:middle;">${yr}</span>`;
}

function _injectCatInfoPopup() {
  if (document.getElementById('profInfoOverlay')) return;
  const el = document.createElement('div');
  el.id = 'profInfoOverlay';
  el.innerHTML = `<div id="profInfoCard">
      <div class="pvi-header">
        <div class="pvi-poster" id="profInfoPoster"></div>
        <div class="pvi-meta-wrap"><div class="pvi-title" id="profInfoTitle"></div><div class="pvi-tags" id="profInfoTags"></div></div>
        <button class="pvi-close" onclick="closeCatInfoPopup()">✕</button>
      </div>
      <div class="pvi-body">
        <div class="pvi-desc" id="profInfoDesc"></div>
        <div id="profInfoDetails"></div>
      </div>
      <div class="pvi-actions">
        <button class="pvi-action-btn" id="catInfoEditBtn">${icon('list',14)} Edit</button>
        <button class="pvi-action-btn pvi-action-primary" id="catInfoDiscoverBtn">${icon('search',14)} Discover</button>
        <button class="pvi-action-btn" id="catInfoCardBtn" onclick="createShareCard(_catInfoId, 3, true)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> Discover Card</button>
        <button class="pvi-action-btn pvi-action-danger" id="catInfoDeleteBtn">${icon('trash',14)} Delete</button>
      </div>
    </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) closeCatInfoPopup(); });
  document.body.appendChild(el);
}

/* ── Auto-refresh season/episode counts from TMDB ──
   Season/episode totals are only fetched once, at add-time. If a show
   airs a new season after that, the stored counts go stale and the
   person has to notice and manually re-enter them. This quietly checks
   TMDB for a linked show whenever its detail popup opens or the person
   starts/resumes watching it, and updates the entry in the background
   if TMDB now shows more seasons/episodes than what's stored. */
/* ── _refreshTmdbSeasonData now lives in nav.js, shared across every
   page with its own entry-info popup (this one, library, profile,
   completed) instead of duplicated per page. ── */

function openCatInfoPopup(id) {
  try {
  _injectCatInfoPopup();
  const e = _catAll.find(en => en.id === id);
  if (!e) return;
  _catInfoId = id;
  const esc2 = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const pEl = document.getElementById('profInfoPoster');
  pEl.innerHTML = e.poster_url ? `<img src="${e.poster_url}" loading="lazy">` : esc2((e.title||'?')[0].toUpperCase());

  document.getElementById('profInfoTitle').innerHTML = _catYearSpanHTML(e, esc2, 'pvi-title-year');

  // Category label (Movie/TV Show/Anime/Cartoons) uses the real
  // Movie/TV type-badge colors (matching every poster overlay on the
  // site) instead of being lumped in with genres as a plain olive tag.
  const catLabel = CAT_META[e.cat] ? CAT_META[e.cat].label : '';
  const catIsMovie = e.cat === 'movies' || e.ratings?._media_type === 'movie';
  document.getElementById('profInfoTags').innerHTML =
    (catLabel ? `<span class="${catIsMovie ? 'type-label' : 'type-label type-label-tv'}">${esc2(catLabel)}</span>` : '') +
    (e.genres || []).map(g => `<span class="w-ep-badge">${esc2(String(g))}</span>`).join('');

  const dEl = document.getElementById('profInfoDesc');
  if (e.description) { dEl.textContent = e.description; dEl.style.color = ''; }
  else { dEl.textContent = '—'; dEl.style.color = 'var(--text-3)'; }

  const detEl = document.getElementById('profInfoDetails');
  const isMovie = e.cat === 'movies' || e.ratings?._media_type === 'movie';

  if (!isMovie) {
    const bd = Array.isArray(e.ratings?._season_breakdown)
      ? e.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number) : [];
    const totalS = bd.length || Number(e.total_seasons) || 0;
    let seasonsHTML = '';
    if (totalS > 0) {
      let chips = '';
      for (let i = 0; i < totalS; i++) {
        const eps = bd[i] || null;
        chips += `<div class="pvi-season-chip"><div class="pvi-season-num">S${i+1}</div><div class="pvi-season-eps">${eps ? eps+' eps' : 'S'+(i+1)}</div></div>`;
      }
      seasonsHTML = `<div class="pvi-section-label">TV Show Breakdown</div><div class="pvi-seasons">${chips}</div>`;
    } else if (e.total_eps) {
      seasonsHTML = `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${e.total_eps}</div><div class="pvi-runtime-lbl">Total Episodes</div></div></div>`;
      detEl.innerHTML = seasonsHTML;
      return _finishCatInfoPopup(e);
    }
    detEl.innerHTML = seasonsHTML;
  } else {
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    const rtStr = rtH ? `${rtH}h ${rtM}m` : (rtM ? `${rtM}m` : null);
    detEl.innerHTML = rtStr
      ? `<div class="pvi-meta-row"><div class="pvi-runtime"><div class="pvi-runtime-val">${rtStr}</div><div class="pvi-runtime-lbl">Movie Runtime</div></div></div>`
      : '';
  }
  _finishCatInfoPopup(e);
  } catch(err) { console.error('openCatInfoPopup error:', err); }
}

function _finishCatInfoPopup(e) {
  const editBtn = document.getElementById('catInfoEditBtn');
  if (editBtn) editBtn.onclick = () => goToDetail(e.id, currentFile());

  const discBtn = document.getElementById('catInfoDiscoverBtn');
  if (discBtn) {
    discBtn.style.display = '';
    discBtn.disabled = false;
    discBtn.innerHTML = `${icon('search',14)} Discover`;
    discBtn.onclick = () => _catGoDiscover(e, discBtn);
  }

  const delBtn = document.getElementById('catInfoDeleteBtn');
  if (delBtn) delBtn.onclick = () => _catInfoDeleteEntry(e);

  const ov = document.getElementById('profInfoOverlay');
  ov.classList.add('open');
  document.getElementById('profInfoCard').style.transform = 'translateY(0)';
  document.body.style.overflow = 'hidden';
  _refreshTmdbSeasonData(e, _catUser.id, renderSections);
}

async function _catInfoDeleteEntry(e) {
  if (!confirm(`Delete "${e.title}" from your library? This can't be undone.`)) return;
  try {
    await deleteEntry(e.id, _catUser.id);
    _catAllRaw = _catAllRaw.filter(x => x.id !== e.id);
    _catAll = _catAll.filter(x => x.id !== e.id);
    closeCatInfoPopup();
    renderSections();
    showToast('Deleted.');
  } catch (err) {
    console.error(err);
    showToast('Error deleting entry.', 'err');
  }
}

async function _cgPopupDeleteEntry() {
  const e = _catAll.find(en => en.id === _cgPopupEntryId);
  if (!e) return;
  if (!confirm(`Delete "${e.title}" from your library? This can't be undone.`)) return;
  try {
    await deleteEntry(e.id, _catUser.id);
    _catAllRaw = _catAllRaw.filter(x => x.id !== e.id);
    _catAll = _catAll.filter(x => x.id !== e.id);
    closeGridPopup();
    renderSections();
    showToast('Deleted.');
  } catch (err) {
    console.error(err);
    showToast('Error deleting entry.', 'err');
  }
}

async function _catGoDiscover(e, btn) {
  if (e.tmdb_id && e.tmdb_type) {
    goToTitle(e.tmdb_type, e.tmdb_id);
    return;
  }
  if (typeof _tmdbSearch !== 'function') {
    showToast('Discover is unavailable right now.', 'err');
    return;
  }
  const origLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Searching…';
  try {
    const isMovie = e.cat === 'movies' || e.ratings?._media_type === 'movie';
    const results = await _tmdbSearch(e.title);
    // Matches for this entry's category (movie vs tv) first, rest after
    const sorted = [...results].sort((a, b) => {
      const wantType = isMovie ? 'movie' : 'tv';
      return (a.media_type === wantType ? 0 : 1) - (b.media_type === wantType ? 0 : 1);
    });
    closeCatInfoPopup();
    _openDiscoverPicker(sorted, e.title);
  } catch (err) {
    showToast('Error searching TMDB.', 'err');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origLabel;
  }
}

function _injectDiscoverPicker() {
  if (document.getElementById('catDiscoverOverlay')) return;
  const el = document.createElement('div');
  el.id = 'catDiscoverOverlay';
  el.innerHTML = `<div id="catDiscoverCard">
    <button class="cat-disc-close" onclick="_closeDiscoverPicker()">✕</button>
    <div class="cat-disc-title">Which one is it?</div>
    <div class="cat-disc-sub" id="catDiscoverSub"></div>
    <div id="catDiscoverList"></div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) _closeDiscoverPicker(); });
  document.body.appendChild(el);
}

function _openDiscoverPicker(results, entryTitle) {
  _injectDiscoverPicker();
  const esc2 = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  document.getElementById('catDiscoverSub').textContent = `Matches for "${entryTitle}" — pick the right one`;

  const listEl = document.getElementById('catDiscoverList');
  if (!results.length) {
    listEl.innerHTML = `<div class="cat-disc-none">No matches found on TMDB.</div>`;
  } else {
    listEl.innerHTML = results.map((r, i) => {
      const isMovie = r.media_type === 'movie';
      const rTitle  = isMovie ? r.title : r.name;
      const year    = ((isMovie ? r.release_date : r.first_air_date) || '').split('-')[0];
      const thumb   = r.poster_path ? TMDB_IMG + r.poster_path : null;
      return `<div class="cat-disc-item" data-i="${i}">
        <div class="cat-disc-thumb">${thumb ? `<img src="${thumb}" loading="lazy">` : ''}</div>
        <div class="cat-disc-info">
          <div class="cat-disc-name">${esc2(rTitle || '—')}</div>
          <div class="cat-disc-meta">${isMovie ? 'Movie' : 'TV Show'}${year ? ' · ' + year : ''}</div>
        </div>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.cat-disc-item').forEach((elm, i) => {
      elm.addEventListener('click', () => {
        const r = results[i];
        _closeDiscoverPicker();
        goToTitle(r.media_type === 'movie' ? 'movie' : 'tv', r.id);
      });
    });
  }

  const ov = document.getElementById('catDiscoverOverlay');
  ov.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _closeDiscoverPicker() {
  const ov = document.getElementById('catDiscoverOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
}

function closeCatInfoPopup() {
  const ov = document.getElementById('profInfoOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.getElementById('profInfoCard').style.transform = 'translateY(18px)';
  document.body.style.overflow = '';
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

// Same content as _entryMeta() but without the wrapping <div class="w-ep-row">
// (which adds its own margin-bottom, meant for stacking it above other
// card content) — used where the badge needs to sit inline alongside
// other badges/tags instead of as its own standalone row.
function _entryMetaBadgeOnly(e) {
  const isMovie = e.cat === 'movies' || (e.ratings?._media_type === 'movie');
  if (isMovie) {
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    if (!rtH && !rtM) return '';
    const label = rtH ? `${rtH}h ${rtM}m` : `${rtM}m`;
    return `<span class="w-ep-badge">${label}</span>`;
  }
  const bd = Array.isArray(e.ratings?._season_breakdown)
    ? e.ratings._season_breakdown.filter(n => parseInt(n) > 0).map(Number) : [];
  const _bdTot = bd.reduce((a,b)=>a+b,0);
  const scope = bd.length ? `S${bd.length} · E${_bdTot}`
    : (e.total_seasons && e.total_eps) ? `S${e.total_seasons} · E${e.total_eps}`
    : e.total_seasons ? `S${e.total_seasons}`
    : e.total_eps ? `${e.total_eps} eps` : '';
  return scope ? `<span class="w-ep-badge">${scope}</span>` : '';
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

function _ratingShortLabel(label) {
  return label.length > 14 ? label.slice(0, 13) + '…' : label;
}

function applySort(arr, sortBy) {
  const a = [...arr];
  const getDate = e => e.completed_date ? new Date(e.completed_date) : new Date(e.created_at);
  if (sortBy === 'newest')  return a.sort((x,y) => getDate(y) - getDate(x));
  if (sortBy === 'oldest')  return a.sort((x,y) => getDate(x) - getDate(y));
  if (sortBy === 'highest') return a.sort((x,y) => { const d=(liveScore(y)||0)-(liveScore(x)||0); return d||new Date(y.created_at)-new Date(x.created_at); });
  if (sortBy === 'lowest')  return a.sort((x,y) => { const d=(liveScore(x)||0)-(liveScore(y)||0); return d||new Date(y.created_at)-new Date(x.created_at); });
  if (sortBy && sortBy.startsWith('rating:')) {
    const key = sortBy.slice(7);
    return a.sort((x,y) => {
      const ex = _ratingVal(x, key), ey = _ratingVal(y, key);
      const xKey = ex != null ? ex : (liveScore(x)||0);
      const yKey = ey != null ? ey : (liveScore(y)||0);
      const d = yKey - xKey;
      if (d) return d;
      return (liveScore(y)||0) - (liveScore(x)||0);
    });
  }
  if (sortBy === 'alpha')   return a.sort((x,y) => (x.title||'').localeCompare(y.title||''));
  if (sortBy === 'zalpha')  return a.sort((x,y) => (y.title||'').localeCompare(x.title||''));
  return a;
}

function sortBar(section) {
  const cur = _sort[section] || 'newest';
  const f = _sfFilter[section] || {};
  const filterCount = (f.genres || []).length + (f.yearMin || f.yearMax ? 1 : 0) + (f.scoreMin || f.scoreMax ? 1 : 0) + (f.lengthMin || f.lengthMax ? 1 : 0) + (f.person ? 1 : 0);
  return `<div class="sort-bar sf-trigger-row">
    <button class="sf-icon-btn${cur!=='newest' ? ' active' : ''}" onclick="openSortPopup('${section}')" aria-label="Sort">
      ${icon('sort', 15)}<span class="sf-icon-btn-label">${cur!=='newest' ? _sfSortShortLabel(section, cur) : 'Sort'}</span>
    </button>
    <button class="sf-icon-btn${filterCount ? ' active' : ''}" onclick="openFilterPopup('${section}')" aria-label="Filter">
      ${icon('filter', 15)}<span class="sf-icon-btn-label">${filterCount ? `Filter (${filterCount})` : 'Filter'}</span>
    </button>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   Sort & Filter — two separate popups (Sort, Filter), each holding
   its own STAGED state that only commits to the real _sort/_sfFilter
   on "Apply". Closing via X, backdrop, or Cancel discards the staged
   copy entirely — nothing changes until Apply is pressed. Filter
   criteria are presented as their own dropdown triggers (genre as a
   checkbox list, decade as a single-select list) rather than a flat
   wall of pills, per the reference screenshots. Config-driven off
   SF_SORT_GROUPS + per-section genre/decade collection, so reusing
   this elsewhere later only needs a base-array getter + render
   dispatcher for that page.
   ══════════════════════════════════════════════════════════════════ */

const _sfFilter = {};       // committed filter state per section
let _sfStagedSort = null;   // staged value while the Sort popup is open
let _sfStagedFilter = null; // staged {genres,decade,scoreMin,scoreMax} while Filter popup is open
let _sfSection = null;

// Flat, grouped sort options, matching the exact list requested.
// 'episode' (TV only) needs each show's latest-aired-episode date,
// captured by _refreshTmdbSeasonData into ratings._last_episode_date —
// entries that haven't been refreshed since that field was added just
// sort to the back rather than breaking anything. 'length' covers both
// movies (runtime) and TV (total episode count, as the closest
// available proxy since there's no single per-show runtime number).
const SF_SORT_GROUPS = [
  { header: 'Alphabetical', opts: [['alpha','A → Z'], ['zalpha','Z → A']] },
  { header: 'Added',        opts: [['newest','Latest'], ['oldest','Earliest']] },
  { header: 'Release Date', opts: [['releaseNewest','Latest'], ['releaseOldest','Earliest']] },
  { header: 'Episode',      opts: [['episodeNewest','Latest'], ['episodeOldest','Earliest']], onlyFor: ['__tvOnly__'] },
  { header: 'Ratings',      opts: [['highest','Highest'], ['lowest','Lowest']], skipFor: ['queue'] },
  { header: 'Length',       opts: [['longest','Longest'], ['shortest','Shortest']] },
];

function _sfBaseEntries(section) {
  if (section === 'watching') return _catAll.filter(e => e.status === 'watching' || e.status === 'paused');
  if (section === 'queue')    return _catAll.filter(e => e.status === 'queue');
  if (section === 'ongoing')  return _catAll.filter(e => e.status === 'ongoing');
  return _catAll.filter(e => e.status === 'completed');
}

function _sfActiveSortGroups(section) {
  const isMovies = typeof IS_MOVIE_CAT === 'function' && IS_MOVIE_CAT();
  return SF_SORT_GROUPS.filter(g => {
    if (g.skipFor && g.skipFor.includes(section)) return false;
    if (g.onlyFor && g.onlyFor.includes('__tvOnly__') && isMovies) return false;
    return true;
  });
}

// Fixed master genre list (standard TMDB set) rather than deriving
// options from whatever's currently in the section — a section only
// having, say, 8 distinct genres represented among its own entries is
// normal (titles typically carry 1-3 genres each), but the filter
// should still offer every genre so it's not limited by what happens
// to already be there.
const SF_ALL_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery',
  'Romance', 'Science Fiction', 'Thriller', 'TV Movie', 'War', 'Western',
];

function _sfGenresForSection(section) {
  return SF_ALL_GENRES;
}

// Movies: actual runtime. TV: total episode count, the closest
// available "length" proxy since there's no single per-show runtime.
function _sfRuntimeMinutes(e) {
  const isMovie = e.cat === 'movies' || e.ratings?._media_type === 'movie';
  if (isMovie) return (Number(e.runtime_h) || 0) * 60 + (Number(e.runtime_m) || 0);
  return Number(e.total_eps) || 0;
}

function _sfSortShortLabel(section, value) {
  if (value.startsWith('rating:')) return _ratingShortLabel(_ratingFilterLabel(window.PAGE_CAT, value.slice(7)));
  for (const g of SF_SORT_GROUPS) for (const [v, l] of g.opts) if (v === value) return g.opts.length > 1 ? g.header : l;
  return 'Sort';
}

function _sfSortEntries(section, base, value) {
  if (value === 'releaseNewest') return [...base].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  if (value === 'releaseOldest') return [...base].sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0));
  if (value === 'episodeNewest') return [...base].sort((a, b) => new Date(b.ratings?._last_episode_date || 0) - new Date(a.ratings?._last_episode_date || 0));
  if (value === 'episodeOldest') return [...base].sort((a, b) => new Date(a.ratings?._last_episode_date || 0) - new Date(b.ratings?._last_episode_date || 0));
  if (value === 'shortest') return [...base].sort((a, b) => _sfRuntimeMinutes(a) - _sfRuntimeMinutes(b));
  if (value === 'longest') return [...base].sort((a, b) => _sfRuntimeMinutes(b) - _sfRuntimeMinutes(a));
  return section === 'watching' ? _sortWatching(base, value) : applySort(base, value);
}

function _applySortFilter(section) {
  let base = _sfBaseEntries(section);
  const f = _sfFilter[section] || {};
  if (f.genres && f.genres.length) base = base.filter(e => (e.genres || []).some(g => f.genres.includes(g)));
  if (f.yearMin) base = base.filter(e => e.year && Number(e.year) >= Number(f.yearMin));
  if (f.yearMax) base = base.filter(e => e.year && Number(e.year) <= Number(f.yearMax));
  if (f.scoreMin) base = base.filter(e => liveScore(e) != null && liveScore(e) >= Number(f.scoreMin));
  if (f.scoreMax) base = base.filter(e => liveScore(e) != null && liveScore(e) <= Number(f.scoreMax));
  if (f.lengthMin) base = base.filter(e => _sfRuntimeMinutes(e) >= Number(f.lengthMin));
  if (f.lengthMax) base = base.filter(e => _sfRuntimeMinutes(e) <= Number(f.lengthMax));
  if (f._personMatchIds) base = base.filter(e => f._personMatchIds.includes(e.id));
  const value = _sort[section] || 'newest';
  const sorted = _sfSortEntries(section, base, value);
  const inner = document.querySelector(`#body-${section} .accordion-inner`);
  if (!inner) return;
  const content = section === 'watching' ? buildWatching(sorted)
                : section === 'queue'    ? buildQueue(sorted)
                : section === 'ongoing'  ? buildCompleted(sorted, 'ongoing')
                :                          buildCompleted(sorted, 'completed');
  inner.innerHTML = sortBar(section) + content;
}

function setSort(section, value) {
  _sort[section] = value;
  _applySortFilter(section);
}

/* ── Sort popup ── */

function _injectSortOverlay() {
  if (document.getElementById('sfSortOverlay')) return;
  const el = document.createElement('div');
  el.id = 'sfSortOverlay';
  el.innerHTML = `<div id="sfSortCard">
    <div class="sf-header">
      <div class="sf-title">Sort</div>
      <button class="sf-close" onclick="closeSortPopup()">${icon('x', 18)}</button>
    </div>
    <div class="sf-body" id="sfSortBody"></div>
    <div class="sf-footer">
      <button class="sf-clear-btn" onclick="_sfResetStagedSort()">Reset</button>
      <button class="sf-apply-btn" onclick="_sfApplySort()">Apply</button>
    </div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) closeSortPopup(); });
  document.body.appendChild(el);
}

function openSortPopup(section) {
  _injectSortOverlay();
  _sfSection = section;
  _sfStagedSort = _sort[section] || 'newest';
  document.getElementById('sfSortBody').innerHTML = _sfSortBodyHTML(section);
  document.getElementById('sfSortOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSortPopup() {
  const ov = document.getElementById('sfSortOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
  _sfStagedSort = null;
}

function _sfSortBodyHTML(section) {
  const staged = _sfStagedSort;
  const groups = _sfActiveSortGroups(section);
  const showRating = section === 'completed' || section === 'ongoing';
  const isRating = staged.startsWith('rating:');

  // Each criterion is its own dropdown row — trigger shows just the
  // criterion's name (not the currently-picked option), and opening
  // it shows only that criterion's own options. The row whose option
  // is the active sort is highlighted so it's clear which is applied.
  let html = `<div class="sf-section-label">Sort By</div><div class="sf-dd-stack">`;
  groups.forEach((g, i) => {
    const ddId = `sfSortDD-${i}`;
    const isActiveGroup = g.opts.some(([v]) => v === staged);
    // Trigger shows just the criterion name normally; once this group
    // IS the active sort, it shows "Header: Option" so the applied
    // value is visible without opening the menu.
    const label = isActiveGroup ? `${g.header}: ${g.opts.find(([v]) => v === staged)[1]}` : g.header;
    const menu = g.opts.map(([v, l]) => `<div class="td-dd-opt${staged===v?' active':''}" onclick="event.stopPropagation();_sfStageSort('${v}')">${l}</div>`).join('');
    html += `
    <div class="td-dd sf-dd sf-dd-wide" id="${ddId}">
      <button type="button" class="td-dd-trigger sf-dd-trigger${isActiveGroup?' active':''}" onclick="event.stopPropagation();_sfToggleDD('${ddId}')">
        <span class="td-dd-label">${label}</span>
        <svg class="td-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="td-dd-menu">${menu}</div>
    </div>`;
  });
  html += `</div>`;

  if (showRating) {
    const opts = _ratingFilterOptions(window.PAGE_CAT);
    let lastGroup = null;
    let menu = '';
    opts.forEach(o => {
      if (o.group !== lastGroup) { menu += `<div class="sf-dd-subgroup-label">${o.group}</div>`; lastGroup = o.group; }
      menu += `<div class="td-dd-opt${isRating && staged.slice(7)===o.key?' active':''}" onclick="event.stopPropagation();_sfStageSort('rating:${o.key}')">${o.label}</div>`;
    });
    html += `<div class="sf-section-label">Rating</div>
    <div class="td-dd sf-dd sf-dd-wide" id="sfSortDD-rating">
      <button type="button" class="td-dd-trigger sf-dd-trigger${isRating?' active':''}" onclick="event.stopPropagation();_sfToggleDD('sfSortDD-rating')">
        <span class="td-dd-label">Specific Rating${isRating ? `: ${_ratingFilterLabel(window.PAGE_CAT, staged.slice(7))}` : ''}</span>
        <svg class="td-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="td-dd-menu">${menu}</div>
    </div>`;
  }
  return html;
}

function _sfStageSort(value) {
  _sfStagedSort = value;
  document.getElementById('sfSortBody').innerHTML = _sfSortBodyHTML(_sfSection);
}

// "Reset" stages the sort back to the default (Added: Latest) without
// closing the popup — distinct from Cancel/X/backdrop, which discard
// the staged pick and leave whatever sort was already applied alone.
// Still requires Apply to actually take effect, same as any other pick.
function _sfResetStagedSort() {
  _sfStagedSort = 'newest';
  document.getElementById('sfSortBody').innerHTML = _sfSortBodyHTML(_sfSection);
}

const _sfEpisodeDateCache = {}; // tmdb_id -> air_date string, in-memory for the session

async function _sfFetchLastEpisodeDate(entry) {
  if (entry.ratings?._last_episode_date) return entry.ratings._last_episode_date;
  if (!entry.tmdb_id || entry.tmdb_type !== 'tv') return null;
  if (_sfEpisodeDateCache[entry.tmdb_id] !== undefined) return _sfEpisodeDateCache[entry.tmdb_id];
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/tv/${entry.tmdb_id}?api_key=${TMDB_KEY}&language=en-US`);
    const date = res.ok ? (await res.json()).last_episode_to_air?.air_date || null : null;
    _sfEpisodeDateCache[entry.tmdb_id] = date;
    // Persist to the DB (not just this in-memory session cache), so
    // this fetch never has to happen again for this entry — matching
    // the same ratings-blob pattern _refreshTmdbSeasonData already uses
    // for season/episode counts, just for this one extra field.
    if (date) {
      const newRatings = { ...(entry.ratings || {}), _last_episode_date: date };
      updateProgress(entry.id, _catUser.id, { ratings: newRatings }).catch(() => {});
      entry.ratings = newRatings;
    }
    return date;
  } catch { _sfEpisodeDateCache[entry.tmdb_id] = null; return null; }
}

async function _sfApplySort() {
  const section = _sfSection;
  const value = _sfStagedSort;
  if (!section || !value) { closeSortPopup(); return; }

  // Episode sort needs each TV entry's latest-aired-episode date, which
  // for most entries has never been fetched (it's normally only backfilled
  // incidentally when that show's own info popup happens to be opened).
  // Fetching it here on demand — same pattern as the Actor/Director
  // filter — means the sort actually works immediately instead of
  // silently doing nothing for entries missing that field.
  if (value === 'episodeNewest' || value === 'episodeOldest') {
    const applyBtn = document.querySelector('#sfSortCard .sf-apply-btn');
    if (applyBtn) { applyBtn.textContent = 'Loading…'; applyBtn.disabled = true; }
    const base = _sfBaseEntries(section);
    await Promise.all(base.map(async e => {
      const date = await _sfFetchLastEpisodeDate(e);
      if (date) e.ratings = { ...(e.ratings || {}), _last_episode_date: date };
    }));
    if (applyBtn) { applyBtn.textContent = 'Apply'; applyBtn.disabled = false; }
  }

  setSort(section, value);
  closeSortPopup();
}

/* ── Filter popup ── */

function _injectFilterOverlay() {
  if (document.getElementById('sfFilterOverlay')) return;
  const el = document.createElement('div');
  el.id = 'sfFilterOverlay';
  el.innerHTML = `<div id="sfFilterCard">
    <div class="sf-header">
      <div class="sf-title">Filter</div>
      <button class="sf-close" onclick="closeFilterPopup()">${icon('x', 18)}</button>
    </div>
    <div class="sf-body" id="sfFilterBody"></div>
    <div class="sf-footer">
      <button class="sf-clear-btn" onclick="_sfClearStagedFilter()">Clear</button>
      <button class="sf-apply-btn" onclick="_sfApplyFilter()">Apply</button>
    </div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) closeFilterPopup(); });
  document.body.appendChild(el);
}

function openFilterPopup(section) {
  _injectFilterOverlay();
  _sfSection = section;
  const cur = _sfFilter[section] || {};
  _sfStagedFilter = {
    genres: [...(cur.genres || [])],
    yearMin: cur.yearMin || '', yearMax: cur.yearMax || '',
    scoreMin: cur.scoreMin || '', scoreMax: cur.scoreMax || '',
    lengthMin: cur.lengthMin || '', lengthMax: cur.lengthMax || '',
    person: cur.person || '',
  };
  document.getElementById('sfFilterBody').innerHTML = _sfFilterBodyHTML(section);
  document.getElementById('sfFilterOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeFilterPopup() {
  const ov = document.getElementById('sfFilterOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
  _sfStagedFilter = null;
}

const _sfCastCache = {}; // tmdb_id -> { director, cast:[names] }, in-memory for the session

async function _sfFetchCredits(entry) {
  if (entry.ratings?._director != null || entry.ratings?._cast_names) {
    return { director: entry.ratings._director || '', cast: entry.ratings._cast_names || [] };
  }
  if (!entry.tmdb_id || !entry.tmdb_type) return null;
  if (_sfCastCache[entry.tmdb_id]) return _sfCastCache[entry.tmdb_id];
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/${entry.tmdb_type}/${entry.tmdb_id}?api_key=${TMDB_KEY}&language=en-US&append_to_response=credits`);
    if (!res.ok) return null;
    const data = await res.json();
    const director = (data.credits?.crew || []).find(c => c.job === 'Director')?.name || '';
    const cast = (data.credits?.cast || []).slice(0, 12).map(c => c.name);
    const result = { director, cast };
    _sfCastCache[entry.tmdb_id] = result;
    // Persist to the DB so this fetch never has to happen again for
    // this entry, same pattern as the episode-date fetch above.
    const newRatings = { ...(entry.ratings || {}), _director: director, _cast_names: cast };
    updateProgress(entry.id, _catUser.id, { ratings: newRatings }).catch(() => {});
    entry.ratings = newRatings;
    return result;
  } catch { return null; }
}

function _sfFilterBodyHTML(section) {
  const f = _sfStagedFilter;
  const genres = _sfGenresForSection(section);

  const genreLabel = f.genres.length ? f.genres.join(', ') : 'Any Genre';
  const genreMenu = genres.map(g => `
    <label class="sf-check-row" onclick="event.stopPropagation();">
      <input type="checkbox" ${f.genres.includes(g)?'checked':''} onchange="_sfStageGenre('${g.replace(/'/g,"\\'")}')">
      <span class="sf-check-mark"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
      <span>${g}</span>
    </label>`).join('');

  const isMovies = typeof IS_MOVIE_CAT === 'function' && IS_MOVIE_CAT();

  return `
    <div class="sf-section-label">Genre</div>
    <div class="td-dd sf-dd sf-dd-wide" id="sfGenreDD">
      <button type="button" class="td-dd-trigger sf-dd-trigger${f.genres.length?' active':''}" onclick="event.stopPropagation();_sfToggleDD('sfGenreDD')">
        <span class="td-dd-label">${genreLabel}</span>
        <svg class="td-dd-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="td-dd-menu sf-check-menu">${genreMenu || '<div class="sf-empty">No genres in this section yet.</div>'}</div>
    </div>

    <div class="sf-section-label">Release Year</div>
    <div class="sf-range-row">
      <input type="number" class="sf-range-input" id="sfYearMin" placeholder="From" value="${f.yearMin}" oninput="_sfStageRanges()">
      <span class="sf-range-to">to</span>
      <input type="number" class="sf-range-input" id="sfYearMax" placeholder="To" value="${f.yearMax}" oninput="_sfStageRanges()">
    </div>

    <div class="sf-section-label">MyScreenScore <span class="sf-section-hint">(rated items only)</span></div>
    <div class="sf-range-row">
      <input type="number" step="0.1" min="0" max="10" class="sf-range-input" id="sfScoreMin" placeholder="Min" value="${f.scoreMin}" oninput="_sfStageRanges()">
      <span class="sf-range-to">to</span>
      <input type="number" step="0.1" min="0" max="10" class="sf-range-input" id="sfScoreMax" placeholder="Max" value="${f.scoreMax}" oninput="_sfStageRanges()">
    </div>

    <div class="sf-section-label">${isMovies ? 'Runtime (minutes)' : 'Episode Count'}</div>
    <div class="sf-range-row">
      <input type="number" min="0" class="sf-range-input" id="sfLengthMin" placeholder="Min" value="${f.lengthMin}" oninput="_sfStageRanges()">
      <span class="sf-range-to">to</span>
      <input type="number" min="0" class="sf-range-input" id="sfLengthMax" placeholder="Max" value="${f.lengthMax}" oninput="_sfStageRanges()">
    </div>

    <div class="sf-section-label">Actor / Director</div>
    <div class="td-dd sf-dd sf-dd-wide" id="sfPersonDD">
      <input type="text" class="sf-range-input sf-text-input sf-dd-trigger" id="sfPerson" placeholder="Search by name…" autocomplete="off"
        value="${f.person || ''}" oninput="_sfPersonInput(event.target.value)" onfocus="event.stopPropagation();_sfOpenPersonDD()" onclick="event.stopPropagation();">
      <div class="td-dd-menu" id="sfPersonMenu"></div>
    </div>
    <div class="sf-section-hint sf-person-hint">Names are pulled from each title's cast &amp; crew the first time you search a section — may take a moment to load initially, then it's instant.</div>`;
}

// Actor/director suggestions per section: null = not yet fetched,
// otherwise a sorted array of unique names built from every entry's
// cached credits (see _sfFetchCredits, which is also reused by Apply's
// actual filtering — this just gives the input something to suggest
// against instead of the person guessing exact spelling/name order).
const _sfPersonNames = {};

async function _sfOpenPersonDD() {
  // Focus pre-fetches the section's cast/crew names in the background
  // so they're ready by the time the person actually types something,
  // but the dropdown itself stays closed until there's a real query —
  // showing the full (possibly huge) name list on a bare focus isn't
  // useful and just gets in the way.
  const section = _sfSection;
  if (_sfPersonNames[section]) return;
  const base = _sfBaseEntries(section);
  const names = new Set();
  await Promise.all(base.map(async e => {
    const credits = await _sfFetchCredits(e);
    if (!credits) return;
    if (credits.director) names.add(credits.director);
    credits.cast.forEach(n => names.add(n));
  }));
  _sfPersonNames[section] = [...names].sort((a, b) => a.localeCompare(b));
  if (_sfSection === section) _sfRenderPersonMenu();
}

function _sfPersonInput(value) {
  _sfStagedFilter.person = value;
  _sfRenderPersonMenu();
}

function _sfRenderPersonMenu() {
  const dd = document.getElementById('sfPersonDD');
  const menuEl = document.getElementById('sfPersonMenu');
  if (!dd || !menuEl) return;
  const query = (_sfStagedFilter.person || '').trim().toLowerCase();
  if (query.length < 2) {
    dd.classList.remove('open');
    menuEl.style.cssText = '';
    return;
  }
  const all = _sfPersonNames[_sfSection];
  if (!all) {
    menuEl.innerHTML = `<div class="sf-empty">Loading actors &amp; directors…</div>`;
  } else {
    const matches = all.filter(n => n.toLowerCase().includes(query)).slice(0, 50);
    menuEl.innerHTML = matches.length
      ? matches.map(n => `<div class="td-dd-opt" onclick="event.stopPropagation();_sfPickPerson('${n.replace(/'/g,"\\'")}')">${n}</div>`).join('')
      : `<div class="sf-empty">No matching names.</div>`;
  }
  dd.classList.add('open');
  _sfPositionDD(dd);
}

function _sfPickPerson(name) {
  _sfStagedFilter.person = name;
  document.getElementById('sfPerson').value = name;
  document.getElementById('sfPersonDD').classList.remove('open');
  document.getElementById('sfPersonMenu').style.cssText = '';
}

function _sfPositionDD(target) {
  // The menu is normally position:absolute, but that gets clipped by
  // .sf-body's own overflow:auto once it extends past that container's
  // edge — no amount of z-index fixes that, since overflow clipping
  // applies regardless of stacking order. Switching to position:fixed
  // with coordinates computed from the trigger's actual screen position
  // escapes that clipping entirely, and flips upward automatically if
  // there isn't room below.
  const trigger = target.querySelector('.sf-dd-trigger');
  const menu = target.querySelector('.td-dd-menu');
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const menuMaxHeight = 220;
  const openUp = spaceBelow < menuMaxHeight + 16 && rect.top > menuMaxHeight;
  menu.style.cssText = `position:fixed; left:${rect.left}px; width:${rect.width}px; z-index:1400; display:block; ` +
    (openUp ? `bottom:${window.innerHeight - rect.top}px; top:auto; border-radius:var(--radius-sm) var(--radius-sm) 0 0; border-top:0.5px solid var(--olive-light); border-bottom:none;`
            : `top:${rect.bottom}px; bottom:auto;`);
}

function _sfToggleDD(id) {
  const target = document.getElementById(id);
  const wasOpen = target.classList.contains('open');
  document.querySelectorAll('.sf-dd.open').forEach(el => { el.classList.remove('open'); const m = el.querySelector('.td-dd-menu'); if (m) m.style.cssText = ''; });
  if (wasOpen) return;
  target.classList.add('open');
  _sfPositionDD(target);
}
document.addEventListener('click', () => document.querySelectorAll('.sf-dd.open').forEach(el => { el.classList.remove('open'); const m = el.querySelector('.td-dd-menu'); if (m) m.style.cssText = ''; }));
window.addEventListener('resize', () => document.querySelectorAll('.sf-dd.open').forEach(el => el.classList.remove('open')));
document.addEventListener('scroll', ev => {
  if (ev.target.classList?.contains('sf-body')) document.querySelectorAll('.sf-dd.open').forEach(el => { el.classList.remove('open'); const m = el.querySelector('.td-dd-menu'); if (m) m.style.cssText = ''; });
}, true);

function _sfStageGenre(genre) {
  const cur = _sfStagedFilter.genres;
  _sfStagedFilter.genres = cur.includes(genre) ? cur.filter(g => g !== genre) : [...cur, genre];
  // Update just the trigger label and this checkbox's own state directly,
  // rather than re-rendering the whole dropdown — rebuilding the menu's
  // HTML resets its scroll position to the top, which is exactly the
  // annoying jump this avoids when picking several genres in a row.
  const dd = document.getElementById('sfGenreDD');
  const trigger = dd.querySelector('.sf-dd-trigger');
  const label = _sfStagedFilter.genres.length ? _sfStagedFilter.genres.join(', ') : 'Any Genre';
  trigger.querySelector('.td-dd-label').textContent = label;
  trigger.classList.toggle('active', _sfStagedFilter.genres.length > 0);
}

function _sfStageRanges() {
  const val = id => document.getElementById(id)?.value ?? '';
  _sfStagedFilter.yearMin = val('sfYearMin'); _sfStagedFilter.yearMax = val('sfYearMax');
  _sfStagedFilter.scoreMin = val('sfScoreMin'); _sfStagedFilter.scoreMax = val('sfScoreMax');
  _sfStagedFilter.lengthMin = val('sfLengthMin'); _sfStagedFilter.lengthMax = val('sfLengthMax');
}

function _sfClearStagedFilter() {
  _sfStagedFilter = { genres: [], yearMin: '', yearMax: '', scoreMin: '', scoreMax: '', lengthMin: '', lengthMax: '', person: '' };
  document.getElementById('sfFilterBody').innerHTML = _sfFilterBodyHTML(_sfSection);
}

async function _sfApplyFilter() {
  const section = _sfSection;
  if (!section || !_sfStagedFilter) { closeFilterPopup(); return; }
  const staged = { ..._sfStagedFilter };
  const applyBtn = document.querySelector('#sfFilterCard .sf-apply-btn');

  // Actor/director needs a credits fetch per entry (cached after the
  // first lookup), so only pay that cost when the field is actually used.
  if (staged.person && staged.person.trim()) {
    const query = staged.person.trim().toLowerCase();
    if (applyBtn) { applyBtn.textContent = 'Searching…'; applyBtn.disabled = true; }
    const base = _sfBaseEntries(section);
    const matches = new Set();
    await Promise.all(base.map(async e => {
      const credits = await _sfFetchCredits(e);
      if (!credits) return;
      const hit = credits.director.toLowerCase().includes(query) || credits.cast.some(n => n.toLowerCase().includes(query));
      if (hit) matches.add(e.id);
    }));
    staged._personMatchIds = [...matches];
    if (applyBtn) { applyBtn.textContent = 'Apply'; applyBtn.disabled = false; }
  } else {
    staged._personMatchIds = null;
  }

  _sfFilter[section] = staged;
  _applySortFilter(section);
  closeFilterPopup();
}



/* ── Rating filter popup — lets the person sort a section by any specific
   rating instead of just overall score. See openRatingFilter(). ── */
let _ratingFilterSection = null;

function _injectRatingFilterOverlay() {
  if (document.getElementById('ratingFilterOverlay')) return;
  const el = document.createElement('div');
  el.id = 'ratingFilterOverlay';
  el.innerHTML = `<div id="ratingFilterCard">
    <div class="rf-header">
      <div class="rf-title">Sort by Rating</div>
      <button class="rf-close" onclick="closeRatingFilter()">${icon('x', 18)}</button>
    </div>
    <div class="rf-list" id="ratingFilterList"></div>
  </div>`;
  el.addEventListener('click', ev => { if (ev.target === el) closeRatingFilter(); });
  document.body.appendChild(el);
}

function openRatingFilter(section) {
  _injectRatingFilterOverlay();
  _ratingFilterSection = section;
  const cur = _sort[section] || 'newest';
  const curKey = cur.startsWith('rating:') ? cur.slice(7) : null;
  const opts = _ratingFilterOptions(window.PAGE_CAT);

  let html = `<div class="rf-item${!curKey ? ' active' : ''}" onclick="_pickRatingFilter(null)">
    <span>Overall Score (default)</span><span class="rf-item-check">${icon('check', 15)}</span>
  </div>`;
  let lastGroup = null;
  opts.forEach(o => {
    if (o.group !== lastGroup) { html += `<div class="rf-group-label">${o.group}</div>`; lastGroup = o.group; }
    html += `<div class="rf-item${curKey===o.key?' active':''}" onclick="_pickRatingFilter('${o.key}')">
      <span>${o.label}</span><span class="rf-item-check">${icon('check', 15)}</span>
    </div>`;
  });
  document.getElementById('ratingFilterList').innerHTML = html;

  document.getElementById('ratingFilterOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeRatingFilter() {
  const ov = document.getElementById('ratingFilterOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  document.body.style.overflow = '';
}

function _pickRatingFilter(key) {
  const section = _ratingFilterSection;
  closeRatingFilter();
  if (!section) return;
  setSort(section, key ? 'rating:' + key : 'highest');
}

/* Paused entries always sink to the bottom regardless of sort */
function _sortWatching(items, sortBy) {
  const active = applySort(items.filter(e => e.status !== 'paused'), sortBy);
  const paused = applySort(items.filter(e => e.status === 'paused'), sortBy);
  return [...active, ...paused];
}

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
    await renderPage();
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

function _catTypeFilterBar() {
  const wrap = document.getElementById('catTypeFilterWrap');
  if (!wrap) return;
  const isAnimated = window.PAGE_CAT === 'anime' || window.PAGE_CAT === 'cartoons';
  if (!isAnimated) { wrap.innerHTML = ''; return; }
  const opts = [['all','All'],['movie','Movie'],['tv','TV Show']];
  wrap.innerHTML = `<div class="sort-bar" style="background:transparent;margin:0 0 18px;padding:0;border-bottom:none;">${opts.map(([v,l]) =>
    `<button class="sort-btn${_catTypeFilter===v?' active':''}" onclick="setCatTypeFilter('${v}')">${l}</button>`
  ).join('')}</div>`;
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
}

function _catRenderStatsAndSections() {

  const watching  = _catAll.filter(e => e.status === 'watching' || e.status === 'paused');
  const queue     = _catAll.filter(e => e.status === 'queue');
  const completed = _catAll.filter(e => e.status === 'completed');
  const ongoing   = _catAll.filter(e => e.status === 'ongoing');
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
      ${totalMins ? `<div class="page-stat"><div class="page-stat-num">${wtLabel}</div><div class="page-stat-label">Watch Time</div></div>` : ''}`;
  } else {
    const isTv = window.PAGE_CAT === 'tv';
    const isAnimated = window.PAGE_CAT === 'anime' || window.PAGE_CAT === 'cartoons';
    const totalEpsWatched = _catAll
      .filter(e => e.status === 'watching' || e.status === 'paused' || e.status === 'completed' || e.status === 'ongoing')
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
        <div class="page-stat"><div class="page-stat-num">${totalEpsWatched ? totalEpsWatched.toLocaleString() : '0'}</div><div class="page-stat-label">Episodes</div></div>`;
    }
  }

  renderSections(watching, queue, completed);
}

/* Sync re-render from cached data — no network call */
function renderSections(
  watching  = _catAll.filter(e => e.status === 'watching' || e.status === 'paused'),
  queue     = _catAll.filter(e => e.status === 'queue'),
  completed = _catAll.filter(e => e.status === 'completed'),
  ongoing   = _catAll.filter(e => e.status === 'ongoing'),
) {
  const sw = _sortWatching(watching, _sort.watching);
  const sq = applySort(queue,     _sort.queue);
  const sc = applySort(completed, _sort.completed);
  const so = applySort(ongoing,   _sort.ongoing);
  let html = '';

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

  document.getElementById('sectionsWrap').innerHTML = html;
  if (typeof fitTitleYear === 'function') fitTitleYear(document.getElementById('sectionsWrap'));
}

/* ════════ SECTION ACCORDION ════════ */
function buildSection(key, title, count, content) {
  const isOpen      = !collapsed[key];
  const currentView = getView(key);

  const viewToggle = `<div class="view-toggle">
    <button class="vt-btn ${currentView==='list'?'active':''}" data-view="list" onclick="switchView('${key}','list')" title="List view">${icon('list',13)}</button>
    <button class="vt-btn ${currentView==='grid'?'active':''}" data-view="grid" onclick="switchView('${key}','grid')" title="Grid view">${icon('grid',13)}</button>
  </div>`;

  const qpBtn = key === 'queue'
    ? `<button class="qp-trigger" onclick="showQueuePicker()" ${count === 0 ? 'disabled' : ''}>${icon('sparkles',12)} <span class="qp-label">What Should I Watch Next?</span></button>`
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
  let base;
  if (section === 'watching') base = _catAll.filter(e => e.status === 'watching' || e.status === 'paused');
  else if (section === 'queue') base = _catAll.filter(e => e.status === 'queue');
  else if (section === 'ongoing') base = _catAll.filter(e => e.status === 'ongoing');
  else base = _catAll.filter(e => e.status === 'completed');
  const sorted  = section === 'watching' ? _sortWatching(base, _sort[section]) : applySort(base, _sort[section]);
  const content = section === 'watching' ? buildWatchingContent(sorted)
                : section === 'queue'    ? buildQueue(sorted)
                : section === 'ongoing'  ? buildCompleted(sorted, 'ongoing')
                :                          buildCompleted(sorted, 'completed');
  inner.innerHTML = sortBar(section) + content;
  if (typeof fitTitleYear === 'function') fitTitleYear(inner);
}

/* ════════ CURRENTLY WATCHING ════════ */

function emptyWatching() {
  return `<div class="empty"><div class="empty-icon" style="opacity:.35">${icon('play',40)}</div><div class="empty-text">Nothing watching yet.<br><a href="#" onclick="openAddModal('${window.PAGE_CAT}');return false" style="color:var(--olive-light)">Add something →</a></div></div>`;
}

/* Unified entry point — respects category and per-item type */
function buildWatchingContent(items) {
  const isMovies = IS_MOVIE_CAT();

  if (isMovies) {
    const activeItems = items.filter(e => e.status === 'watching');
    const pausedItems = items.filter(e => e.status === 'paused');
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
        ${buildMoviesWatching(movieItems.filter(e => e.status === 'watching'), movieItems.filter(e => e.status === 'paused'))}
      </div>`;
  }

  if (movieItems.length) {
    return buildMoviesWatching(movieItems.filter(e => e.status === 'watching'), movieItems.filter(e => e.status === 'paused'));
  }

  return buildWatching(showItems);
}

function buildWatching(items) {
  if (!items.length) return emptyWatching();
  return getView('watching') === 'grid' ? renderWatchingGrid(items) : renderWatchingList(items);
}

/* Movies-style watching: Done button in both grid and list */
function renderMoviesWatchingList(items) {
  return `<div class="watch-list">${items.map(e => {
    const isPaused = e.status === 'paused';
    const cardStyle = isPaused ? 'background:var(--olive-faint);border-color:var(--border-olive);opacity:0.85' : '';
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    const rtStr = (rtH||rtM) ? (rtH ? `${rtH}h ${rtM}m` : `${rtM}m`) : '';
    return `<div class="w-card" style="${cardStyle}" onclick="openCatInfoPopup('${e.id}')">
      <div class="w-poster" style="position:relative">
        ${posterHTML(e)}
        ${isPaused ? `<div style="position:absolute;inset:0;background:rgba(74,103,65,0.55);display:flex;align-items:center;justify-content:center;border-radius:10px">
          <span style="font-size:9px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;text-align:center;padding:2px 4px;line-height:1.3">Taking<br>a Break</span>
        </div>` : ''}
      </div>
      <div class="w-body">
        <div class="w-top"><div class="w-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">${e.title}${e.year ? `<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);">${e.year}</span>` : ''}${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : ''}</div></div>
        <div class="w-genre">${_badge}${rtStr ? `<span class="w-ep-badge">${rtStr}</span>` : ''}</div>
      </div>
      <div class="w-ep-controls" onclick="event.stopPropagation()">
        ${isPaused
          ? `<button class="w-list-action-btn" onclick="resumeEntry('${e.id}')" title="Resume">${icon('play',14)}</button>`
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
    const isPaused = e.status === 'paused';
    const rtH = Number(e.runtime_h)||0, rtM = Number(e.runtime_m)||0;
    const rt  = (rtH||rtM) ? (rtH?`${rtH}h ${rtM}m`:`${rtM}m`) : '';
    const typeClsPcg = 'type-label type-label-overlay-bottom';
    return `<div class="wg-card" onclick="openCatInfoPopup('${e.id}')">
      <div class="wg-poster" style="position:relative;">
        ${posterHTML(e, 'big')}
        ${isPaused
          ? `<div style="position:absolute;inset:0;background:rgba(74,103,65,0.58);display:flex;align-items:center;justify-content:center;z-index:1">
               <span style="font-size:clamp(9px,2.4vw,12px);font-weight:700;color:#fff;letter-spacing:1.5px;text-transform:uppercase;text-align:center;line-height:1.5">Taking<br>a Break</span>
             </div>`
          : ''}
        ${SHOW_TYPE_TAG() ? `<span class="${typeClsPcg}">Movie</span>` : ''}
        ${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? '<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>' : ''}
      </div>
      <div class="wg-info" style="padding:8px 12px;gap:6px;">
        <div class="title-year-row">
          <div class="wg-title" style="margin-bottom:0;">${e.title}</div>
          ${e.year ? `<span class="title-year-inline">${e.year}</span>` : ''}
        </div>
        ${rt ? `<div class="wg-genre" style="font-size:11px;"><span class="w-ep-badge">${rt}</span></div>` : ''}
        <div class="wg-controls" onclick="event.stopPropagation()" style="margin-top:auto;">
          ${isPaused
            ? `<button class="ep-btn ep-btn-resume" onclick="resumeEntry('${e.id}')">Resume</button>`
            : `<button class="continue-btn" onclick="markMovieComplete(event, '${e.id}')">Done</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
  return _navWrap(gid, `<div class="watching-grid" id="${gid}">${cards}</div>`);
}

function renderWatchingList(items) {
  return `<div class="watch-list">${items.map(e => {
    const isPaused = e.status === 'paused';
    const pct      = e.total_eps ? Math.round(((e.watched??0) / e.total_eps) * 100) : 0;
    const isDone   = !isPaused && (pct >= 100 || (!e.total_eps && (e.episode??0) > 0));
    const epStr    = e.season != null ? `S${e.season} · E${e.episode ?? 0}` : (e.watched ? `Ep ${e.watched}` : 'Ep 1');
    const cardStyle = isPaused ? 'background:var(--olive-faint);border-color:var(--border-olive);opacity:0.85' : '';
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    return `<div class="w-card" style="${cardStyle}" onclick="openCatInfoPopup('${e.id}')">
      <div class="w-poster" style="position:relative">
        ${posterHTML(e)}
        ${isPaused ? `<div style="position:absolute;inset:0;background:rgba(74,103,65,0.55);display:flex;align-items:center;justify-content:center;border-radius:10px">
          <span style="font-size:9px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;text-align:center;padding:2px 4px;line-height:1.3">Taking<br>a Break</span>
        </div>` : ''}
      </div>
      <div class="w-body">
        <div class="w-top"><div class="w-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">${e.title}${e.year ? `<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);">${e.year}</span>` : ''}${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : ''}</div></div>
        <div class="w-ep-row">
          ${_badge}
          <span class="w-ep-badge">${epStr}</span>
        </div>
        <div class="w-prog-track"><div class="w-prog-fill" style="width:${pct}%${isPaused?';background:var(--text-3)':''}"></div></div>
        <div class="w-prog-label">${e.total_eps ? `${e.watched??0} / ${e.total_eps} eps · ${pct}%` : (e.episode ? `Ep ${e.episode}` : '')}</div>
      </div>
      <div class="w-ep-controls${isDone?' w-ep-controls--done':''}" onclick="event.stopPropagation()">
        ${isPaused
          ? `<button class="w-list-action-btn" onclick="resumeEntry('${e.id}')" title="Resume">${icon('play',14)}</button>`
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
    const isPaused = e.status === 'paused';
    const pct      = e.total_eps ? Math.round(((e.watched??0) / e.total_eps) * 100) : 0;
    const isDone   = !isPaused && (pct >= 100 || (!e.total_eps && (e.episode??0) > 0));
    const epStr    = e.season != null ? `S${e.season} · E${e.episode ?? 0}` : (e.watched ? `Ep ${e.watched}` : '');
    const isMovieG = e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
    const typeCls = (isMovieG ? 'type-label' : 'type-label type-label-tv') + ' type-label-overlay-bottom';
    return `<div class="wg-card" onclick="openCatInfoPopup('${e.id}')">
      <div class="wg-poster" style="position:relative;">
        ${posterHTML(e, 'big')}
        ${isPaused
          ? `<div style="position:absolute;inset:0;background:rgba(74,103,65,0.58);display:flex;align-items:center;justify-content:center;z-index:1">
               <span style="font-size:clamp(9px,2.4vw,12px);font-weight:700;color:#fff;letter-spacing:1.5px;text-transform:uppercase;text-align:center;line-height:1.5">Taking<br>a Break</span>
             </div>`
          : ''}
        ${SHOW_TYPE_TAG() ? `<span class="${typeCls}">${isMovieG ? 'Movie' : 'TV Show'}</span>` : ''}
        ${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? '<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>' : ''}
      </div>
      <div class="wg-info">
        <div style="margin-bottom:6px;">
          <div class="title-year-row" style="margin-bottom:4px;">
            <div class="wg-title">${e.title}</div>
            ${e.year ? `<span class="title-year-inline">${e.year}</span>` : ''}
          </div>
        </div>
        ${epStr ? `<div class="wg-genre"><span class="w-ep-badge">${epStr}</span></div>` : ''}
        ${e.total_eps ? `<div class="wg-prog-track" style="margin-bottom:3px;"><div class="wg-prog-fill" style="width:${pct}%${isPaused?';background:var(--text-3)':''}"></div></div>
        <div style="font-size:10px;color:var(--text-3);margin-bottom:4px;">${e.watched??0} / ${e.total_eps} eps · ${pct}%</div>` : ''}
        <div class="wg-controls${isDone?' wg-controls--done':''}" onclick="event.stopPropagation()">
          ${isPaused
            ? `<button class="ep-btn ep-btn-resume" onclick="resumeEntry('${e.id}')">Resume</button>`
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
            <div class="wg-title" style="margin-bottom:4px;">${e.title}</div>
            ${e.year ? `<span class="title-year-inline">${e.year}</span>` : ''}
          </div>
          ${scope ? `<div class="w-ep-row"><span class="w-ep-badge">${scope}</span></div>` : ''}
        </div>
      </div>
      <div class="start-watching-wrap" onclick="event.stopPropagation()">
        <button onclick="startWatching('${e.id}')" class="continue-btn">Start</button>
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

/* ════════ GRID DETAIL POPUP (shared modal) ════════ */
function _injectGridPopup() {
  if (document.getElementById('cgPopupOverlay')) return;
  const el = document.createElement('div');
  el.id = 'cgPopupOverlay';
  el.style.cssText = `
    position:fixed;inset:0;z-index:900;
    background:rgba(0,0,0,0.72);
    display:flex;align-items:center;justify-content:center;
    padding:16px;box-sizing:border-box;
    opacity:0;transition:opacity 220ms var(--ease);
    pointer-events:none;
  `;
  el.innerHTML = `
    <div id="cgPopupCard" style="
      background:var(--bg-2);border:1.5px solid var(--olive-light);
      box-shadow:4px 4px 0 var(--olive);border-radius:var(--radius-lg);
      width:100%;max-width:min(97vw, 920px);max-height:90dvh;overflow-y:auto;overscroll-behavior-y:contain;
      position:relative;box-sizing:border-box;
      transform:translateY(18px);transition:transform 260ms var(--ease);
    ">
      <!-- header -->
      <div id="cgPopupHeader" style="
        display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;
        padding:24px 24px 0;
      ">
        <div id="cgPopupPoster" style="
          width:150px;height:225px;flex-shrink:0;border-radius:var(--radius-sm);
          overflow:hidden;background:var(--bg-3);
          display:flex;align-items:center;justify-content:center;
          box-shadow:var(--shadow);
        "></div>
        <div style="flex:1;min-width:0;padding-top:4px;">
          <div id="cgPopupTitle" class="cg-popup-title" style="font-family:'Oswald',var(--sans);font-weight:600;line-height:1.15;color:var(--text);"></div>
          <div id="cgPopupTags" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>
          <div id="cgPopupDateRow" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>
          <div id="cgPopupMetaRow" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px;"></div>
          <div id="cgPopupInfo" style="margin-top:4px;"></div>
        </div>
        <!-- Score box sits beside poster/title on wide layouts (order:3,
             before description's order:4). A container query below
             swaps this once the CARD ITSELF gets too narrow to fit
             them side by side — tied to the popup's actual width, not
             the browser viewport, so it can't drift out of sync with
             the real wrap point the way a viewport media query would. -->
        <div id="cgPopupDesc" class="fd-description cg-desc-block" style="margin:16px 0 0;"></div>
        <div id="cgPopupScoreBox" class="cg-score-box" style="
          flex-shrink:0;flex-grow:0;text-align:center;align-self:stretch;position:relative;
          padding:18px 20px;border-radius:var(--radius-sm);
          background:transparent;border:2px solid var(--olive);
        ">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:100%;">
            <div id="cgPopupScoreLbl" style="font-family:'Oswald',var(--sans);font-weight:600;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-3);margin-bottom:8px;text-align:center;width:100%;">Overall Score</div>
            <div id="cgPopupScoreVal" style="font-family:var(--bebas);font-size:48px;color:var(--olive);line-height:1;display:flex;align-items:center;justify-content:center;width:100%;gap:6px;"></div>
          </div>
        </div>
        <button class="cg-close-btn" onclick="closeGridPopup()" style="
          background:none;border:none;color:var(--text-3);cursor:pointer;
          font-size:22px;line-height:1;flex-shrink:0;
          transition:color .15s;
          position:absolute;z-index:1;
        " onmouseenter="this.style.color='var(--text)'" onmouseleave="this.style.color='var(--text-3)'">✕</button>
      </div>
      <!-- ratings body -->
      <div id="cgPopupBody" style="padding:20px 24px 6px;"></div>
      <!-- comments button -->
      <div style="padding:0 20px 12px;">
        <button id="cgPopupCcBtn" class="cc-strip" style="margin-top:4px;" onclick="openCommentsPopup(_cgPopupEntryId)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="cgPopupCcLabel">Comments</span>
        </button>
      </div>
      <!-- Action buttons -->
      <div id="cgPopupActions" style="display:flex;gap:8px;padding:4px 24px 24px;flex-wrap:wrap;">
        <button class="popup-action-btn" onclick="goToDetail(_cgPopupEntryId,currentFile())">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
        <button class="popup-action-btn" onclick="openFavListsPopup(_cgPopupEntryId)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          Add to Favorites
        </button>
        <button class="popup-action-btn" onclick="rewatchEntry(_cgPopupEntryId)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
          Rewatch
        </button>
        <button class="popup-action-btn" onclick="createShareCard(_cgPopupEntryId)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          Create Card
        </button>
        <button class="popup-action-btn" id="cgPopupDiscoverBtn" style="display:none;" onclick="createShareCard(_cgPopupEntryId, 3, true)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          Discover Card
        </button>
        <button class="popup-action-btn popup-action-danger" onclick="_cgPopupDeleteEntry()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete
        </button>
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) closeGridPopup(); });
  document.body.appendChild(el);
}

let _cgPopupEntryId = null;

function _cgSetupNarrowObserver() {
  const card = document.getElementById('cgPopupCard');
  if (!card || card._cgObserverAttached) return;
  card._cgObserverAttached = true;
  const apply = () => card.classList.toggle('cg-narrow', card.getBoundingClientRect().width <= 600);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(apply).observe(card);
  } else {
    // Fallback for browsers without ResizeObserver — check on window
    // resize instead, which covers the common case (popup width tracks
    // viewport width) even if it misses some resizing edge cases.
    window.addEventListener('resize', apply);
  }
  apply();
}

function openGridPopup(id) {
  _injectGridPopup();
  _cgSetupNarrowObserver();
  const e = _catAll.find(en => en.id === id);
  if (!e) return;
  _cgPopupEntryId = id;

  // Poster
  document.getElementById('cgPopupPoster').innerHTML = posterHTML(e);
  // Title — year uses Bebas Neue, distinct from the title's own Oswald.
  const _pyEsc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const _pyIsMovie = e.cat==='movies'||e.ratings?._media_type==='movie';
  const _pyStart = e.year || null;
  const _pyEnd = e.ratings?._completion_year || null;
  let _pyStr = '';
  if (_pyStart) {
    if (_pyIsMovie || String(_pyEnd) === String(_pyStart)) _pyStr = ` <span style="font-family:var(--bebas);font-size:0.65em;font-weight:400;color:var(--text-2);vertical-align:middle;">${_pyStart}</span>`;
    else _pyStr = ` <span style="font-family:var(--bebas);font-size:0.65em;font-weight:400;color:var(--text-2);vertical-align:middle;">${_pyStart}\u2013${_pyEnd||'Present'}</span>`;
  }
  document.getElementById('cgPopupTitle').innerHTML = _pyEsc(e.title) + _pyStr;

  // Category label uses the real Movie/TV type-badge colors; genres
  // keep the solid olive treatment.
  const catLabel = CAT_META[e.cat]?.label;
  const catIsMovie = e.cat === 'movies' || e.ratings?._media_type === 'movie';
  const catLabelHTML = catLabel ? `<span class="${catIsMovie ? 'type-label' : 'type-label type-label-tv'}" style="font-family:'Manrope',var(--sans);font-weight:500;">${_pyEsc(catLabel)}</span>` : '';
  const genreTags = (e.genres || []);
  document.getElementById('cgPopupTags').innerHTML =
    catLabelHTML +
    genreTags.map(t => `<span class="w-ep-badge" style="font-family:'Manrope',var(--sans);font-weight:500;">${_pyEsc(String(t))}</span>`).join('') +
    (typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : '');

  // Date Completed — same green pill as genres, text in Bebas Neue —
  // sits under genres, with the ep/runtime badge under that.
  const completedDateStr = e.completed_date
    ? new Date(e.completed_date + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  document.getElementById('cgPopupDateRow').innerHTML = completedDateStr
    ? `<span class="w-ep-badge" style="font-family:'Manrope',var(--sans);font-weight:500;">Completed On: ${completedDateStr}</span>`
    : '';

  // Ep/runtime badge sits under the date-completed badge.
  const metaRowEl = document.getElementById('cgPopupMetaRow');
  metaRowEl.innerHTML = _entryMetaBadgeOnly(e);

  // Description now sits in the header's info column, right under the
  // tags/meta rows and next to the poster — not spanning the full
  // width below the poster — matching the shareable card's layout.
  const descEl = document.getElementById('cgPopupDesc');
  if (descEl) {
    descEl.textContent = e.description || '';
    descEl.style.display = e.description ? '' : 'none';
  }

  // Score
  const score = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
  // Prominent score box next to the poster/title — matches the "OVERALL
  // SCORE" placement used in the shareable card, instead of only
  // showing the final score buried at the end of the ratings breakdown.
  const scoreBoxEl = document.getElementById('cgPopupScoreBox');
  const scoreValEl = document.getElementById('cgPopupScoreVal');
  if (scoreBoxEl) scoreBoxEl.style.display = score != null ? '' : 'none';
  if (scoreValEl) scoreValEl.textContent = score != null ? `★ ${score}` : '';
  // Info bar (season breakdown / runtime) now renders inside the body, above the ratings
  const _infoEl = document.getElementById('cgPopupInfo');
  if (_infoEl) _infoEl.innerHTML = '';
  // Ratings body
  document.getElementById('cgPopupBody').innerHTML = _buildCgDetail(e);


  // Context-aware action buttons
  const actionsEl = document.getElementById('cgPopupActions');
  if (actionsEl) {
    const alreadyWatching = e.status === 'watching' || e.status === 'paused';
    const btns = actionsEl.querySelectorAll('.popup-action-btn');
    if (btns[2]) btns[2].style.display = alreadyWatching ? 'none' : '';
    const discBtn = document.getElementById('cgPopupDiscoverBtn');
    if (discBtn) discBtn.style.display = (e.status !== 'completed' && e.status !== 'ongoing') ? '' : 'none';
  }

  // Show overlay
  const ov = document.getElementById('cgPopupOverlay');
  ov.style.pointerEvents = 'auto';
  ov.style.opacity = '1';
  document.getElementById('cgPopupCard').style.transform = 'translateY(0)';
  document.body.style.overflow = 'hidden';
}

function closeGridPopup() {
  const ov = document.getElementById('cgPopupOverlay');
  if (!ov) return;
  ov.style.opacity = '0';
  document.getElementById('cgPopupCard').style.transform = 'translateY(18px)';
  ov.style.pointerEvents = 'none';
  document.body.style.overflow = '';
  _cgPopupEntryId = null;
}

/* ════════ COMMENTS POPUP (dedicated modal) ════════ */
function _injectCommentsPopup() {
  if (document.getElementById('commentsPopupOverlay')) return;
  const el = document.createElement('div');
  el.id = 'commentsPopupOverlay';
  el.style.cssText = `
    position:fixed;inset:0;z-index:901;
    background:rgba(0,0,0,0.72);
    display:flex;align-items:center;justify-content:center;
    padding:16px;box-sizing:border-box;
    opacity:0;transition:opacity 220ms var(--ease);
    pointer-events:none;
  `;
  el.innerHTML = `
    <div id="commentsPopupCard" style="
      background:var(--bg-2);border:1.5px solid var(--olive-light);
      box-shadow:4px 4px 0 var(--olive);border-radius:var(--radius-lg);
      width:100%;max-width:640px;max-height:90dvh;overflow-y:auto;overscroll-behavior-y:contain;
      position:relative;box-sizing:border-box;
      display:flex;flex-direction:column;
      transform:translateY(18px);transition:transform 260ms var(--ease);
    ">
      <!-- header -->
      <div id="commentsPopupHeader" style="
        display:flex;align-items:flex-start;gap:16px;
        padding:20px;border-bottom:0.5px solid var(--border);
        flex-shrink:0;
      ">
        <div id="commentsPopupPoster" style="
          width:56px;height:76px;flex-shrink:0;border-radius:var(--radius-sm);
          overflow:hidden;background:var(--bg-3);
          display:flex;align-items:center;justify-content:center;
          box-shadow:var(--shadow);
        "></div>
        <div style="flex:1;min-width:0;">
          <div id="commentsPopupTitle" style="font-family:var(--serif);font-size:18px;font-weight:300;line-height:1.2;margin-bottom:4px;color:var(--text)"></div>
          <div id="commentsPopupMeta" style="font-size:11px;color:var(--text-3);margin-bottom:6px;display:flex;flex-wrap:wrap;gap:4px;"></div>
          <div id="commentsPopupCount" style="font-size:12px;color:var(--olive-light);font-weight:500;"></div>
        </div>
        <button onclick="closeCommentsPopup()" style="
          background:none;border:none;color:var(--text-3);cursor:pointer;
          font-size:22px;line-height:1;padding:0;flex-shrink:0;
          transition:color .15s;
        " onmouseenter="this.style.color='var(--text)'" onmouseleave="this.style.color='var(--text-3)'">✕</button>
      </div>
      <!-- comments body -->
      <div id="commentsPopupBody" style="flex:1;overflow-y:auto;overscroll-behavior-y:contain;padding:16px 20px;min-height:0;">
        <div style="font-size:12px;color:var(--text-3);text-align:center;padding:20px 0;">Loading…</div>
      </div>
      <!-- comment input -->
      <div style="padding:16px 20px;border-top:0.5px solid var(--border);flex-shrink:0;">
        <div class="cc-form">
          <input class="cc-input" id="commentsPopupInput" placeholder="Write a comment…"
                 onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();postCommentToPopup()}">
          <button class="cc-send" onclick="postCommentToPopup()">Send</button>
        </div>
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) closeCommentsPopup(); });
  document.body.appendChild(el);
}

let _commentsPopupEntryId = null;

function openCommentsPopup(entryId) {
  _injectCommentsPopup();
  _commentsPopupEntryId = entryId;
  const e = _catAll.find(en => en.id === entryId);
  if (!e) return;

  // Header info
  document.getElementById('commentsPopupPoster').innerHTML = posterHTML(e);
  document.getElementById('commentsPopupTitle').textContent = e.title;
  const meta = [CAT_META[e.cat]?.label, ...(e.genres||[]).slice(0,2)].filter(Boolean);
  document.getElementById('commentsPopupMeta').innerHTML = meta.map(m =>
    `<span style="background:var(--olive-faint);border:0.5px solid var(--border-olive);color:var(--olive-light);border-radius:12px;padding:1px 6px;font-size:9px;letter-spacing:.3px">${m}</span>`
  ).join('');

  // Input reset
  document.getElementById('commentsPopupInput').value = '';

  // Load comments
  loadCommentsPopupComments(entryId);

  // Show overlay
  const ov = document.getElementById('commentsPopupOverlay');
  ov.style.pointerEvents = 'auto';
  ov.style.opacity = '1';
  document.getElementById('commentsPopupCard').style.transform = 'translateY(0)';
  document.body.style.overflow = 'hidden';
}

function closeCommentsPopup() {
  const ov = document.getElementById('commentsPopupOverlay');
  if (!ov) return;
  ov.style.opacity = '0';
  document.getElementById('commentsPopupCard').style.transform = 'translateY(18px)';
  ov.style.pointerEvents = 'none';
  document.body.style.overflow = '';
  _commentsPopupEntryId = null;
}

async function loadCommentsPopupComments(entryId) {
  const body = document.getElementById('commentsPopupBody');
  const count = document.getElementById('commentsPopupCount');
  if (!body) return;

  try {
    const comments = await getComments(entryId);
    const me = (await getCurrentUser())?.id;

    if (!comments.length) {
      body.innerHTML = '<div style="font-size:12px;color:var(--text-3);text-align:center;padding:20px 0;">No comments yet.</div>';
      if (count) count.textContent = 'Comments';
      return;
    }

    const topLevel2 = comments.filter(c => !c.reply_to);
    const replies2  = comments.filter(c => c.reply_to);
    body.innerHTML = topLevel2.map(c => {
      const uname2 = _ccEsc(c.profiles?.username || 'Unknown');
      const date = new Date(c.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
      const reps2 = replies2.filter(r => r.reply_to === c.id);
      const repHTML2 = reps2.map(r => {
        const runame2 = _ccEsc(r.profiles?.username || 'Unknown');
        const rdate2  = new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
        return `<div class="det-reply-item" id="cmpop-${r.id}">
          <div class="det-reply-author" style="color:var(--olive-light);">@${runame2}</div>
          <div class="det-reply-text">${_ccMention(r.content)}</div>
          <div class="det-reply-meta"><span>${rdate2}</span>
            ${r.author_id === me ? `<button class="cc-del" onclick="deleteCommentFromPopup('${r.id}','${entryId}')">delete</button>` : ''}
          </div>
        </div>`;
      }).join('');
      return `<div class="cc-comment" id="cmpop-${c.id}">
        <div class="cc-comment-body">
          <div class="cc-author">@${uname2}</div>
          <div class="cc-text">${_ccMention(c.content)}</div>
          <div class="cc-meta">
            <span>${date}</span>
            <button class="cc-reply-btn" onclick="popReply('${c.id}','${uname2}','${entryId}')">Reply</button>
            ${c.author_id === me ? `<button class="cc-del" onclick="deleteCommentFromPopup('${c.id}','${entryId}')">delete</button>` : ''}
          </div>
          ${repHTML2}
          <div id="pop-reply-form-${c.id}"></div>
        </div>
      </div>`;
    }).join('');

    if (count) count.textContent = `${comments.length} comment${comments.length!==1?'s':''}`;
  } catch(e) {
    showToast('Could not load comments.', 'err');
  }
}

async function postCommentToPopup() {
  const input = document.getElementById('commentsPopupInput');
  const content = input.value.trim();
  if (!content || !_commentsPopupEntryId) return;

  try {
    input.disabled = true;
    await addComment(_commentsPopupEntryId, content);
    input.value = '';
    await loadCommentsPopupComments(_commentsPopupEntryId);
  } catch(e) {
    showToast('Could not post comment.', 'err');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

let _popReplyFor = null;
function popReply(commentId, username, entryId) {
  if (_popReplyFor) { const _prEl = document.getElementById('pop-reply-form-' + _popReplyFor); if(_prEl) _prEl.innerHTML = ''; }
  if (_popReplyFor === commentId) { _popReplyFor = null; return; }
  _popReplyFor = commentId;
  const box = document.getElementById('pop-reply-form-' + commentId);
  if (!box) return;
  box.innerHTML = `<div class="det-reply-form">
    <input class="det-reply-input" id="pop-ri-${commentId}" value="@${username} " placeholder="Reply…"
      onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();popPostReply('${commentId}','${entryId}')}">
    <button class="det-reply-send" onclick="popPostReply('${commentId}','${entryId}')">Send</button>
    <button class="det-comment-del" onclick="document.getElementById('pop-reply-form-${commentId}').innerHTML='';_popReplyFor=null" style="margin-left:4px;">✕</button>
  </div>`;
  setTimeout(() => document.getElementById('pop-ri-' + commentId)?.focus(), 50);
}
async function popPostReply(commentId, entryId) {
  const input = document.getElementById('pop-ri-' + commentId);
  const content = input?.value?.trim();
  if (!content) return;
  input.disabled = true;
  try {
    await addComment(entryId, content, commentId);
    document.getElementById('pop-reply-form-' + commentId).innerHTML = '';
    _popReplyFor = null;
    await loadCommentsPopupComments(entryId);
  } catch(e) { showToast('Could not post reply.', 'err'); if (input) input.disabled = false; }
}

async function deleteCommentFromPopup(commentId, entryId) {
  if (!confirm('Delete this comment?')) return;
  try {
    await deleteComment(commentId);
    await loadCommentsPopupComments(entryId);
  } catch(e) {
    showToast('Could not delete comment.', 'err');
  }
}

/* Old inline comment functions removed — comments now use dedicated popup modal */

// Close popup on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('ratingFilterOverlay')?.classList.contains('open')) {
      closeRatingFilter();
    } else if (document.getElementById('catDiscoverOverlay')?.classList.contains('open')) {
      _closeDiscoverPicker();
    } else if (document.getElementById('profInfoOverlay')?.classList.contains('open')) {
      closeCatInfoPopup();
    } else if (document.getElementById('createCardOverlay')?.classList.contains('open')) {
      closeCreateCard();
    } else if (document.getElementById('favListsOverlay')?.classList.contains('open')) {
      closeFavListsPopup();
    } else if (document.getElementById('commentsPopupOverlay')?.style.opacity === '1') {
      closeCommentsPopup();
    } else if (document.getElementById('cgPopupOverlay')?.style.opacity === '1') {
      closeGridPopup();
    }
  }
});

/* Grid-mode completed detail toggle (legacy inline panels — no longer used in grid, kept for safety) */
let _cgDetailId = null;
function toggleCompGrid(id) {
  openGridPopup(id);
}



function _cgBreakdownHTML(e) {
  const isMovieEntry = e.cat === 'movies' || e.ratings?._media_type === 'movie';
  if (!isMovieEntry) {
    const bd = Array.isArray(e.ratings?._season_breakdown)
      ? e.ratings._season_breakdown.filter(n=>parseInt(n)>0).map(Number) : [];
    const totalS = bd.length || Number(e.total_seasons) || 0;
    if (totalS > 0) {
      let chips = '';
      for (let i=0; i<totalS; i++) {
        const eps = bd[i] || null;
        chips += `<span class="popup-info-season-chip">
          <span class="popup-info-season-num">${i+1}</span>
          <span class="popup-info-season-eps">${eps?eps+' ep':'S'+(i+1)}</span>
        </span>`;
      }
      return `<div class="popup-info-block"><div class="popup-info-label">Seasons</div><div style="display:flex;flex-wrap:wrap;">${chips}</div></div>`;
    } else if (e.total_eps) {
      return `<div class="popup-info-block"><span class="popup-info-season-eps" style="font-size:11px;">${e.total_eps} episodes</span></div>`;
    }
    return '';
  } else {
    const rtH=Number(e.runtime_h)||0, rtM=Number(e.runtime_m)||0;
    if (rtH||rtM) {
      const rtStr = rtH ? rtH+'h '+rtM+'m' : rtM+'m';
      return `<div class="popup-info-block"><span class="popup-info-runtime">
        <span class="popup-info-runtime-val">${rtStr}</span>
        <span class="popup-info-runtime-lbl">Runtime</span>
      </span></div>`;
    }
    return '';
  }
}

function _buildCgDetail(e) {
  const isMovies = e.cat === 'movies';
  const esc      = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const { core: coreArr, bonus: bonusArr } = getRatings(e.cat);
  const isAnimated = e.cat === 'anime' || e.cat === 'cartoons';

  const coreRows = coreArr.map(r => {
    const val = e.ratings?.[r.key];
    if (val == null || val === '') return '';
    return `<div class="fd-rating-row"><span class="fd-rating-label">${r.label}</span><span class="fd-rating-val">${Number(val).toFixed(2)}</span></div>`;
  }).filter(Boolean).join('');

  const animRow = (!isAnimated && e.ratings?.animation != null && e.ratings?.animation !== '')
    ? `<div class="fd-rating-row"><span class="fd-rating-label">Animation Quality</span><span class="fd-rating-val">${Number(e.ratings.animation).toFixed(2)}</span></div>` : '';

  const bonusRows = bonusArr.map(r => {
    const val = e.ratings?.[r.key];
    if (val == null || val === '') return '';
    return `<div class="fd-rating-row"><span class="fd-rating-label">${r.label}</span><span class="fd-rating-val">${Number(val).toFixed(2)}</span></div>`;
  }).filter(Boolean).join('');

  const favs = e.ratings?._favorites || {};
  const favChips = [
    favs.character ? `<span class="fav-chip"><span class="fav-chip-label">Fav Character</span><span class="fav-chip-val">${esc(favs.character)}</span></span>` : '',
    (!isMovies && favs.episode) ? `<span class="fav-chip"><span class="fav-chip-label">Fav Episode</span><span class="fav-chip-val">${esc(favs.episode)}</span></span>` : '',
    (!isMovies && favs.season)  ? `<span class="fav-chip"><span class="fav-chip-label">Fav Season</span><span class="fav-chip-val">${esc(favs.season)}</span></span>` : '',
  ].filter(Boolean).join('');
  const lows = e.ratings?._lowlights || e.ratings?._favorites?._lowlights || {};
  const lowChips = [
    lows.character ? `<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Character</span><span class="fav-chip-val">${esc(lows.character)}</span></span>` : '',
    (!isMovies && lows.episode) ? `<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Episode</span><span class="fav-chip-val">${esc(lows.episode)}</span></span>` : '',
    (!isMovies && lows.season)  ? `<span class="fav-chip low-chip"><span class="fav-chip-label">Least Fav Season</span><span class="fav-chip-val">${esc(lows.season)}</span></span>` : '',
  ].filter(Boolean).join('');

  return `${_cgBreakdownHTML(e)}
  <div class="fd-cols">
    ${(coreRows||animRow) ? `<div class="fd-col"><div class="fd-section-hd">Core Ratings</div>${coreRows}${animRow}</div>` : ''}
    ${bonusRows ? `<div class="fd-col"><div class="fd-section-hd">Bonus Ratings</div>${bonusRows}</div>` : ''}
  </div>
  ${(favChips || lowChips) ? `<div class="fd-section-hd" style="margin-top:16px;">Highlights</div>` : ''}
  ${favChips ? `<div class="fav-chips" style="margin-top:6px;">${favChips}</div>` : ''}
  ${lowChips ? `<div class="fav-chips" style="margin-top:6px;">${lowChips}</div>` : ''}
  ${e.notes ? `<div class="fd-section-hd" style="margin-top:16px;">Notes</div><div class="fd-notes" style="margin-top:0;padding-top:0;border-top:none;">"${esc(e.notes)}"</div>` : ''}`;
}

function renderCompletedGrid(items, sectionKey = 'completed') {
  const isRanked    = _sort[sectionKey] === 'highest' || _sort[sectionKey] === 'lowest';
  const curSort     = _sort[sectionKey] || '';
  const ratingKey   = curSort.startsWith('rating:') ? curSort.slice(7) : null;
  const gid = `wg-${sectionKey}`;
  const cards = items.map((e, i) => {
    const score = liveScore(e) != null ? Number(liveScore(e)).toFixed(2) : null;
    const date  = e.completed_date ? new Date(e.completed_date + 'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}) : '';
    const isMc  = e.cat === 'movies' || (e.ratings && e.ratings._media_type === 'movie');
    const typeClsC = (isMc ? 'type-label' : 'type-label type-label-tv') + ' type-label-overlay-bottom';
    return `<div class="wg-card cg-card-wrap" style="cursor:pointer;">
      <div class="wg-poster" onclick="openGridPopup('${e.id}')" style="position:relative;">
        ${posterHTML(e,'big')}
        ${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? '<div class="rewatch-card-icon"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>'+getRewatchCount(e)+'</div>' : ''}
        ${ratingKey ? _cgRatingBadge(e, ratingKey) : (isRanked ? _cgBadge(i+1) : '')}
        ${SHOW_TYPE_TAG() ? `<span class="${typeClsC}">${isMc ? 'Movie' : 'TV Show'}</span>` : ''}
      </div>
      <div class="cg-grid-info" onclick="openGridPopup('${e.id}')">
        <div class="title-year-row">
          <div class="wg-title">${e.title}</div>
          ${e.year ? `<span class="title-year-inline">${e.year}</span>` : ''}
        </div>
        ${e.status === 'ongoing' ? _ongoingMeta(e) : _entryMeta(e)}
        <div class="cg-score-row"><span class="cg-score">${score != null ? `★ ${score}` : '—'}</span></div>
      </div>
      <div onclick="event.stopPropagation()" style="padding:0 10px 10px;display:flex;flex-direction:column;gap:4px;">
        ${e.status === 'ongoing' ? `<button class="continue-btn" onclick="continueWatching('${e.id}')">Continue</button>` : ''}
        <button class="cc-strip" style="margin-top:0;" onclick="openGridPopupToComments('${e.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Comments</span>
        </button>
      </div>
    </div>`;
  }).join('');

  return _navWrap(gid, `<div class="watching-grid" id="${gid}">${cards}</div>`);
}

/* Open comments popup directly */
function openGridPopupToComments(id) {
  openCommentsPopup(id);
}

async function adjustEp(id, delta) {
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

  if (!justFinished) {
    try {
      await updateProgress(id, _catUser.id, { watched: newWatched, episode: newEp, season: newSeason });
      entry.watched = newWatched;
      entry.episode = newEp;
      entry.season  = newSeason;
      const watching = _catAll.filter(e => e.status === 'watching' || e.status === 'paused').sort((a,b) => (a.status==='paused')-(b.status==='paused'));
      const inner = document.querySelector('#body-watching .accordion-inner');
      if (inner) { inner.innerHTML = sortBar('watching') + buildWatching(watching); if (typeof fitTitleYear === 'function') fitTitleYear(inner); }
      showToast('Progress updated');
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
    _showRateNowPopup(entry.title, id);
  } catch(e) {
    showToast('Error marking complete.', 'err');
  }
}

function _showRateNowPopup(title, id) {
  let overlay = document.getElementById('_rateNowOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_rateNowOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:950;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--bg-3);border:1.5px solid var(--olive-light);box-shadow:4px 4px 0 var(--olive);border-radius:var(--radius-lg);padding:2rem 1.75rem;max-width:400px;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--olive-faint);border:1.5px solid var(--border-olive);display:flex;align-items:center;justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--olive-light)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
        </div>
        <div id="_rateNowTitle" style="font-family:var(--serif);font-size:26px;font-weight:300;color:var(--text);"></div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.6;max-width:260px;">Add your ratings to rank it in your collection.</div>
        <div style="display:flex;flex-direction:column;gap:10px;width:100%;margin-top:4px;">
          <button id="_rateNowBtn" style="width:100%;padding:12px;background:var(--olive);border:1.5px solid var(--olive-light);box-shadow:3px 3px 0 var(--olive-2);border-radius:var(--radius-sm);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--sans);">Rate Now</button>
          <button onclick="document.getElementById('_rateNowOverlay').remove()" style="width:100%;padding:11px;background:transparent;border:1.5px solid var(--border-2);box-shadow:2px 2px 0 var(--border-2);border-radius:var(--radius-sm);color:var(--text-2);font-size:14px;font-weight:500;cursor:pointer;font-family:var(--sans);">Later</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('_rateNowTitle').textContent = `Finished "${title}"`;
  document.getElementById('_rateNowBtn').onclick = () => {
    overlay.remove();
    sessionStorage.setItem('detailId', id);
    sessionStorage.setItem('detailFrom', currentFile());
    window.location.href = 'detail.html';
  };
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function showFinishedBanner(entry) {
  // Remove any existing banner
  document.getElementById('finishedBanner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'finishedBanner';
  banner.style.cssText = `
    position:fixed;bottom:88px;left:50%;transform:translateX(-50%);
    background:var(--bg-3);border:1.5px solid var(--olive-light);box-shadow:3px 3px 0 var(--olive);
    border-radius:var(--radius);padding:14px 20px;z-index:800;
    display:flex;align-items:center;gap:14px;white-space:nowrap;
    animation:slideUp .25s var(--ease);
  `;
  banner.innerHTML = `
    <div>
      <div style="font-size:14px;font-weight:600;color:var(--text)">Finished "${entry.title}"!</div>
      <div style="font-size:12px;color:var(--text-2);margin-top:2px">Mark as watched and add ratings?</div>
    </div>
    <button onclick="goToDetail('${entry.id}','${currentFile()}')" style="
      padding:8px 16px;background:var(--olive);border:1.5px solid var(--olive-light);
      box-shadow:2px 2px 0 var(--olive-2);border-radius:var(--radius-sm);
      color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;
    ">Rate &amp; Complete →</button>
    <button onclick="this.closest('#finishedBanner').remove()" style="
      padding:8px;background:transparent;border:none;color:var(--text-3);cursor:pointer;font-size:18px;
    ">✕</button>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 8000);
}

/* ════════ PAUSED ════════ */
function buildPaused(items) {
  if (!items.length) return `<div class="empty"><div class="empty-icon" style="opacity:.35">${icon('pause',40)}</div><div class="empty-text">Nothing on pause.</div></div>`;
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
        <div class="w-top"><div class="w-title">${e.title}${e.year ? `<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);margin-left:8px;">${e.year}</span>` : ''}</div></div>
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
    await updateProgress(id, _catUser.id, { status: 'watching' });
    const entry = _catAll.find(e => e.id === id);
    if (entry) entry.status = 'watching';
    renderSections();
    showToast('Resumed!');
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
  if (!items.length) return `<div class="empty"><div class="empty-icon" style="opacity:.35">${icon('bookmark',40)}</div><div class="empty-text">Your watchlist is empty.</div></div>`;
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
        <div class="w-top"><div class="w-title">${e.title}${e.year ? `<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);margin-left:8px;">${e.year}</span>` : ''}</div></div>
        <div class="w-ep-row">${_badge}${scope ? `<span class="w-ep-badge">${scope}</span>` : ''}</div>
      </div>
      <div style="display:flex;align-items:center;flex-shrink:0;" onclick="event.stopPropagation()">
        <button onclick="startWatching('${e.id}')" class="w-list-action-btn w-list-play-btn" title="Start Watching">${icon('play',14)}</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ════════ COMPLETED ════════ */
/* _cgBadge and renderCompletedGrid defined above */

function buildCompleted(items, sectionKey = 'completed') {
  if (!items.length) return `<div class="empty"><div class="empty-icon" style="opacity:.35">${icon('trophy',40)}</div><div class="empty-text">Nothing here yet.</div></div>`;
  return getView(sectionKey) === 'grid' ? renderCompletedGrid(items, sectionKey) : renderCompletedList(items, sectionKey);
}

function renderCompletedList(sorted, sectionKey = 'completed') {
  const isRanked  = _sort[sectionKey] === 'highest' || _sort[sectionKey] === 'lowest';
  const curSort   = _sort[sectionKey] || '';
  const ratingKey = curSort.startsWith('rating:') ? curSort.slice(7) : null;
  return `<div class="completed-list">${sorted.map((e, i) => {
    const date  = e.completed_date ? new Date(e.completed_date + 'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}) : '';
    const score = e.final_score != null ? Number(liveScore(e)).toFixed(2) : null;
    const _ctx = catContext();
    const _badge = _ctx ? getTypeBadge(e, _ctx) : '';
    return `<div class="cc-block">
      <div class="comp-row" style="cursor:pointer;" onclick="openGridPopup('${e.id}')">
        ${isRanked ? `<div style="font-family:var(--bebas);font-size:28px;font-weight:400;color:${i<3?'var(--olive-light)':'var(--text-2)'};text-align:center;min-width:44px;flex-shrink:0;">${i+1}</div>` : ''}
        <div class="comp-poster" style="position:relative;">${posterHTML(e)}${ratingKey ? _cgRatingBadge(e, ratingKey) : ''}</div>
        <div class="comp-info">
          <div class="comp-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">${e.title}${e.year ? `<span style="font-family:var(--bebas);font-size:18px;font-weight:400;color:var(--text-3);">${e.year}</span>` : ''}${typeof rewatchBadgeHTML === 'function' && getRewatchCount(e) > 1 ? rewatchBadgeHTML(e) : ''}</div>
          <div class="comp-meta">${_badge}</div>
          ${e.status === 'ongoing' ? _ongoingMeta(e) : _entryMeta(e)}
          ${e.notes ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px;font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">"${e.notes}"</div>` : ''}
          ${renderFavChips(e.ratings, e.cat)}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;" onclick="event.stopPropagation()">
          <div style="font-family:var(--bebas);color:var(--olive-light);font-size:clamp(17px, 3.8vw, 19px);font-weight:400;">${score != null ? `★ ${score}` : '—'}</div>
          ${e.status === 'ongoing' ? `<button class="w-list-action-btn w-list-play-btn" onclick="continueWatching('${e.id}')" title="Continue">${icon('play',14)}</button>` : ''}
        </div>
      </div>
      <button class="cc-strip" style="margin-top:0;" onclick="event.stopPropagation();openGridPopupToComments('${e.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Comments</span>
      </button>
    </div>`;
  }).join('')}</div>`;
}

/* ── Continue Watching (from Ongoing) ── */
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
    overlay.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--bg-3);border:1.5px solid var(--olive-light);box-shadow:4px 4px 0 var(--olive);border-radius:var(--radius-lg);padding:2rem 1.75rem;max-width:360px;width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--olive-faint);border:1.5px solid var(--border-olive);display:flex;align-items:center;justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--olive-light)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
        </div>
        <div style="font-family:var(--serif);font-size:28px;font-weight:300;color:var(--text);" id="_finishTitle">Finished!</div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.6;max-width:260px;">Is the show fully finished, or are there more seasons coming?</div>
        <div style="display:flex;flex-direction:column;gap:8px;width:100%;margin-top:6px;">
          <button onclick="chooseFinishStatus('completed')" style="width:100%;padding:12px;background:var(--olive);border:1.5px solid var(--olive-light);box-shadow:3px 3px 0 var(--olive-2);border-radius:var(--radius-sm);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--sans);">
            ✓ Watched<div style="font-size:11px;font-weight:400;opacity:.75;margin-top:2px;">The show has ended</div>
          </button>
          <button onclick="chooseFinishStatus('ongoing')" style="width:100%;padding:11px;background:transparent;border:1.5px solid var(--border-2);box-shadow:2px 2px 0 var(--border-2);border-radius:var(--radius-sm);color:var(--text-2);font-size:13px;font-weight:500;cursor:pointer;font-family:var(--sans);">
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
  _showRateNowPopup(entry.title, id);
}

function renderFavChips(ratings, cat) {
  if (!ratings || !ratings._favorites) return '';
  const favs = ratings._favorites;
  const isMovies = cat === 'movies';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  
  const chips = [
    favs.character ? `<span class="fav-chip"><span class="fav-chip-label">Fav Character</span><span class="fav-chip-val">${esc(favs.character)}</span></span>` : '',
    (!isMovies && favs.episode) ? `<span class="fav-chip"><span class="fav-chip-label">Fav Episode</span><span class="fav-chip-val">${esc(favs.episode)}</span></span>` : '',
    (!isMovies && favs.season)  ? `<span class="fav-chip"><span class="fav-chip-label">Fav Season</span><span class="fav-chip-val">${esc(favs.season)}</span></span>` : '',
  ].filter(Boolean).join('');

  return chips ? `<div class="fav-chips" style="margin-top:8px;">${chips}</div>` : '';
}

/* ════════ Completed entry comments ════════ */
const _ccLoaded = new Set();

function _ccEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _ccMention(s) { return _ccEsc(s).replace(/(@[\w]+)/g,'<span style="color:var(--olive-light);font-weight:600">$1</span>'); }

async function ccToggle(entryId, btn) {
  const panel = document.getElementById('cp-' + entryId);
  if (!panel) return;
  const isOpen = panel.style.display === 'block';
  panel.style.display = isOpen ? 'none' : 'block';
  btn.classList.toggle('open', !isOpen);
  if (!isOpen && !_ccLoaded.has(entryId)) await ccLoad(entryId);
}

async function ccLoad(entryId) {
  const list    = document.getElementById('cl-' + entryId);
  const counter = document.getElementById('cc-' + entryId);
  if (!list) return;
  _ccLoaded.add(entryId);
  const comments = await getComments(entryId);
  const me = _catUser?.id;

  if (!comments.length) {
    list.innerHTML = '<div class="cc-none">No comments yet.</div>';
    if (counter) counter.textContent = 'Comments';
    return;
  }

  const topLevel = comments.filter(c => !c.reply_to);
  const replies  = comments.filter(c => c.reply_to);
  list.innerHTML = topLevel.map(c => {
    const uname  = _ccEsc(c.profiles?.username || 'Unknown');

    const reps = replies.filter(r => r.reply_to === c.id);
    const repHTML = reps.map(r => {
      const runame = _ccEsc(r.profiles?.username || 'Unknown');
      const rdate  = new Date(r.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      return `<div class="det-reply-item" id="cm-${r.id}">
        <div class="det-reply-author" style="color:var(--olive-light);">@${runame}</div>
        <div class="det-reply-text">${_ccMention(r.content)}</div>
        <div class="det-reply-meta"><span>${rdate}</span>
          ${r.author_id === me ? `<button class="cc-del" onclick="ccDel('${r.id}','${entryId}')">delete</button>` : ''}
        </div>
      </div>`;
    }).join('');
    return `<div class="cc-comment" id="cm-${c.id}">
      <div class="cc-comment-body">
        <div class="cc-author">@${uname}</div>
        <div class="cc-text">${_ccMention(c.content)}</div>
        <div class="cc-meta">
          ${new Date(c.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
          <button class="cc-reply-btn" onclick="ccReply('${c.id}','${entryId}','${uname}')">Reply</button>
          ${c.author_id === me ? `<button class="cc-del" onclick="ccDel('${c.id}','${entryId}')">delete</button>` : ''}
        </div>
        ${repHTML}
        <div id="cc-reply-${c.id}"></div>
      </div>
    </div>`;
  }).join('');

  if (counter) counter.textContent = `${comments.length} comment${comments.length !== 1 ? 's' : ''}`;
}

async function ccPost(entryId) {
  const input   = document.getElementById('ci-' + entryId);
  const content = input?.value?.trim();
  if (!content) return;
  input.disabled = true;
  try {
    await addComment(entryId, content);
    input.value = '';
    _ccLoaded.delete(entryId);
    await ccLoad(entryId);
  } catch(e) {
    showToast('Could not post comment.', 'err');
    console.error(e);
  }
  input.disabled = false;
  input.focus();
}

async function ccDel(commentId, entryId) {
  try {
    await deleteComment(commentId);
    _ccLoaded.delete(entryId);
    await ccLoad(entryId);
  } catch(e) {
    showToast('Could not delete comment.', 'err');
  }
}

let _ccReplyFor = null;
function ccReply(commentId, entryId, username) {
  if (_ccReplyFor === commentId) {
    document.getElementById('cc-reply-' + commentId).innerHTML = '';
    _ccReplyFor = null; return;
  }
  if (_ccReplyFor) document.getElementById('cc-reply-' + _ccReplyFor).innerHTML = '';
  _ccReplyFor = commentId;
  const box = document.getElementById('cc-reply-' + commentId);
  if (!box) return;
  box.innerHTML = `<div class="cc-reply-form">
    <input id="cc-ri-${commentId}" value="@${username} " placeholder="Reply to @${username}…"
           onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ccPostReply('${entryId}','${commentId}')}">
    <button class="cc-send" onclick="ccPostReply('${entryId}','${commentId}')">Reply</button>
  </div>`;
  document.getElementById('cc-ri-' + commentId)?.focus();
}
async function ccPostReply(entryId, commentId) {
  const input = document.getElementById('cc-ri-' + commentId);
  const content = input?.value?.trim();
  if (!content) return;
  input.disabled = true;
  try {
    await addComment(entryId, content, commentId);
    document.getElementById('cc-reply-' + commentId).innerHTML = '';
    _ccReplyFor = null;
    _ccLoaded.delete(entryId);
    await ccLoad(entryId);
  } catch(e) { showToast('Could not post reply.', 'err'); if (input) input.disabled = false; }
}

/* ════════ Loading ════════ */
function showLoading() {
  const sw = document.getElementById('sectionsWrap');
  if (sw) sw.innerHTML = `<div class="page-loading"><div class="spinner"></div></div>`;
}
function hideLoading() {}

/* ════════ QUEUE PICKER ════════ */
let _qpItem = null;

function _injectQPModal() {
  if (document.getElementById('qpOverlay')) return;
  const el = document.createElement('div');
  el.id = 'qpOverlay';
  el.style.cssText = `
    position:fixed;inset:0;z-index:901;
    background:rgba(0,0,0,0.72);
    display:flex;align-items:center;justify-content:center;
    padding:16px;box-sizing:border-box;
    opacity:0;transition:opacity 220ms var(--ease);
    pointer-events:none;
  `;
  el.innerHTML = `
    <div id="qpCard" style="
      background:var(--bg-2);border:1.5px solid var(--olive-light);
      box-shadow:4px 4px 0 var(--olive);border-radius:var(--radius-lg);
      width:100%;max-width:640px;max-height:90dvh;
      position:relative;box-sizing:border-box;
      display:flex;flex-direction:column;
      transform:translateY(18px);transition:transform 260ms var(--ease);
    ">
      <!-- header -->
      <div style="
        display:flex;align-items:flex-start;gap:12px;
        padding:16px 16px 12px;border-bottom:0.5px solid var(--border);
        flex-shrink:0;
      ">
        <div id="qpPoster" style="
          width:48px;height:66px;flex-shrink:0;border-radius:var(--radius-sm);
          overflow:hidden;background:var(--bg-3);
          display:flex;align-items:center;justify-content:center;
          box-shadow:var(--shadow);
        "></div>
        <div style="flex:1;min-width:0;">
          <div id="qpTitle" style="font-family:var(--serif);font-size:17px;font-weight:300;line-height:1.2;margin-bottom:4px;color:var(--text)"></div>
          <div id="qpMeta" style="font-size:10px;color:var(--text-3);margin-bottom:4px;display:flex;flex-wrap:wrap;gap:4px;"></div>
          <div style="font-size:11px;color:var(--olive-light);font-weight:500;">From your watchlist</div>
        </div>
        <button onclick="closeQueuePicker()" style="
          background:none;border:none;color:var(--text-3);cursor:pointer;
          font-size:22px;line-height:1;padding:0;flex-shrink:0;
          transition:color .15s;
        " onmouseenter="this.style.color='var(--text)'" onmouseleave="this.style.color='var(--text-3)'">✕</button>
      </div>
      <!-- media section — scrollable, shrinkable -->
      <div style="flex:1;overflow-y:auto;overscroll-behavior-y:contain;padding:12px 16px;min-height:0;">
        <div id="qpMediaSection"></div>
      </div>
      <!-- actions — always pinned to bottom -->
      <div style="padding:12px 16px;display:flex;gap:8px;flex-shrink:0;border-top:0.5px solid var(--border);">
        <button onclick="pickAnother()" style="
          flex:1;padding:10px 8px;min-height:44px;background:var(--bg-3);border:0.5px solid var(--border);
          border-radius:var(--radius-xs);font-size:13px;font-weight:500;color:var(--text);
          cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px;
        " onmouseenter="this.style.background='var(--bg-3)';this.style.borderColor='var(--border-olive)';this.style.color='var(--olive-light)'" onmouseleave="this.style.background='var(--bg-3)';this.style.borderColor='var(--border)';this.style.color='var(--text)'">${icon('sparkles',12)} Another</button>
        <button class="qp-start" onclick="qpStartWatching()" style="
          flex:1;padding:10px 8px;min-height:44px;background:var(--olive-light);border:none;
          border-radius:var(--radius-xs);font-size:13px;font-weight:600;color:#fff;
          cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:6px;
        " onmouseenter="this.style.background='var(--olive)'" onmouseleave="this.style.background='var(--olive-light)'">Start Watching</button>
      </div>
    </div>`;
  el.addEventListener('click', e => { if (e.target === el) closeQueuePicker(); });
  document.body.appendChild(el);
}

function showQueuePicker() {
  const queue = _catAll.filter(e => e.status === 'queue');
  if (!queue.length) { showToast('Your watchlist is empty.', 'err'); return; }
  _injectQPModal();
  _qpItem = queue[Math.floor(Math.random() * queue.length)];
  _renderQPCard(_qpItem);
  const ov = document.getElementById('qpOverlay');
  ov.style.pointerEvents = 'auto';
  ov.style.opacity = '1';
  document.getElementById('qpCard').style.transform = 'translateY(0)';
  document.body.style.overflow = 'hidden';
}

function closeQueuePicker() {
  const ov = document.getElementById('qpOverlay');
  if (!ov) return;
  ov.style.opacity = '0';
  document.getElementById('qpCard').style.transform = 'translateY(18px)';
  ov.style.pointerEvents = 'none';
  document.body.style.overflow = '';
  _qpItem = null;
}

function pickAnother() {
  const queue = _catAll.filter(e => e.status === 'queue');
  if (!queue.length) return;
  const others = queue.length > 1 ? queue.filter(e => e.id !== _qpItem?.id) : queue;
  _qpItem = others[Math.floor(Math.random() * others.length)];
  const slot = document.getElementById('qpMediaSection');
  if (!slot) return;
  slot.style.opacity = '0';
  slot.style.transform = 'scale(0.94)';
  // Update header to match new item
  document.getElementById('qpPoster').innerHTML = posterHTML(_qpItem);
  document.getElementById('qpTitle').textContent = _qpItem.title;
  const meta = [CAT_META[_qpItem.cat]?.label, ...(_qpItem.genres||[]).slice(0,2)].filter(Boolean);
  document.getElementById('qpMeta').innerHTML = meta.map(m =>
    `<span style="background:var(--olive-faint);border:0.5px solid var(--border-olive);color:var(--olive-light);border-radius:12px;padding:1px 6px;font-size:9px;letter-spacing:.3px">${m}</span>`
  ).join('');
  setTimeout(() => { _renderQPCardContent(_qpItem); slot.style.opacity = '1'; slot.style.transform = 'scale(1)'; }, 180);
}

function _renderQPCard(e) {
  const e_data = e;
  // Header
  document.getElementById('qpPoster').innerHTML = posterHTML(e_data);
  document.getElementById('qpTitle').textContent = e_data.title;
  const meta = [CAT_META[e_data.cat]?.label, ...(e_data.genres||[]).slice(0,2)].filter(Boolean);
  document.getElementById('qpMeta').innerHTML = meta.map(m =>
    `<span style="background:var(--olive-faint);border:0.5px solid var(--border-olive);color:var(--olive-light);border-radius:12px;padding:1px 6px;font-size:9px;letter-spacing:.3px">${m}</span>`
  ).join('');
  // Media section
  _renderQPCardContent(e_data);
}

function _renderQPCardContent(e) {
  const slot = document.getElementById('qpMediaSection');
  if (!slot) return;
  slot.style.transition = 'opacity 180ms var(--ease), transform 180ms var(--ease)';
  const posterSrc = e.poster_url ? `<img src="${e.poster_url}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-sm);">` : '';
  slot.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;">
      <div style="width:100%;max-width:200px;max-height:40vh;aspect-ratio:0.67;border-radius:var(--radius-sm);overflow:hidden;background:var(--bg-3);display:flex;align-items:center;justify-content:center;">
        ${posterSrc}
      </div>
      <div style="width:100%;display:flex;justify-content:center;gap:24px;flex-wrap:wrap;text-align:center;">
        <div>
          <div style="font-size:11px;color:var(--text-3);margin-bottom:3px;">Year</div>
          <div style="font-family:var(--bebas);font-size:15px;color:var(--text);font-weight:400;">${e.year || '—'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-3);margin-bottom:3px;">Status</div>
          <div style="font-size:12px;color:var(--olive-light);font-weight:500;padding:3px 8px;background:var(--olive-faint);border:0.5px solid var(--border-olive);border-radius:var(--radius-xs);">In Your Queue</div>
        </div>
      </div>
    </div>
  `;
}

async function qpStartWatching() {
  if (!_qpItem || !_catUser) return;
  const btn = document.querySelector('.qp-start');
  if (btn) { btn.disabled = true; btn.textContent = 'Moving…'; }
  try {
    await updateProgress(_qpItem.id, _catUser.id, { status: 'watching' });
    closeQueuePicker();
    await renderPage();
  } catch(e) {
    showToast('Could not move to watching.', 'err');
    if (btn) { btn.disabled = false; btn.innerHTML = `Start Watching`; }
  }
}

// Close QP on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const ov = document.getElementById('qpOverlay');
    if (ov && ov.style.opacity === '1') closeQueuePicker();
  }
});

/* rewatchEntry, getRewatchCount, isRewatching, rewatchBadgeHTML, rewatchIconHTML
   defined in rewatch.js (loaded before category.js) */

/* createShareCard defined in create-card.js */
