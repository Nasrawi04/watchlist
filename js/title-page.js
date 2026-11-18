/* ═══════════════════════════════════════════════════════════════
   title-page.js — title.html (title page redesign, 13 Nov 2026)

   A place to explore a title, not a dashboard. The title view's hero (backdrop, poster, status badge,
   title, chips, buttons) with your score ring — or "Will you like it?" when you haven't scored it — over
   MSF · TMDB · Friends; then four tabs:
     Overview   seasons, episodes of the season you're on, overview + key facts (a movie: its runtime),
                a row of cast, friends, fan favourites, details, the collection, If you like this
     Episodes   (shows) season tabs, your ratings vs TMDB on the episode chart, episode rows (rate in place)
     Cast & crew  the people, a few rows at a time
     Community  four notes and four lists about it, Read more → the Notes / Lists page for this title
   In your library: View in Library (its place there) and Edit (the Edit page). Not in it: Add to watchlist
   and Add & start; guests: Sign up to add. Phones: a boxed hero, sticky tabs, a bar above the bottom bar.
   Your artwork: your chosen poster and backdrop (and its framing) when it's in your library, TMDB's otherwise.

   Requires config.js, db.js, nav.js, title-view.js (MSSViews.ring), info-popup.js, list-popup.js,
   episode-ratings.js, episode-chat.js, discover-categories.js, rating-curve.js, note-popup.js; panel.js on demand.
   Styles: title.html (.tp-*) over style.css's title view (.tv-*) and Edit page (.de-*).
═══════════════════════════════════════════════════════════════ */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let _tdUser = null, _tdType = null, _tdId = null, _tdDetail = null, _tdOwnEntry = null, _tdMss = { avg: null, count: 0 };
let _tdTab = 'overview', _tdFriendAvg = null;
const _tpPhoneMQ = matchMedia('(max-width: 767px)');
const _tpPhone = () => _tpPhoneMQ.matches;
const _tpEl = id => document.getElementById(id);
const _tpMovie = () => _tdType === 'movie';
const _tpTwo = v => Number(v).toFixed(2);

// Returning via back / forward can restore this page from the bfcache with stale data
window.addEventListener('pageshow', (event) => {
  if (event.persisted && mssDataChangedSince(window._mssPageAt)) location.reload();
});

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  _tdType = params.get('type');
  _tdId = params.get('id');
  const t = params.get('tab');
  if (['overview', 'episodes', 'cast', 'community'].includes(t)) _tdTab = t;
  initPageGuest(async (user) => {
    _tdUser = user;
    if (!_tdType || !_tdId || (_tdType !== 'movie' && _tdType !== 'tv')) { mssErrorPage('badlink'); return; }
    await loadTitle();
  });
});

/* ── TMDB (credits, videos, providers… on top of the details; kept on the device by tmdbFetch) ── */
let _tdReload = false;          // Refresh info: one load straight from TMDB
const _tdOpts = () => _tdReload ? { cache: 'reload' } : {};
let _tdFail = null;
async function _tdFetchMovie(id) {
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/movie/${id}?language=en-US&append_to_response=credits,videos,release_dates,recommendations,watch/providers,images&include_image_language=en,null`, _tdOpts());
    if (!res.ok) { _tdFail = res; return null; }
    return await res.json();
  } catch (e) { _tdFail = e; return null; }
}
async function _tdFetchTV(id) {
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/tv/${id}?language=en-US&append_to_response=credits,videos,aggregate_credits,recommendations,content_ratings,watch/providers,images&include_image_language=en,null`, _tdOpts());
    if (!res.ok) { _tdFail = res; return null; }
    return await res.json();
  } catch (e) { _tdFail = e; return null; }
}
const _tdSeasonCache = {};
function _tdFetchSeason(tvId, seasonNum) {
  const k = tvId + ':' + seasonNum;
  return _tdSeasonCache[k] ||= tmdbFetch(`${TMDB_BASE}/tv/${tvId}/season/${seasonNum}?language=en-US`, _tdOpts())
    .then(r => r.ok ? r.json() : null).catch(() => null);
}
async function _tdFetchSeasons(tvId, nums) {
  const missing = nums.filter(n => !_tdSeasonCache[tvId + ':' + n]);
  for (let i = 0; i < missing.length; i += 20) {
    const part = missing.slice(i, i + 20);
    const req = tmdbFetch(`${TMDB_BASE}/tv/${tvId}?language=en-US&append_to_response=${part.map(n => 'season/' + n).join(',')}`, _tdOpts())
      .then(r => r.ok ? r.json() : {}).catch(() => ({}));
    part.forEach(n => { _tdSeasonCache[tvId + ':' + n] = req.then(d => d['season/' + n] || null); });
  }
  return Promise.all(nums.map(n => _tdFetchSeason(tvId, n)));
}

/* ── Loading: the details, the age check and your copy of it at the same time; the page draws as soon as
   those are in (from the device's copy when it has one). The MSF score and everything below fill in after. ── */
async function loadTitle() {
  const uid = _tdUser?.id;
  const ownById = uid ? getOwnEntryByTmdb(uid, Number(_tdId), _tdType, null).catch(() => null) : Promise.resolve(null);
  const [allowed, detail] = await Promise.all([MSSAge.page(_tdType, _tdId), _tpMovie() ? _tdFetchMovie(_tdId) : _tdFetchTV(_tdId)]);
  if (!allowed) return;
  if (!detail || detail.success === false) { mssErrorPage(_tdFail ? mssTmdbErrorKind(_tdFail, 'title') : 'title', { error: _tdFail }); return; }
  _tdDetail = detail;
  const titleForMatch = _tpMovie() ? detail.title : detail.name;
  const yearForMatch = ((_tpMovie() ? detail.release_date : detail.first_air_date) || '').split('-')[0] || null;
  // an entry linked to TMDB first; else one you added by its name (getOwnEntryByTmdb's fallback)
  let ownEntry = await ownById;
  if (!ownEntry && uid) ownEntry = await getOwnEntryByTmdb(uid, Number(_tdId), _tdType, titleForMatch).catch(() => null);
  _tdOwnEntry = ownEntry;
  const genreSync = mssSyncEntryGenres(ownEntry, detail, uid);
  if (_tdUser) recordRecentlyViewed(uid, Number(_tdId), _tdType, titleForMatch, detail.poster_path ? TMDB_FULL + detail.poster_path : null);

  _tpEl('tdLoading').style.display = 'none';
  _tpEl('tdBackLoading').style.display = 'none';
  const c = _tpEl('tdContent');
  c.style.display = '';
  c.innerHTML = _tdBuildHTML(detail, _tdMss, ownEntry);
  _tpMount();

  getTmdbAvgScore(Number(_tdId), _tdType, titleForMatch, yearForMatch).then(s => { _tdMss = s; _tpPaintTiles(); }).catch(() => {});
  if (!_tpMovie()) _tdLoadEpScores();
  _tdLoadNotes();
  _tdLoadLists();
  _tdLoadFriends(titleForMatch);
  _tdLoadRelated(detail);
  _tdLoadFans(detail);
  _tpLoadLike();
  _tdAnimeGenres(detail, ownEntry, titleForMatch, yearForMatch, genreSync);
  if (_tdTab !== 'overview') _tpTab(_tdTab, false, true);
}
// The MSF score → its breakdown (rating-curve.js, get_rating_breakdown 107)
function _tdOpenMsf() {
  const d = _tdDetail, name = _tpMovie() ? d.title : d.name;
  MSSCurve.open({ kind: 'title', tmdbId: _tdId, type: _tdType, title: name, heading: name, sub: _tpMovie() ? 'Movie' : 'Show' });
}
// Anime: AniList's genres beside TMDB's (as before), added to the hero's chips
async function _tdAnimeGenres(d, own, title, year, genreSync) {
  if (!mssIsAnime(own, d)) return;
  await genreSync;
  if (own) await mssSyncAnimeGenres(own, _tdUser?.id);
  const extra = await mssAnimeGenres(own?.title || title, own ? String(own.year || '').slice(0, 4) : year);
  const box = document.querySelector('#tdContent .tp-chips');
  if (!box || !extra?.length) return;
  const shown = new Set([...box.querySelectorAll('.tv-chip')].map(b => b.textContent));
  box.insertAdjacentHTML('beforeend', extra.filter(g => !shown.has(g)).map(g => `<span class="tv-chip">${esc(g)}</span>`).join(''));
}

/* ── Refresh info: details, seasons and episodes straight from TMDB ── */
async function _tdRefresh(btn) {
  if (btn.disabled) return;
  btn.disabled = true; btn.classList.add('busy');
  const y = window.scrollY;
  try {
    await mssTmdbForget(_tdType, _tdId);
    Object.keys(_tdSeasonCache).forEach(k => { if (k.startsWith(_tdId + ':')) delete _tdSeasonCache[k]; });
    _tpEps.loaded = {}; _tpEps.on = false;
    _tdReload = true;
    await loadTitle();
    window.scrollTo({ top: y, behavior: 'instant' });
    showToast('Up to date — the latest from TMDB.');
  } catch (err) {
    console.error('Refresh info:', err);
    showToast('Couldn’t refresh — try again in a moment.', 'err');
    btn.disabled = false; btn.classList.remove('busy');
  } finally { _tdReload = false; }
}

/* ══ What the page shows ══ */
const _TP_SECTION = { queue: 'Watchlist', up_next: 'Up Next', watching: 'Watching', paused: 'Taking a Break', completed: 'Watched', ongoing: 'To Be Continued', dropped: 'Dropped' };
function _tpStatusText(e) {
  if (!e) return '';
  const show = !_tpMovie(), pos = show && (e.season || e.episode) ? ` · S${Number(e.season) || 1} E${Number(e.episode) || 0}` : '';
  switch (e.status) {
    case 'queue': return 'On your watchlist';
    case 'up_next': return 'Up next';
    case 'watching': return 'Watching' + pos;
    case 'paused': return 'Taking a break' + pos;
    case 'completed': return 'Watched';
    case 'ongoing': return 'To Be Continued' + pos;
    case 'dropped': return mssDroppedLabel(e);
  }
  return 'In your library';
}
function _tpCert(d) {
  if (_tpMovie()) { const us = (d.release_dates?.results || []).find(r => r.iso_3166_1 === 'US'); return us?.release_dates?.find(rd => rd.certification)?.certification || ''; }
  return (d.content_ratings?.results || []).find(r => r.iso_3166_1 === 'US')?.rating || '';
}
const _tpRuntime = m => m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : '';
function _tpYears(d) {
  const a = ((_tpMovie() ? d.release_date : d.first_air_date) || '').slice(0, 4);
  if (_tpMovie() || !a) return a;
  const b = ['Ended', 'Canceled'].includes(d.status) ? (d.last_air_date || '').slice(0, 4) : '';
  return b && b !== a ? `${a}–${b}` : a;
}
// TMDB's status in the site's words (Returning Series → Currently airing); a released movie needs none
function _tpStatusWord(d) {
  const s = d.status || '';
  if (_tpMovie()) return s && s !== 'Released' ? s : '';
  return { 'Returning Series': 'Currently airing', Canceled: 'Cancelled', Ended: 'Ended', 'In Production': 'In production', Planned: 'Planned', Pilot: 'Pilot' }[s] || s;
}
const _tpEpLen = d => d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null;
function _tpPeople(d) {
  const seen = new Set();
  return (_tpMovie() ? (d.credits?.crew || []).filter(c => c.job === 'Director') : (d.created_by || [])).filter(p => p.name && !seen.has(p.id) && seen.add(p.id));
}
const _tpCast = d => _tpMovie() ? (d.credits?.cast || []) : (d.aggregate_credits?.cast || d.credits?.cast || []);
function _tpCrew(d) {
  const by = new Map();
  (_tpMovie() ? (d.credits?.crew || []) : (d.aggregate_credits?.crew || d.credits?.crew || [])).forEach(c => {
    const jobs = c.jobs ? c.jobs.map(j => j.job) : [c.job];
    const x = by.get(c.id) || { ...c, jobList: [] };
    jobs.forEach(j => { if (j && !x.jobList.includes(j)) x.jobList.push(j); });
    by.set(c.id, x);
  });
  const rank = j => ['Director', 'Creator', 'Executive Producer', 'Screenplay', 'Writer', 'Producer', 'Original Music Composer', 'Director of Photography'].indexOf(j);
  return [...by.values()].sort((a, b) => ((rank(a.jobList[0]) + 1 || 99) - (rank(b.jobList[0]) + 1 || 99)) || (b.popularity || 0) - (a.popularity || 0));
}
const _tpPosterURL = (d, own) => safeURL(own?.poster_url) || (d.poster_path ? TMDB_FULL + d.poster_path : null);
const _tpTrailer = d => (d.videos?.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer') || (d.videos?.results || []).find(v => v.site === 'YouTube');
const _tpLibHref = e => `${CAT_META[e.cat]?.page || 'library.html'}?focus=${encodeURIComponent(e.id)}`;
const _B = (label, ic, attrs, cls = '') => `<button type="button" class="tv-btn${cls ? ' ' + cls : ''}" ${attrs}>${ic ? icon(ic, 16) : ''}<span>${esc(label)}</span></button>`;
const _IB = (label, ic, attrs, cls = '') => `<button type="button" class="tv-btn is-icon${cls ? ' ' + cls : ''}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${icon(ic, 18)}</button>`;

// The main action for you: View in Library (in it), Add to watchlist (not), Sign up to add (a guest)
function _tpMainHTML(e, where) {
  if (!_tdUser) return _B('Sign up to add', 'plus', `onclick="mssJoin('add this to your library')"`, 'is-main');
  if (e) return `<a class="tv-btn is-main" href="${esc(_tpLibHref(e))}">${icon('grid', 16)}<span>View in Library</span></a>`;
  return _B(where === 'bar' ? 'Add to watchlist' : 'Add to watchlist', 'plus', `onclick="_tdAddToLibrary('queue')"`, 'is-main');
}
function _tpActsHTML(d, e) {
  const tr = _tpTrailer(d), w = _tdWtw(d);
  const parts = [_tpMainHTML(e)];
  if (e) parts.push(_B('Edit', 'edit', `onclick="goToDetail(${attrJSON(e.id)}, 'title.html')"`));
  else if (_tdUser) parts.push(_B(_tpMovie() ? 'Add & start' : 'Add & start watching', 'play', `onclick="_tdAddToLibrary('watching')"`));
  if (w.any) parts.push(`<button type="button" class="tv-btn" onclick="_tdOpenWtw()" aria-haspopup="dialog">${w.logos.length ? `<span class="tp-wtw-logos" aria-hidden="true">${w.logos.map(l => `<img src="${TMDB_IMG.replace('w185', 'w92')}${l}" alt="" loading="lazy">`).join('')}</span>` : icon('film', 16)}<span>Where to Watch</span></button>`);
  if (tr) parts.push(`<a class="tv-btn" href="https://www.youtube.com/watch?v=${esc(tr.key)}" target="_blank" rel="noopener">${icon('play', 16)}<span>Trailer</span></a>`);
  if (_tdUser) parts.push(_B('Recommend', 'send', `onclick="_tpRecommend()" aria-haspopup="dialog"`));
  parts.push(_IB('More actions', 'moreV', `onclick="_tpMore(this)" aria-haspopup="menu" data-top-more`));
  return parts.join('');
}
// phones: three quick buttons in the hero (the main ones are in the bar at the bottom)
function _tpQuickHTML(d) {
  const tr = _tpTrailer(d), w = _tdWtw(d), b = [];
  if (w.any) b.push(`<button type="button" class="tv-btn" onclick="_tdOpenWtw()" aria-haspopup="dialog">${w.logos.length ? `<span class="tp-wtw-logos" aria-hidden="true"><img src="${TMDB_IMG.replace('w185', 'w92')}${w.logos[0]}" alt=""></span>` : icon('film', 16)}<span>Where to Watch</span></button>`);
  if (tr) b.push(`<a class="tv-btn" href="https://www.youtube.com/watch?v=${esc(tr.key)}" target="_blank" rel="noopener">${icon('play', 16)}<span>Trailer</span></a>`);
  if (_tdUser) b.push(_B('Recommend', 'send', `onclick="_tpRecommend()" aria-haspopup="dialog"`));
  return b.length ? `<div class="tp-quick">${b.join('')}</div>` : '';
}
function _tpBarHTML(e) {
  return `<div class="tp-bar" role="toolbar" aria-label="Actions">${_tpMainHTML(e, 'bar')}${e ? _IB('Edit', 'edit', `onclick="goToDetail(${attrJSON(e.id)}, 'title.html')"`) : ''}${_IB('More actions', 'moreV', `onclick="_tpMore(this)" aria-haspopup="menu" data-top-more`)}</div>`;
}
// MSF · TMDB · Friends (filled in as they arrive)
function _tpTilesHTML(d) {
  const tmdb = d.vote_average ? _discFloorScore(d.vote_average) : null, m = _tdMss;
  return `<button type="button" class="tp-tile${m.avg == null ? ' is-none' : ''}" data-tile="msf" onclick="_tdOpenMsf()" aria-haspopup="dialog" aria-label="MyScreenFolio score ${m.avg != null ? _discFloorScore(m.avg) : 'none yet'} — see the breakdown">
      <b>${m.avg != null ? _discFloorScore(m.avg) : '—'}</b><small>MSF${m.count ? ' · ' + m.count : ''}</small></button>
    <div class="tp-tile${tmdb ? '' : ' is-none'}" title="${d.vote_count ? Number(d.vote_count).toLocaleString(MSSI18n.locale) + ' votes on TMDB' : 'TMDB'}"><b>${tmdb || '—'}</b><small>TMDB</small></div>
    <div class="tp-tile${_tdFriendAvg == null ? ' is-none' : ''}" data-tile="friends"><b>${_tdFriendAvg != null ? _tdFriendAvg.toFixed(2) : '—'}</b><small>Friends</small></div>`;
}
function _tpPaintTiles() {
  if (!_tdDetail) return;
  document.querySelectorAll('#tdContent .tp-tiles').forEach(el => { el.innerHTML = _tpTilesHTML(_tdDetail); });
}
// your score (ring) — or Will you like it? when you haven't scored it (signed in)
function _tpMineHTML(e) {
  const v = e ? liveScore(e) : null;
  if (v != null) return `<div class="tp-mine">${MSSViews.ring(v, 'l', e.status === 'dropped')}<small>Your score</small></div>`;
  if (!_tdUser) return '';
  return `<div class="tp-like is-loading" id="tpLike" aria-live="polite"><h3>Will you like it?</h3><b>…</b><p>Looking at your ratings</p></div>`;
}

function _tpHeroHTML(d, e) {
  const title = _tpMovie() ? d.title : d.name, poster = _tpPosterURL(d, e);
  const label = e ? _tpStatusText(e) : _tdUser ? 'Not in your library' : '';
  const chips = [_tpYears(d), _tpCert(d),
    _tpMovie() ? _tpRuntime(d.runtime) : [d.number_of_seasons ? `${d.number_of_seasons} season${d.number_of_seasons === 1 ? '' : 's'}` : '', d.number_of_episodes ? `${d.number_of_episodes} eps` : ''].filter(Boolean).join(' · '),
    _tpStatusWord(d), ...tmdbGenreNames(d.genres),
    _tpMovie() ? (d.production_companies || [])[0]?.name : (d.networks || [])[0]?.name].filter(Boolean);
  const wall = !_tdUser && new URLSearchParams(location.search).get('from') === 'wall' ? `<div class="td-wall-nudge">
      <span class="td-wall-nudge-ic" aria-hidden="true">${icon('ratingStar', 18)}</span>
      <span class="td-wall-nudge-tx"><b>Seen it?</b><small>Make a free account to rate it — we’ll bring you back here.</small></span>
      <a class="btn-save" href="login.html#signup" onclick="try{sessionStorage.setItem('mss_next','title.html?type=${_tdType}&id=${String(_tdId).replace(/\D/g, '')}')}catch{}">Sign up to rate it</a></div>` : '';
  return `<header class="tv-hero tp-hero ${e && liveScore(e) != null ? 'is-rating' : 'is-info'}" id="tpHero">
    <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
    <div class="tv-top tp-top">
      <span class="tv-top-gap"></span>
      <button type="button" class="tv-round is-wide tp-refresh" onclick="_tdRefresh(this)" title="Get this title's latest details from TMDB" aria-label="Refresh info — get the latest details from TMDB">${icon('refresh', 14)}<span class="tp-refresh-l">Refresh info</span></button>
    </div>
    <div class="tv-hero-main">
      <div class="tv-poster">${poster ? `<img src="${esc(poster)}" alt="" onerror="mssImgError(this)" data-letter="${esc((title || '?')[0])}">` : `<span>${esc((title || '?')[0].toUpperCase())}</span>`}</div>
      <div class="tv-hero-txt">
        ${label ? `<span class="tv-status tp-status${e ? '' : ' is-off'}"><i aria-hidden="true"></i>${esc(label)}</span>` : ''}
        ${tmdbTitleHTML(d, title, 'tv-title', 'h1')}
        ${d.tagline ? `<p class="tv-tagline" translate="no">${esc(d.tagline)}</p>` : ''}
        <div class="tv-chips tp-chips">${chips.map(x => `<span class="tv-chip">${esc(x)}</span>`).join('')}</div>
        <div class="tv-acts tp-acts">${_tpActsHTML(d, e)}</div>
        ${wall}
      </div>
      <div class="tp-scores">${_tpMineHTML(e)}<div class="tp-tiles">${_tpTilesHTML(d)}</div></div>
    </div>
    <div class="tp-tiles tp-tiles-ph">${_tpTilesHTML(d)}</div>
    ${_tpQuickHTML(d)}
  </header>`;
}
function _tpMiniHTML(d, e) {
  const title = _tpMovie() ? d.title : d.name, poster = _tpPosterURL(d, e), v = e ? liveScore(e) : null;
  const label = e ? _tpStatusText(e) : _tdUser ? 'Not in your library' : (_tpMovie() ? 'Movie' : 'TV Show');
  return `<div class="tv-mini de-mini tp-mini" id="tpMini" inert>
    <span class="tv-hero-bg" aria-hidden="true"></span><span class="tv-hero-shade" aria-hidden="true"></span>
    ${poster ? `<img class="tv-mini-poster" src="${esc(poster)}" alt="">` : ''}
    <span class="tv-mini-txt"><small class="${e ? '' : 'is-off'}">${esc(label)}</small><b translate="no">${esc(title)}</b></span>
    ${v != null ? MSSViews.ring(v, 'xs', e.status === 'dropped') : ''}
    <span class="tp-mini-act">${_tpMainHTML(e)}</span>
  </div>`;
}
function _tpTabsHTML(d, e) {
  const n = x => `<span class="tv-tab-n" id="tpTabN-${x}"${x === 'community' ? ' hidden' : ''}>${x === 'episodes' ? (d.number_of_episodes || '') : x === 'cast' ? (_tpCast(d).length + _tpCrew(d).length || '') : ''}</span>`;
  const tabs = [['overview', 'Overview'], ...(_tpMovie() ? [] : [['episodes', '<span class="tp-l-long">Seasons &amp; Episodes</span><span class="tp-l-short">Episodes</span>']]), ['cast', '<span class="tp-l-long">Cast &amp; crew</span><span class="tp-l-short">Cast</span>'], ['community', 'Community']];
  return `<div class="tv-tabs de-tabs tp-tabs" role="tablist" aria-label="${esc(_tpMovie() ? d.title : d.name)}">
    ${tabs.map(([k, l]) => `<button type="button" role="tab" class="tv-tab${k === 'overview' ? ' is-on' : ''}" id="tpTab-${k}" data-tab="${k}" aria-controls="tpPanel-${k}" aria-selected="${k === 'overview'}" tabindex="${k === 'overview' ? 0 : -1}">${l}${k === 'overview' ? '' : n(k)}</button>`).join('')}
    ${_tpVisHTML(e)}
  </div>`;
}
// the tab bar's right side: where it is in your library and who can see it
function _tpVisHTML(e) {
  const t = e ? `${icon({ friends: 'users', private: 'lock' }[e.visibility] || 'globe', 13)} In your library · ${esc(_TP_SECTION[e.status] || '')} · Visible to ${esc({ friends: 'friends', private: 'only me' }[e.visibility] || 'anyone')}`
    : _tdUser ? 'Not in your library yet' : '';
  return `<span class="tv-tabs-vis">${t}</span>`;
}

/* ── Overview ── */
const _tpSec = (h, body, more = '', cls = '', id = '') => `<section class="tv-sec${cls ? ' ' + cls : ''}"${id ? ` id="${id}"` : ''}><div class="tv-sec-h"><h3>${h}</h3>${more}</div>${body}</section>`;
function _tpPersonHTML(p, sub, dir) {
  const ph = p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null;
  return `<a class="tv-person" href="person.html?id=${encodeURIComponent(p.id)}${dir ? '&mode=directing' : ''}">
    <span class="tv-face">${ph ? `<img src="${ph}" alt="" loading="lazy" onerror="mssImgError(this)" data-letter="${esc((p.name || '?')[0])}">` : esc((p.name || '?')[0].toUpperCase())}</span>
    <b translate="no">${esc(p.name)}</b>${sub ? `<small translate="no">${esc(sub)}</small>` : ''}</a>`;
}
// one row of faces; the whole list is on the Cast & crew tab (owner: no View more here)
function _tpCastPreviewHTML(d) {
  const cast = _tpCast(d);
  if (!cast.length) return '';
  return _tpSec('Cast', `<div class="tp-cast">${cast.slice(0, 8).map(p => _tpPersonHTML(p, p.character || p.roles?.[0]?.character || '')).join('')}</div>
`, `<button type="button" class="tv-link" onclick="_tpTab('cast', true)">Full cast &amp; crew (${cast.length + _tpCrew(d).length}) <span aria-hidden="true">→</span></button>`);
}
function _tpKeysHTML(d) {
  const dir = _tpPeople(d);
  const link = (list, isDir) => list.slice(0, 2).map(p => `<a class="tv-name" href="person.html?id=${encodeURIComponent(p.id)}${isDir ? '&mode=directing' : ''}">${esc(p.name)}</a>`).join(', ');
  const rows = _tpMovie()
    ? [[dir.length > 1 ? 'Directors' : 'Director', link(dir, true)], ['Released', esc(_tpDate(d.release_date))], ['Studio', esc((d.production_companies || [])[0]?.name || '')], ['Status', esc(d.status || '')]]
    : [[dir.length > 1 ? 'Creators' : 'Creator', link(dir, true)], ['Network', esc((d.networks || []).map(n => n.name).slice(0, 2).join(', '))],
       ['Episode length', _tpEpLen(d) ? `~${_tpEpLen(d)} min` : ''], ['Status', esc(_tpStatusWord(d))]];
  const ok = rows.filter(r => r[1]);
  return ok.length ? `<div class="tp-keys">${ok.map(([l, v]) => `<div class="tv-tile"><small>${l}</small><b>${v}</b></div>`).join('')}</div>` : '';
}
function _tpRuntimeHTML(d) {
  if (!_tpMovie() || !d.runtime) return '';
  const end = new Date(Date.now() + d.runtime * 60000).toLocaleTimeString(MSSI18n.locale, { hour: 'numeric', minute: '2-digit' });
  return `<div class="tp-runtime"><span class="tp-runtime-ic" aria-hidden="true">${icon('clock', 22)}</span>
    <div><b>${_tpRuntime(d.runtime)}</b><small>Runtime · ${d.runtime} minutes</small></div>
    <span>Start now,<br>done by ${esc(end)}</span></div>`;
}
const _tpDate = (s, month = 'long') => s ? new Date(s + 'T12:00:00').toLocaleDateString(MSSI18n.locale, { year: 'numeric', month, day: 'numeric' }) : '';
function _tpDetailsHTML(d) {
  let lang = d.original_language || '';
  try { if (lang) lang = new Intl.DisplayNames([MSSI18n.locale || 'en'], { type: 'language' }).of(lang) || lang; } catch {}
  const country = (d.origin_country || d.production_countries?.map(c => c.iso_3166_1) || [])[0];
  let ctry = country || '';
  try { if (country) ctry = new Intl.DisplayNames([MSSI18n.locale || 'en'], { type: 'region' }).of(country) || country; } catch {}
  const money = v => v ? '$' + (v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.round(v / 1e6) + 'M') : '';
  const rows = _tpMovie()
    ? [['Rated', _tpCert(d)], ['Language', lang], ['Country', ctry], ['Production', (d.production_companies || []).slice(0, 2).map(c => c.name).join(', ')],
       ['Budget', money(d.budget)], ['Box office', money(d.revenue)], ['TMDB votes', d.vote_count ? Number(d.vote_count).toLocaleString(MSSI18n.locale) : '']]
    : [['First aired', _tpDate(d.first_air_date)], ['Last aired', _tpDate(d.last_air_date)], ['Rated', _tpCert(d)], ['Language', lang], ['Country', ctry],
       ['Production', (d.production_companies || []).slice(0, 2).map(c => c.name).join(', ')], ['TMDB votes', d.vote_count ? Number(d.vote_count).toLocaleString(MSSI18n.locale) : '']];
  const ok = rows.filter(r => r[1]);
  return ok.length ? _tpSec('Details', `<dl class="tv-dl">${ok.map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`) : '';
}
const _tpSeasonsOf = d => (d.seasons || []).filter(s => s.season_number > 0 || d.seasons.length === 1);
// the season the page opens episodes on: the one you're on (in your library), else the first
function _tpCurSeason(d) {
  const real = _tpSeasonsOf(d).map(s => s.season_number), e = _tdOwnEntry;
  const want = e && ['watching', 'paused', 'dropped', 'ongoing'].includes(e.status) ? Number(e.season) || 1 : null;
  return want && real.includes(want) ? want : real.includes(1) ? 1 : real[0];
}
function _tpOverviewHTML(d, e) {
  const main = `    ${_tpSec('Overview', `<p class="tv-overview" translate="no">${esc(d.overview) || mssT('No description available.')}</p>${_tpRuntimeHTML(d)}${_tpKeysHTML(d)}`)}
    ${_tpCastPreviewHTML(d)}
    <div id="tdRecs"></div>
`;
  const side = `<div id="tdFriends"></div><div id="tdFans"></div>${_tpDetailsHTML(d)}`;
  return `<div class="tv-cols"><div class="tv-main">${main}</div><aside class="tv-side">${side}</aside></div>
    <div class="tp-full"><div id="tdCollection"></div></div>`;
}

/* ── Cast & crew tab ── */
// Cast & crew always in whole rows (owner, 14 Nov 2026): cast starts with 2 full rows and View more adds 5;
// crew starts with 1 and View more adds 3. A row holds as many people as fit at 120px (3 on phones).
const _TP_ROWS = { cast: [2, 5], crew: [1, 3] };
const _tpPeopleRows = { cast: 2, crew: 1 };
let _tpColsNow = 0;
function _tpPeopleCols() {
  if (_tpPhone()) return 3;
  const w = (_tpEl('tpPage')?.clientWidth || innerWidth) - 44;   // the box's padding
  return Math.max(2, Math.floor((w + 14) / (120 + 14)));
}
// Cast & crew cards: actors, directors, writers and creators open their person page (a director / creator on Directing);
// every other crew role is there to read, not a link (owner, 14 Nov 2026). Writers: TMDB's Writing department.
const _TP_LINK_JOBS = /^(Director|Co-Director|Creator)$/;
function _tpCastCardHTML(p, sub, crew) {
  const jobs = crew ? (p.jobList || [p.job]).filter(Boolean) : [];
  const writer = crew && (p.department === 'Writing' || (p.jobs || []).some(() => p.department === 'Writing') || jobs.some(j => /Writer|Screenplay|Story|Teleplay|Novel|Characters|Author/.test(j)));
  const link = !crew || writer || jobs.some(j => _TP_LINK_JOBS.test(j));
  const dir = crew && jobs.some(j => _TP_LINK_JOBS.test(j));
  const inner = `<div class="td-cast-photo">${p.profile_path ? `<img src="${TMDB_IMG}${p.profile_path}" alt="" loading="lazy">` : esc((p.name || '?')[0])}</div>
    <div class="td-cast-name" translate="no">${esc(p.name)}</div>
    <div class="td-cast-char" translate="no">${esc(sub || '')}</div>`;
  return link ? `<a class="td-cast-card" href="person.html?id=${p.id}${dir ? '&mode=directing' : ''}">${inner}</a>` : `<div class="td-cast-card is-static">${inner}</div>`;
}
function _tpPeopleHTML(d) {
  const cast = _tpCast(d), crew = _tpCrew(d), creators = _tpMovie() ? [] : (d.created_by || []);
  const crewAll = [...creators.map(c => ({ ...c, jobList: ['Creator'] })), ...crew.filter(c => !creators.some(x => x.id === c.id))];
  const block = (k, h, list, sub) => {
    if (!list.length) return '';
    const cols = _tpPeopleCols(), n = _tpPeopleRows[k] * cols, left = Math.max(0, list.length - n), more = _tpPeopleRows[k] > _TP_ROWS[k][0];
    return _tpSec(`${h} <span class="tv-tab-n">${list.length}</span>`, `<div class="tp-people" style="--cols:${cols}">${list.slice(0, n).map(p => _tpCastCardHTML(p, sub(p), k === 'crew')).join('')}</div>
      ${left > 0 || more ? `<div class="tp-more">${left > 0 ? `<button type="button" class="tv-btn" onclick="_tpPeopleMore('${k}')">View more <span class="tv-tab-n">${left}</span></button>` : ''}${more ? `<button type="button" class="tv-btn" onclick="_tpPeopleMore('${k}', true)">Show less</button>` : ''}</div>` : ''}`, '', '', 'tpPeople-' + k);
  };
  _tpColsNow = _tpPeopleCols();
  const html = block('cast', 'Cast', cast, p => p.character || p.roles?.map(r => r.character).filter(Boolean).slice(0, 2).join(' / ') || '')
    + block('crew', 'Crew', crewAll, p => (p.jobList || [p.job]).slice(0, 2).join(', '));
  return html ? `<div class="tv-main">${html}</div>` : mssEmpty({ compact: true, art: 'watching', title: 'No cast or crew yet', text: 'TMDB hasn’t listed anyone for this title yet.' });
}
function _tpPeopleMore(k, less) {
  _tpPeopleRows[k] = less ? _TP_ROWS[k][0] : _tpPeopleRows[k] + _TP_ROWS[k][1];
  _tpEl('tpPanel-cast').innerHTML = _tpPeopleHTML(_tdDetail);
  if (less) _tpEl('tpPeople-' + k)?.scrollIntoView({ block: 'nearest' });
}

/* ── Community tab: Notes and Lists ── */
function _tpCommunityHTML() {
  return `<div class="tv-cols tp-comm" style="grid-template-columns:minmax(0,1fr)">
    <section class="tv-sec"><div class="tp-comm-h"><h3>Notes <span id="tdNotesCount"></span></h3>
      <div class="td-notes-controls">
        <button class="td-notes-sort-btn active" data-sort="popular" onclick="_tdSetNotesSort('popular')">Most popular</button>
        <button class="td-notes-sort-btn" data-sort="least_popular" onclick="_tdSetNotesSort('least_popular')">Least popular</button>
        <button class="td-notes-sort-btn" data-sort="newest" onclick="_tdSetNotesSort('newest')">Newest</button>
      </div></div>
      <div id="tdNotesList"><div class="td-notes-loading">Loading notes…</div></div></section>
    <section class="tv-sec"><div class="tp-comm-h"><h3>Lists <span id="tdListsCount"></span></h3></div>
      <div id="tdLists"><div class="td-notes-loading">Loading lists…</div></div></section>
  </div>`;
}

/* ── the whole page ── */
function _tdBuildHTML(d, mssScore, ownEntry) {
  const title = _tpMovie() ? d.title : d.name;
  if (title) document.title = `${title} — MyScreenFolio`;
  const was = _tdMss; _tdMss = mssScore || _tdMss;
  try {
    return `<div class="tv-page de-page tp-page${_tpPhone() ? ' is-phone' : ''}" id="tpPage">
      <div class="de-cap" aria-hidden="true"></div>
      ${_tpMiniHTML(d, ownEntry)}
      ${mssCrumbHTML(title, { href: 'discover.html', label: 'Discover' })}
      ${_tpHeroHTML(d, ownEntry)}
      ${_tpTabsHTML(d, ownEntry)}
      <section class="tp-panel" id="tpPanel-overview" role="tabpanel" aria-labelledby="tpTab-overview" tabindex="-1">${_tpOverviewHTML(d, ownEntry)}</section>
      ${_tpMovie() ? '' : `<section class="tp-panel" id="tpPanel-episodes" role="tabpanel" aria-labelledby="tpTab-episodes" tabindex="-1" hidden></section>`}
      <section class="tp-panel" id="tpPanel-cast" role="tabpanel" aria-labelledby="tpTab-cast" tabindex="-1" hidden>${_tpPeopleHTML(d)}</section>
      <section class="tp-panel" id="tpPanel-community" role="tabpanel" aria-labelledby="tpTab-community" tabindex="-1" hidden>${_tpCommunityHTML()}</section>
      ${_tpBarHTML(ownEntry)}
    </div>`;
  } finally { if (!mssScore) _tdMss = was; }
}

/* ── after drawing: the backdrop, tabs, the slim bar, phone / desktop ── */
let _tpTabGap = null, _tpWired = false;
function _tpMount() {
  const page = _tpEl('tpPage');
  document.body.dataset.ownActions = '';                         // phones: the page has its own action bar — no Create button over it
  _tpBackdrop(page);
  page.querySelector('.tp-tabs').addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) _tpTab(b.dataset.tab, true); });
  page.querySelector('.tp-tabs').addEventListener('keydown', ev => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const tabs = [...page.querySelectorAll('.tp-tabs [role=tab]')], i = tabs.findIndex(t => t.dataset.tab === _tdTab);
    const rtl = document.documentElement.dir === 'rtl', dir = (ev.key === 'ArrowRight') !== rtl ? 1 : -1;
    const j = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + dir + tabs.length) % tabs.length;
    ev.preventDefault(); _tpTab(tabs[j].dataset.tab, false); tabs[j].focus();
  });
  _tpTabGap = null;
  if (!_tpWired) {
    _tpWired = true;
    addEventListener('scroll', _tpScroll, { passive: true });
    addEventListener('resize', _tpScroll, { passive: true });
    addEventListener('resize', () => { const p = _tpEl('tpPanel-cast'); if (p && _tdDetail && _tpPeopleCols() !== _tpColsNow) p.innerHTML = _tpPeopleHTML(_tdDetail); }, { passive: true });
    _tpPhoneMQ.addEventListener('change', () => {
      const p = _tpEl('tpPage'); if (!p) return;
      p.classList.toggle('is-phone', _tpPhone()); _tpTabGap = null; _tpScroll();
      _tpBackdrop(p);
      if (_tpEps.on && _tpEps.season != null) _tpEpsPaint();
    });
  }
  _tpScroll();
}
async function _tpBackdrop(root) {
  const e = _tdOwnEntry, d = _tdDetail;
  const path = MSSBackdrop.chosen(e) || d.backdrop_path;     // your own pick (in your library), else TMDB's
  const els = [...root.querySelectorAll('.tv-hero-bg')];
  const hero = root.querySelector('.tv-hero'), mini = root.querySelector('.tv-mini');
  if (!path) { const p = _tpPosterURL(d, e); if (!p) { hero?.classList.add('no-bd'); return; } }
  const u = path ? `https://image.tmdb.org/t/p/w1280${path}` : _tpPosterURL(d, e);
  const framed = e ? MSSBackdrop.style(e, false, _tpPhone() ? 'phone' : 'desk') : '';   // how you framed it (Edit page → Adjust framing)
  const im = new Image();
  im.onload = () => els.forEach(el => { if (!el.isConnected) return; el.style.backgroundImage = `url('${u}')`; el.style.backgroundPosition = ''; el.style.transform = ''; if (framed) el.style.cssText += framed; el.parentElement.classList.add('has-bd'); });
  im.src = u;
  void hero; void mini;
}
// the slim bar comes in the moment the tab bar reaches the site's header (the Edit page's behaviour)
function _tpScroll() {
  const L = _tpEl('tpPage'); if (!L) return;
  const top = Math.max(0, _tpEl('mainNav')?.getBoundingClientRect().bottom || 0), hero = _tpEl('tpHero').getBoundingClientRect();
  L.style.setProperty('--de-top', top + 'px');
  if (_tpTabGap == null || !L.classList.contains('is-scrolled') && scrollY < 4) _tpTabGap = L.querySelector('.tp-tabs').getBoundingClientRect().top - hero.bottom;
  const on = hero.bottom + _tpTabGap <= top + 9;
  L.classList.toggle('is-scrolled', on);
  _tpEl('tpMini').inert = !on;
}
function _tpTab(x, user, initial) {
  if (!_tpEl('tpPanel-' + x)) x = 'overview';
  _tdTab = x;
  document.querySelectorAll('#tpPage .tp-tabs [role=tab]').forEach(b => {
    const on = b.dataset.tab === x;
    b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('#tpPage .tp-panel').forEach(p => { p.hidden = p.id !== 'tpPanel-' + x; });
  if (x === 'episodes') _tpEpsOpen();
  if (x === 'cast' && _tpPeopleCols() !== _tpColsNow) _tpEl('tpPanel-cast').innerHTML = _tpPeopleHTML(_tdDetail);
  // remembered in the address, so Back returns to the same tab
  try { const u = new URL(location.href); if (x === 'overview') u.searchParams.delete('tab'); else u.searchParams.set('tab', x); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch {}
  // scrolled past the tab bar → back to the top of the tab
  const hero = _tpEl('tpHero'); if (!hero || initial) return;
  const top = Math.max(0, _tpEl('mainNav')?.getBoundingClientRect().bottom || 0);
  const y = hero.getBoundingClientRect().bottom + scrollY - top - 70;
  if (scrollY > y) scrollTo({ top: Math.max(0, y), behavior: 'instant' });
}
// ⋯: the less-used actions
async function _tpMore(btn) {
  const d = _tdDetail, e = _tdOwnEntry, items = [];
  const add = (label, ic, fn) => items.push({ label, icon: ic, onSelect: fn });
  if (!_tpMovie()) {
    add('View all seasons', 'layers', () => { location.href = `season.html?show=${_tdId}&all=seasons`; });
    add('Episode ratings graph', 'episodes', () => { location.href = `episodes.html?show=${_tdId}`; });
    if (e && typeof MSSEp !== 'undefined' && MSSEp.isShow(e)) add('Rate episodes', 'ratingStar', () => MSSEp.rate(e, Number(e.season) || 1, Math.max(1, Number(e.episode) || 1), { onSaved: () => _tpEpRefresh() }));
  }
  if (e && typeof MSSList !== 'undefined' && MSSList.addTo) add('Add to a list', 'layers', () => MSSList.addTo(e));
  add('Share', 'share', async () => {
    const url = location.origin + location.pathname + `?type=${_tdType}&id=${_tdId}`;
    if (navigator.share) { try { await navigator.share({ title: _tpMovie() ? d.title : d.name, url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); showToast('Link copied.'); } catch { showToast('Couldn’t copy the link.', 'err'); }
  });
  await mssLoadScript('js/panel.js');
  MSSPopover.open(btn, { title: _tpMovie() ? d.title : d.name, label: 'More actions', items });
}
function _tpRecommend() {
  const d = _tdDetail;
  mssRecommend({ tmdb_id: Number(_tdId), media_type: _tdType, title: _tpMovie() ? d.title : d.name,
    poster_url: d.poster_path ? TMDB_IMG + d.poster_path : null, year: ((_tpMovie() ? d.release_date : d.first_air_date) || '').slice(0, 4) });
}

// The shared Add to Library panel (info-popup.js), starting on the Watchlist or Watching
function _tdAddToLibrary(status = 'queue') {
  if (mssGuestGate('add this to your library') || !_tdUser || !_tdDetail) return;
  const d = _tdDetail, movie = _tpMovie();
  MSSInfo.addToLibrary({ tmdb_id: Number(_tdId), media_type: _tdType, title: movie ? d.title : d.name,
    year: ((movie ? d.release_date : d.first_air_date) || '').slice(0, 4), poster_url: d.poster_path ? TMDB_FULL + d.poster_path : null },
  { status, details: d, onAdded: entry => { _tdOwnEntry = entry; _tpRedrawHead(); } });
}
// your copy changed (added, removed by Undo): hero, slim bar, tab bar's line and the bar at the bottom
function _tpRedrawHead() {
  const d = _tdDetail, e = _tdOwnEntry, page = _tpEl('tpPage'); if (!page) return;
  const swap = (sel, html) => { const el = page.querySelector(sel); if (el) el.outerHTML = html; };
  swap('#tpHero', _tpHeroHTML(d, e)); swap('#tpMini', _tpMiniHTML(d, e)); swap('.tp-bar', _tpBarHTML(e));
  swap('.tp-tabs .tv-tabs-vis', _tpVisHTML(e));
  _tpBackdrop(page); _tpLoadLike(); _tpScroll();
}

/* ── Will you like it?: your average for each of the title's genres (3+ rated titles each), from your library ── */
async function _tpLoadLike() {
  const box = () => _tpEl('tpLike');
  if (!box() || !_tdUser) return;
  const d = _tdDetail, genres = tmdbGenreNames(d.genres).filter(g => g !== 'Animation' || d.genres.length === 1);
  let rows = [];
  try { rows = (await sb.from('entries').select('id,genres,ratings,final_score,status,tmdb_id,tmdb_type').eq('user_id', _tdUser.id)).data || []; } catch {}
  const mine = rows.filter(x => !(Number(x.tmdb_id) === Number(_tdId) && x.tmdb_type === _tdType)).map(x => ({ g: (x.genres || []).map(s => String(s).toLowerCase()), s: mssCountedScore(x) })).filter(x => x.s != null);
  const all = mine.length ? mine.reduce((a, x) => a + x.s, 0) / mine.length : null;
  const per = genres.map(g => { const sc = mine.filter(x => x.g.includes(g.toLowerCase())).map(x => x.s); return { g, n: sc.length, avg: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null }; }).filter(x => x.n >= 3);
  const el = box(); if (!el) return;
  el.classList.remove('is-loading');
  if (!per.length) {
    el.classList.add('is-thin');
    el.innerHTML = `<h3>Will you like it?</h3><b>Not enough ratings yet</b><p>Rate a few more ${esc(genres.slice(0, 2).join(' or ') || 'similar')} titles and this will tell you.</p>`;
    return;
  }
  const v = per.reduce((a, x) => a + x.avg, 0) / per.length, n = new Set(mine.filter(x => per.some(p => x.g.includes(p.g.toLowerCase())))).size;
  const word = v >= 8 ? 'Most likely' : v >= 7 ? 'Likely' : v >= 6 ? 'Maybe' : 'Probably not';
  el.innerHTML = `<h3>Will you like it?</h3><b class="${v >= 8 ? 'is-most' : ''}">${word}</b>
    <p>You rate ${per.map(x => `${esc(x.g)} <em>${_tpTwo(x.avg)}</em>`).join(' · ')} on average${all != null ? ` (${n} titles), vs <em>${_tpTwo(all)}</em> overall` : ''}.</p>`;
}

/* ══ Friends & this title: who watched it (their score), who's watching, who wants to, who dropped it;
   their average; recommend it. A photo / name opens their profile, the score their entry. ══ */
let _tdFriendEntries = {}, _tdFriendEps = {}, _tpFriendRows = [], _tpFriendsAll = false;
const _tdEpAvg = e => { const r = _tdFriendEps[e.id] || []; return r.length ? r.reduce((a, x) => a + Number(x.score), 0) / r.length : 0; };
async function _tdLoadFriends(title) {
  if (!_tdUser) return;
  let rows = [], profiles = {};
  try {
    const friends = (await getFriendships(_tdUser.id)).filter(f => f.status === 'accepted');
    if (!friends.length) return _tpFriendsEmpty();
    friends.forEach(f => { if (f.friendProfile) profiles[f.friendId] = f.friendProfile; });
    const ids = friends.map(f => f.friendId);
    const cols = 'id,user_id,title,year,cat,status,ratings,final_score,season,episode,watched,total_eps,total_seasons,completed_date,created_at,updated_at,poster_url,genres,notes,note_visibility,tmdb_id,tmdb_type,description';
    const like = String(title || '').replace(/[\\%_]/g, m => '\\' + m);
    const [linked, unlinked] = await Promise.all([
      sb.from('entries').select(cols).in('user_id', ids).eq('tmdb_id', Number(_tdId)).eq('tmdb_type', _tdType),
      like ? sb.from('entries').select(cols).in('user_id', ids).is('tmdb_id', null).ilike('title', like) : { data: [] },
    ]);
    const seen = new Set();
    rows = await mssWithPrivateNotes([...(linked.data || []), ...(unlinked.data || [])].filter(e => !seen.has(e.user_id) && seen.add(e.user_id)));
  } catch (err) { console.error('Friends on this title:', err); return; }
  if (!rows.length) return _tpFriendsEmpty();
  _tdFriendEps = {};
  if (!_tpMovie()) {
    try {
      const { data } = await sb.from('episode_ratings').select('entry_id,season_number,episode_number,score,updated_at').in('entry_id', rows.map(e => e.id)).gt('episode_number', 0);
      (data || []).forEach(r => (_tdFriendEps[r.entry_id] ||= []).push(r));
    } catch (err) { console.error('Friends’ episode ratings:', err); }
  }
  _tdFriendEntries = {};
  rows.forEach(e => { e._profile = profiles[e.user_id] || { id: e.user_id }; _tdFriendEntries[e.id] = e; });
  const order = { completed: 0, ongoing: 0, watching: 1, up_next: 1, paused: 1, queue: 2, dropped: 3 };
  _tpFriendRows = rows.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || (liveScore(b) ?? -1) - (liveScore(a) ?? -1));
  const scores = rows.map(mssCountedScore).filter(v => v != null);   // dropped scores don't count (071)
  _tdFriendAvg = scores.length ? scores.reduce((a, b) => a + Number(b), 0) / scores.length : null;
  _tpFriendsCount = scores.length;
  _tpPaintTiles();
  _tpRenderFriends();
}
let _tpFriendsCount = 0;
function _tpFriendsEmpty() {
  const box = _tpEl('tdFriends'); if (!box) return;
  box.innerHTML = _tpSec('Friends &amp; this title', `<p class="tv-muted">None of your friends have this one yet.</p><div class="tp-friends-foot">${_B('Recommend to friends', 'send', `onclick="_tpRecommend()" aria-haspopup="dialog"`)}</div>`);
}
function _tpFriendRowHTML(e) {
  const p = e._profile, av = safeURL(p.avatar_url), name = p.username || 'friend', sc = liveScore(e), eps = _tdFriendEps[e.id];
  const sub = e.status === 'completed' ? 'Watched' + (e.completed_date ? ' · ' + MSSNote.date(e.completed_date, true) : '')
    : e.status === 'ongoing' ? 'To Be Continued'
    : ['watching', 'paused'].includes(e.status) ? (e.status === 'paused' ? 'Taking a break' : 'Watching') + (!_tpMovie() && (e.season || e.episode) ? ` · S${Number(e.season) || 1} E${Number(e.episode) || 0}` : '')
    : e.status === 'up_next' ? 'Up next'
    : e.status === 'queue' ? 'Wants to watch'
    : e.status === 'dropped' ? 'Dropped' + (mssDroppedAt(e) ? ' at ' + mssDroppedAt(e) : '') : '';
  const epsTxt = eps?.length ? ` · ${eps.length} ep${eps.length === 1 ? '' : 's'} rated` : '';
  const val = sc != null && e.status !== 'dropped'
    ? `<button type="button" class="tp-frow-v" onclick="_tdOpenFriend(${attrJSON(e.id)})" aria-label="@${esc(name)}’s ratings, ${_tpTwo(sc)}"><b class="${mssTierCls(sc).trim()}">${_tpTwo(sc)}</b></button>`
    : eps?.length ? `<button type="button" class="tp-frow-v" onclick="_tdOpenFriendEps(${attrJSON(e.id)})" aria-label="@${esc(name)}’s episode ratings"><span class="eg-show-avg ep-band-${MSSEp.band(_tdEpAvg(e)).key}">${mssR1(_tdEpAvg(e))}</span></button>`
    : `<button type="button" class="tp-frow-v" onclick="_tdOpenFriend(${attrJSON(e.id)})" aria-label="Open @${esc(name)}’s entry">${icon('chevright', 16)}</button>`;
  return `<div class="tp-frow">${mssProfileLinkHTML({ id: e.user_id, username: name }, `<span class="tv-av">${av ? `<img src="${av}" alt="" loading="lazy">` : esc(name[0].toUpperCase())}</span>`)}
    <span class="tp-frow-b">${mssProfileLinkHTML({ id: e.user_id, username: name }, '@' + esc(name))}<small>${esc(sub)}${epsTxt}</small></span>${val}</div>`;
}
function _tpRenderFriends() {
  const box = _tpEl('tdFriends'); if (!box) return;
  const rows = _tpFriendRows, n = rows.length, shown = _tpFriendsAll ? rows : rows.slice(0, 5);
  const want = rows.filter(e => e.status === 'queue').length, seen = rows.filter(e => ['completed', 'ongoing'].includes(e.status)).length;
  box.innerHTML = _tpSec('Friends &amp; this title', `
    ${_tdFriendAvg != null ? `<p class="tp-friends-avg"><b class="${mssTierCls(_tdFriendAvg).trim()}">${_tdFriendAvg.toFixed(2)}</b>friends’ average · ${_tpFriendsCount} rating${_tpFriendsCount === 1 ? '' : 's'}</p>` : ''}
    <div class="tp-friends">${shown.map(_tpFriendRowHTML).join('')}</div>
    <div class="tp-friends-foot">${n > 5 ? _B(_tpFriendsAll ? 'Show fewer' : `Show all ${n}`, '', `onclick="_tpFriendsAll=!_tpFriendsAll;_tpRenderFriends()"`) : ''}${_B('Recommend to friends', 'send', `onclick="_tpRecommend()" aria-haspopup="dialog"`)}</div>`,
    `<small class="tv-muted" style="font-size:12px">${[seen ? `${seen} watched` : '', want ? `${want} want${want === 1 ? 's' : ''} to watch` : ''].filter(Boolean).join(' · ')}</small>`);
}
function _tdOpenFriendEps(id) {
  const e = _tdFriendEntries[id];
  if (!e) return;
  const total = (_tdDetail?.seasons || []).filter(x => x.season_number > 0).reduce((a, x) => a + (x.episode_count || 0), 0) || null;
  MSSEp.showPopup({ title: e.title, poster: mssSharpPoster(e.poster_url) || (_tdDetail?.poster_path ? TMDB_IMG + _tdDetail.poster_path : null), tmdbId: Number(_tdId),
    status: e.status, rows: _tdFriendEps[id], total, userId: e.user_id, whoName: '@' + (e._profile.username || 'friend') });
}
function _tdOpenFriend(id) {
  const e = _tdFriendEntries[id];
  if (!e) return;
  const rated = e.status === 'completed' || e.status === 'ongoing' || e.status === 'dropped' || liveScore(e) != null;
  MSSViews.open(e, { start: rated ? 'rate' : 'info', profile: e._profile });
}

/* ══ Fan favourites on MSF: the most picked episode / season / character (get_title_favorite_picks), each
   matched to TMDB (as before) — compact: the top pick of each kind. ══ */
const _FAN_STOP = new Set('the of and a an in on to my house first her his name queen king lord lady ser sir mr mrs ms dr de la le el von van del da di du jr sr aka'.split(' '));
const _FAN_NUMS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
const _fanNorm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\b[a-z]+\b/g, w => { const i = _FAN_NUMS.indexOf(w); return i > 0 ? String(i) : w; }).trim();
const _fanTokens = t => _fanNorm(t).split(' ').filter(w => w.length > 1 && !_FAN_STOP.has(w));
let _tdFanGroups = [];
function _fanCharacters(d) {
  const chars = [];
  _tpCast(d).forEach((p, order) => {
    const roles = p.roles ? p.roles.map(r => r.character) : [p.character];
    roles.forEach(r => String(r || '').split('/').forEach(raw => {
      const name = raw.replace(/\(.*?\)/g, '').trim();
      const toks = _fanTokens(name);
      if (toks.length && !/^(himself|herself|themselves|self|narrator|voice)$/i.test(name)) chars.push({ key: 'c' + p.id + ':' + toks.join(' '), name, toks, actor: p.name, actorId: p.id, photo: p.profile_path, order });
    }));
  });
  const df = {};
  chars.forEach(c => new Set(c.toks).forEach(t => { df[t] = (df[t] || 0) + 1; }));
  return { chars, df };
}
function _fanMatchCharacter(pick, C) {
  const P = new Set(_fanTokens(pick));
  let best = null, bestScore = 0, tie = false;
  C.chars.forEach(c => {
    const shared = c.toks.filter(t => P.has(t));
    if (!shared.length) return;
    const whole = shared.length === c.toks.length;
    if (!whole && !shared.some(t => C.df[t] === 1)) return;
    const score = shared.reduce((a, t) => a + 1 / C.df[t], 0) + (whole ? 1 : 0);
    if (score > bestScore + 1e-9) { best = c; bestScore = score; tie = false; }
    else if (Math.abs(score - bestScore) < 1e-9 && best && best.actorId !== c.actorId && best.name !== c.name) tie = true;
  });
  return best && !tie ? best : null;
}
const _fanRealSeasons = d => (d.seasons || []).filter(x => x.season_number > 0);
function _fanMatchSeason(pick, d) {
  const t = ' ' + _fanNorm(pick) + ' ', seasons = d.seasons || [];
  const m = t.match(/\b(?:season|series|s|part|book|temporada|saison|staffel)\s*(\d{1,3})\b/) || t.match(/^\s*(\d{1,3})\s*$/);
  if (m && seasons.some(x => x.season_number === +m[1])) return +m[1];
  const named = seasons.filter(x => x.name && !/^(season|specials)\b/i.test(x.name.trim()) || (x.name || '').includes(':'))
    .filter(x => { const n = _fanNorm(String(x.name).split(':').pop()); return n.length >= 4 && (t.includes(' ' + n + ' ') || (n.includes(t.trim()) && t.trim().length >= 4)); });
  return named.length === 1 ? named[0].season_number : null;
}
function _fanEpisodeNumbers(pick, d) {
  const t = _fanNorm(pick);
  let m = t.match(/\bs\s*(\d{1,3})\s*e\s*(\d{1,4})\b/) || t.match(/\b(\d{1,2})\s*x\s*(\d{1,4})\b/)
       || t.match(/\bseason\s*(\d{1,3})\D{0,12}?\b(?:episode|ep|e)\s*(\d{1,4})\b/);
  if (m) return [+m[1], +m[2]];
  m = t.match(/\b(?:episode|ep|e)\s*(\d{1,4})\D{0,12}?\bseason\s*(\d{1,3})\b/);
  if (m) return [+m[2], +m[1]];
  m = t.match(/^(?:episode|ep|e)?\s*(\d{1,4})$/);
  const real = _fanRealSeasons(d);
  if (m && real.length) {
    let n = +m[1];
    if (real.length === 1) return [real[0].season_number, n];
    if (n <= (real[0].episode_count || 0)) return null;
    for (const x of real) { if (n <= x.episode_count) return [x.season_number, n]; n -= x.episode_count; }
  }
  return null;
}
async function _tdLoadFans(d) {
  let rows = [];
  try {
    const { data, error } = await sb.rpc('get_title_favorite_picks', { p_tmdb_id: Number(_tdId), p_tmdb_type: _tdType });
    if (error) throw error;
    rows = data || [];
  } catch (err) { console.error('Fan favorites:', err); return; }
  if (rows.length < 2) return;
  const isTV = !_tpMovie();
  const groups = { episode: {}, season: {}, character: {} };
  const add = (kind, key, item, typed) => {
    const g = groups[kind][key] ||= { ...item, picks: 0, typed: {} };
    g.picks++; g.typed[typed] = (g.typed[typed] || 0) + 1;
  };
  const raw = (kind, pick) => add(kind, 'raw:' + (_fanNorm(pick) || pick.toLowerCase()), { raw: true }, pick.trim());
  const C = _fanCharacters(d);
  rows.filter(r => r.kind === 'character').forEach(r => {
    const c = _fanMatchCharacter(r.pick, C);
    c ? add('character', c.key, { name: c.name, actor: c.actor, actorId: c.actorId, photo: c.photo }, r.pick) : raw('character', r.pick);
  });
  if (isTV) {
    rows.filter(r => r.kind === 'season').forEach(r => {
      const n = _fanMatchSeason(r.pick, d);
      if (n == null) return raw('season', r.pick);
      const x = d.seasons.find(y => y.season_number === n);
      add('season', 's' + n, { season: n, name: mssSeasonLabel(n, x?.name), poster: x?.poster_path, sub: x?.episode_count ? `${x.episode_count} episodes` : '' }, r.pick);
    });
    const epRows = rows.filter(r => r.kind === 'episode');
    const numbered = epRows.map(r => ({ r, n: _fanEpisodeNumbers(r.pick, d) }));
    let eps = null;
    if (numbered.some(x => !x.n)) {
      const all = await _tdFetchSeasons(_tdId, _fanRealSeasons(d).map(x => x.season_number));
      eps = all.flatMap(sx => (sx?.episodes || []).map(ep => ({ s: ep.season_number, e: ep.episode_number, norm: _fanNorm(ep.name) })));
    }
    numbered.forEach(x => {
      if (!x.n && eps) {
        const name = _fanNorm(String(x.r.pick).replace(/^.*?\b\d+\s*[x·.:-]?\s*\d+\s*[-–:·]\s*/i, ''));
        const hit = eps.filter(ep => ep.norm && (ep.norm === name || (name.length >= 5 && ep.norm.length >= 5 && (name.includes(ep.norm) || ep.norm.includes(name)))));
        const exact = hit.filter(ep => ep.norm === name);
        const one = exact.length === 1 ? exact[0] : hit.length === 1 ? hit[0] : null;
        if (one) x.n = [one.s, one.e];
      }
      x.n ? add('episode', `e${x.n[0]}:${x.n[1]}`, { season: x.n[0], episode: x.n[1] }, x.r.pick) : raw('episode', x.r.pick);
    });
  }
  const top = kind => Object.values(groups[kind]).filter(g => g.picks >= 2)
    .sort((a, b) => b.picks - a.picks || (a.raw ? 1 : 0) - (b.raw ? 1 : 0)).slice(0, 10)
    .map(g => g.raw ? { ...g, name: Object.entries(g.typed).sort((a, b) => b[1] - a[1])[0][0] } : g);
  const tabs = [['character', 'Character'], ['episode', 'Episode'], ['season', 'Season']]
    .map(([key, label]) => ({ key, label, items: top(key) })).filter(t => t.items.length);
  if (!tabs.length) return;
  const epTab = tabs.find(t => t.key === 'episode');
  if (epTab) {
    const seasons = await _tdFetchSeasons(_tdId, [...new Set(epTab.items.filter(g => !g.raw).map(g => g.season))]);
    epTab.items.forEach(g => {
      if (g.raw) return;
      const ep = seasons.flatMap(sx => sx?.episodes || []).find(x => x.season_number === g.season && x.episode_number === g.episode);
      Object.assign(g, { name: ep?.name || `Episode ${g.episode}`, still: ep?.still_path, ep });
    });
  }
  _tdFanGroups = tabs;
  const box = _tpEl('tdFans'); if (!box) return;
  box.innerHTML = _tpSec('Fan favourite on MSF', tabs.map(t => _tpFanHTML(t.key, t.label, t.items[0])).join(''));
}
function _tpFanHTML(kind, label, g) {
  const picks = `<span class="tp-fan-n">${g.picks}<small>pick${g.picks === 1 ? '' : 's'}</small></span>`;
  const letter = esc((g.name || '?').trim()[0]?.toUpperCase() || '?');
  const img = (path, cls, size) => `<span class="tp-fan-img${cls}">${path ? `<img src="${TMDB_IMG.replace('w185', size)}${path}" alt="" loading="lazy">` : letter}</span>`;
  if (kind === 'character') {
    const inner = `${img(g.photo, ' is-face', 'w185')}<span class="tp-fan-b"><small>${label}</small><b translate="no">${esc(g.name)}</b>${g.actor ? `<span>${esc(g.actor)}</span>` : ''}</span>${picks}`;
    return g.raw ? `<div class="tp-fan">${inner}</div>` : `<a class="tp-fan" href="person.html?id=${Number(g.actorId)}">${inner}</a>`;
  }
  if (kind === 'season') {
    const inner = `${img(g.poster, '', 'w185')}<span class="tp-fan-b"><small>${label}</small><b translate="no">${esc(g.name)}</b>${g.sub ? `<span>${esc(g.sub)}</span>` : ''}</span>${picks}`;
    return g.raw ? `<div class="tp-fan">${inner}</div>` : `<a class="tp-fan" href="season.html?show=${_tdId}&s=${g.season}" onclick="return _tpOpenSeason(${g.season}, event)">${inner}</a>`;
  }
  const inner = `${img(g.still, ' is-wide', 'w300')}<span class="tp-fan-b"><small>${label}${g.raw ? '' : ` · S${g.season} E${g.episode}`}</small><b translate="no">${esc(g.name)}</b></span>${picks}`;
  return g.raw ? `<div class="tp-fan">${inner}</div>` : `<a class="tp-fan" href="episode.html?show=${_tdId}&s=${g.season}&e=${g.episode}" onclick="return _tpOpenEp(${g.season}, ${g.episode}, event)">${inner}</a>`;
}

/* ══ Related: the movie's collection (in release order) and If you like this (TMDB recommendations, else
   similar titles) — the standard title card; tapping one opens the title panel / page. ══ */
function _tdRowHTML(id, eyebrow, title, items) {
  return `<section class="tv-sec td-related"><div class="tv-sec-h"><h3>${esc(eyebrow)}</h3></div>
      ${title ? `<p class="tv-muted" style="margin:-6px 0 4px;font-size:13px" translate="no">${esc(title)}</p>` : ''}
      ${mssRail(id, items.map(_tdRelCardHTML).join(''))}</section>`;
}
function _tdRelCardHTML(r) {
  const it = _discNormalize(r, r.media_type || _tdType);
  return MSSCard.tmdb(_discCardItem(it), { attrs: _discClickAttr(it) });
}
async function _tdLoadRelated(d) {
  const withPoster = r => r && r.poster_path && String(r.id) !== String(_tdId);
  const col = _tpMovie() ? d.belongs_to_collection : null;
  if (col?.id) {
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/collection/${col.id}?language=en-US`);
      const data = res.ok ? await res.json() : null;
      const parts = (data?.parts || []).filter(withPoster).map(p => ({ ...p, media_type: 'movie' }))
        .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'));
      if (parts.length && _tpEl('tdCollection')) _tpEl('tdCollection').innerHTML = _tdRowHTML('tdCollectionRow', 'Part of the collection', data.name || col.name, parts);
    } catch {}
  }
  let recs = (d.recommendations?.results || []).filter(withPoster);
  if (!recs.length) {
    try {
      const res = await tmdbFetch(`${TMDB_BASE}/${_tdType}/${_tdId}/similar?language=en-US`);
      recs = res.ok ? ((await res.json()).results || []).filter(withPoster) : [];
    } catch { recs = []; }
  }
  recs = recs.map(r => ({ ...r, media_type: r.media_type || _tdType })).slice(0, 18);
  if (recs.length && _tpEl('tdRecs')) _tpEl('tdRecs').innerHTML = _tdRowHTML('tdRecsRow', 'If you like this', '', recs);
}

/* ══ Episodes ══ */
// Your episode scores + MSF community averages (episode-ratings, 031)
let _tdMyEp = {}, _tdCommEp = {}, _tdEpScoresReady = Promise.resolve();
function _tdLoadEpScores() {
  _tdMyEp = {};
  _tdEpScoresReady = (async () => {
    try {
      const { data: comm } = await sb.rpc('get_episode_community', { p_tmdb_id: Number(_tdId) });
      (comm || []).forEach(r => { _tdCommEp[`${r.season_number}:${r.episode_number}`] = r; });
      const e = _tdOwnEntry;
      if (!e) return;
      const { data: mine } = await sb.from('episode_ratings').select('season_number,episode_number,score').eq('entry_id', e.id).gt('episode_number', 0);
      (mine || []).forEach(r => { _tdMyEp[`${r.season_number}:${r.episode_number}`] = Number(r.score); });
    } catch {}
  })();
  return _tdEpScoresReady;
}
const _tpAired = d => !!d && new Date(d + 'T23:59:59') <= new Date();
// Have you watched it? From your progress: everything before where you are (Watched: all that's aired)
function _tpSeen(s, n, airDate) {
  const e = _tdOwnEntry; if (!e) return false;
  if (_tdMyEp[`${s}:${n}`] != null) return true;
  if (e.status === 'completed') return s > 0 && _tpAired(airDate);
  if (['watching', 'paused', 'dropped', 'ongoing'].includes(e.status)) {
    const cs = Number(e.season) || 0, ce = Number(e.episode) || 0;
    return s > 0 && (s < cs || (s === cs && n <= ce));
  }
  return false;
}
// The Seasons & Episodes tab: the seasons as posters (pick one), the season you picked, its episodes
const _tpEps = { on: false, season: null, loaded: {}, rating: null, info: {} };
const _tpTabSeasons = d => (d.seasons || []).filter(s => s.episode_count > 0).sort((a, b) => (a.season_number || 999) - (b.season_number || 999));   // Specials last
const _tpSeasonName = (d, s) => s ? mssSeasonLabel(s, (d.seasons || []).find(x => x.season_number === s)?.name) : 'Specials';
function _tpEpsOpen() {
  const d = _tdDetail, panel = _tpEl('tpPanel-episodes'); if (!panel || _tpEps.on) return;
  _tpEps.on = true;
  const seasons = _tpTabSeasons(d), cur = _tpCurSeason(d);
  if (!seasons.length) { panel.innerHTML = mssEmpty({ compact: true, art: 'episodes', title: 'No episodes yet', text: 'TMDB hasn’t listed any episodes for this show yet.' }); return; }
  const real = seasons.filter(s => s.season_number > 0).length;
  const here = !!_tdOwnEntry && ['watching', 'paused', 'ongoing', 'dropped'].includes(_tdOwnEntry.status);
  panel.innerHTML = `<div class="tv-main tp-se">
    ${_tpSec(`Seasons <span class="tv-tab-n">${real}</span>`, `<div class="tp-srail" role="tablist" aria-label="Seasons">${seasons.map(s => `
      <button type="button" role="tab" class="tp-scard" data-s="${s.season_number}" aria-selected="false" onclick="_tpEpsSeason(${s.season_number})">
        <span class="tp-scard-p">${s.poster_path ? `<img src="${TMDB_IMG.replace('w185', 'w342')}${s.poster_path}" alt="" loading="lazy">` : `<i>${s.season_number || 'SP'}</i>`}${here && s.season_number === cur ? '<em>You’re here</em>' : ''}</span>
        <b translate="no">${esc(_tpSeasonName(d, s.season_number))}</b>
        <small>${s.episode_count} ep${s.episode_count === 1 ? '' : 's'}${s.air_date ? ' · ' + s.air_date.slice(0, 4) : ''}</small>
      </button>`).join('')}</div>`,
      `<div class="tp-links"><a class="td-ep-graph-link" href="season.html?show=${_tdId}&all=seasons">${icon('layers', 14)} View all seasons</a>
        <a class="td-ep-graph-link" href="episodes.html?show=${_tdId}">${icon('episodes', 14)} Episode ratings graph</a></div>`)}
    <section class="tv-sec tp-shead" id="tpSHead" aria-live="polite"></section>
    <section class="tv-sec" id="tpEpList"><div class="tp-loading">Loading episodes…</div></section>
  </div>`;
  _tpEpsSeason(_tpEps.season ?? (seasons.some(s => s.season_number === cur) ? cur : seasons[0].season_number));
}
async function _tpEpsSeason(s) {
  _tpEps.season = s; _tpEps.rating = null;
  document.querySelectorAll('#tpPanel-episodes .tp-scard').forEach(b => { const on = Number(b.dataset.s) === s; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  const list = _tpEl('tpEpList'); if (list) list.innerHTML = '<div class="tp-loading">Loading episodes…</div>';
  await Promise.all([_tpSeasonEps(s), _tdEpScoresReady]);
  if (_tpEps.season !== s) return;
  _tpEpsPaint();
}
// "Jan – Apr 1999" · "Sep 2007 – Jan 2008" · "Jan 10, 1999" (one day)
function _tpRange(a, b) {
  if (!a) return '';
  const m = x => new Date(x + 'T12:00:00'), loc = MSSI18n.locale;
  if (!b || a === b) return _tpDate(a, 'short');
  const A = m(a), B = m(b), mo = d => d.toLocaleDateString(loc, { month: 'short' }), my = d => d.toLocaleDateString(loc, { month: 'short', year: 'numeric' });
  return A.getFullYear() === B.getFullYear() ? `${mo(A)} – ${my(B)}` : `${my(A)} – ${my(B)}`;
}
// the facts of a season: its episodes, when it aired, TMDB's average, yours (in your library)
function _tpSeasonFacts(s, eps) {
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const dates = eps.map(x => x.air_date).filter(Boolean).sort();
  const tmdb = avg(eps.map(x => x.vote_average).filter(Boolean)), mine = avg(eps.map((x, i) => _tdMyEp[`${s}:${i + 1}`]).filter(v => v != null));
  const seen = _tdOwnEntry ? eps.filter((x, i) => _tpSeen(s, i + 1, x.air_date)).length : null;
  return { n: eps.length, from: dates[0], to: dates[dates.length - 1], tmdb, mine, seen, runtime: eps.reduce((a, x) => a + (x.runtime || 0), 0) };
}
function _tpSHeadHTML(s, eps) {
  const d = _tdDetail, sn = _tpEps.info[s] || {}, row = (d.seasons || []).find(x => x.season_number === s) || {}, f = _tpSeasonFacts(s, eps);
  const real = _tpTabSeasons(d).filter(x => x.season_number > 0).length;
  const range = _tpRange(f.from, f.to);
  const hours = f.runtime ? (f.runtime >= 60 ? `${Math.floor(f.runtime / 60)}h ${f.runtime % 60}m` : `${f.runtime}m`) : '';
  const tiles = [['Episodes', String(f.n)], ['Aired', range, 'is-text'], ['Runtime', hours], ['TMDB avg', f.tmdb != null ? mssR1(f.tmdb) : ''],
    ...(_tdOwnEntry && s > 0 ? [['Your avg', f.mine != null ? mssR1(f.mine) : '—', 'is-mine'], ['Watched', `${f.seen} of ${f.n}`]] : [])].filter(t => t[1]);
  const poster = sn.poster_path || row.poster_path, overview = sn.overview || row.overview;
  return `<div class="tp-shead-in">
    <button type="button" class="tp-shead-p" onclick="_tpOpenSeason(${s})" aria-label="About ${esc(_tpSeasonName(d, s))}">${poster ? `<img src="${TMDB_IMG.replace('w185', 'w342')}${poster}" alt="" loading="lazy">` : ''}</button>
    <div class="tp-shead-b">
      <small class="tp-eyebrow">${s ? `Season ${s} of ${real}` : 'Extras'}</small>
      <h3 translate="no">${esc(_tpSeasonName(d, s))}</h3>
      ${overview ? `<p class="tp-shead-o" translate="no">${esc(overview)}</p>` : ''}
      <div class="tp-stiles">${tiles.map(([l, v, c]) => `<div class="tp-stile${c ? ' ' + c : ''}"><small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div>
      <div class="tp-shead-a">
        <button type="button" class="tv-btn is-main" onclick="_tpOpenSeason(${s})">${icon('info', 16)}<span>About this season</span></button>
        <a class="tv-btn" href="season.html?show=${_tdId}&s=${s}">${icon('layers', 16)}<span>Season page</span></a>
      </div>
    </div></div>`;
}
function _tpEpsPaint() {
  const s = _tpEps.season, eps = _tpEps.loaded[s] || [];
  const head = _tpEl('tpSHead'), list = _tpEl('tpEpList'); if (!head || !list) return;
  head.innerHTML = _tpSHeadHTML(s, eps);
  list.innerHTML = `<div class="tv-sec-h"><h3>Episodes <span class="tv-tab-n">${eps.length}</span></h3><a class="td-ep-graph-link" href="season.html?show=${_tdId}&all=episodes">${icon('list', 14)} View all episodes</a></div>`
    + (eps.length ? `<div class="tp-eps">${eps.map((ep, i) => _tpEpRowHTML(ep, s, i + 1)).join('')}</div>` : '<p class="tv-muted">No episode data for this season yet.</p>');
}

/* ── A season or an episode opens in a side panel first (a full page on phones); View full page → its page.
   Ctrl / ⌘-click or a middle click still opens the page in a new tab. ── */
const _tpNewTab = ev => !!ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1);
async function _tpSeasonEps(s) {
  if (_tpEps.loaded[s]) return _tpEps.loaded[s];
  const season = await _tdFetchSeason(_tdId, s);
  _tpEps.info[s] = season || {};
  return (_tpEps.loaded[s] = (season?.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number));
}
async function _tpOpenSeasonAsync(s) {
  await mssLoadScript('js/panel.js');
  const d = _tdDetail, [eps] = await Promise.all([_tpSeasonEps(s), _tdEpScoresReady]);
  const sn = _tpEps.info[s] || {}, row = (d.seasons || []).find(x => x.season_number === s) || {}, f = _tpSeasonFacts(s, eps);
  const poster = sn.poster_path || row.poster_path, overview = sn.overview || row.overview;
  const tiles = [['Episodes', String(f.n)], ['TMDB average', f.tmdb != null ? mssR1(f.tmdb) : ''],
    ...(_tdOwnEntry && s > 0 ? [['Your average', f.mine != null ? mssR1(f.mine) : '—'], ['Watched', `${f.seen} of ${f.n}`]] : [])].filter(t => t[1]);
  const body = `<div class="tp-pn-tiles">${tiles.map(([l, v]) => `<div class="tv-tile"><small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div>
    ${overview ? `<p class="ep-popup-overview" translate="no">${esc(overview)}</p>` : ''}
    <h3 class="tp-pn-h">Episodes</h3>
    <ul class="lyr-rows">${eps.map((ep, i) => mssRowHTML({ img: ep.still_path ? TMDB_IMG.replace('w185', 'w300') + ep.still_path : null, title: `E${i + 1} · ${ep.name}`,
      sub: [ep.vote_average ? `★ ${_discFloorScore(ep.vote_average)} TMDB` : '', _tdMyEp[`${s}:${i + 1}`] != null ? `You ${mssR1(_tdMyEp[`${s}:${i + 1}`])}` : '', ep.runtime ? `${ep.runtime} min` : '', _tpDate(ep.air_date, 'short')].filter(Boolean).join(' · '),
      tag: _tpSeen(s, i + 1, ep.air_date) ? 'Watched' : '', attrs: `onclick="_tpOpenEp(${s}, ${i + 1})"` })).join('')}</ul>`;
  MSSPanel.open({ size: 'L', kind: 'title', backdrop: _tdOwnEntry || { type: 'tv', id: _tdId }, tallHero: true, poster: poster ? TMDB_IMG + poster : null,
    title: _tpSeasonName(d, s), subtitle: [d.name, f.from ? f.from.slice(0, 4) : ''].filter(Boolean).join(' · '), body,
    footer: { primary: { label: 'View full page', lead: icon('layers', 16), onClick: () => { location.href = `season.html?show=${_tdId}&s=${s}`; } } } });
}
function _tpOpenSeason(s, ev) {
  if (_tpNewTab(ev)) return true;
  _tpOpenSeasonAsync(s);
  return false;
}
async function _tpOpenEpAsync(s, pos) {
  await mssLoadScript('js/panel.js');
  const d = _tdDetail, [eps] = await Promise.all([_tpSeasonEps(s), _tdEpScoresReady]);
  if (!eps[pos - 1]) return;
  let h = null;
  const show = (i, from) => {
    const ep = eps[i], p = i + 1, k = `${s}:${p}`, mine = _tdMyEp[k], comm = _tdCommEp[k], tmdb = ep.vote_average ? _discFloorScore(ep.vote_average) : null;
    const aired = _tpAired(ep.air_date), seen = _tpSeen(s, p, ep.air_date), canRate = !!_tdOwnEntry && s > 0 && aired && seen && MSSEp.isShow(_tdOwnEntry);
    _tdPopupEp = { ep, pos: p, s };
    const href = `episode.html?show=${_tdId}&s=${s}&e=${p}`;
    const o = { title: ep.name, subtitle: `${_tpSeasonName(d, s)} · Episode ${p}`, media: ep.still_path ? `${TMDB_IMG.replace('w185', 'w780')}${ep.still_path}` : null,
      body: `<div class="ep-popup-meta-row">
          ${seen ? `<span class="tp-pn-seen">${icon('check', 13)} Watched</span>` : ''}
          ${mine != null ? `<span class="eg-chip ep-band-${MSSEp.band(mine).key}">${mssR1(mine)}<small>You</small></span>` : ''}
          ${tmdb ? `<span class="ep-popup-rating">★ ${tmdb} TMDB</span>` : ''}
          ${comm ? `<span class="ep-popup-rating">MSF ${mssR1(Number(comm.avg_score))}</span>` : ''}
          ${ep.runtime ? `<span class="w-ep-badge">${ep.runtime} min</span>` : ''}
          ${ep.air_date ? `<span>${aired ? '' : 'Airs '}${esc(_tpDate(ep.air_date))}</span>` : ''}
        </div>
        <div class="ep-popup-overview" translate="no">${esc(ep.overview) || mssT('No description available.')}</div>`,
      footer: { stack: eps.length > 1, secondary: [
          ...(canRate ? [{ label: 'Rate', lead: icon('ratingStar', 16), onClick: x => { x.closeNow?.(); MSSEp.rate(_tdOwnEntry, s, p, { onSaved: () => _tpEpRefresh() }); } }] : []),
          ...(_tdUser ? [{ label: 'Friends’ Chat', lead: icon('comment', 16), onClick: () => _tdEpChat() }] : []),
          ...(eps.length > 1 ? [{ label: 'Previous episode', icon: 'chevleft', end: true, disabled: i === 0, onClick: () => show(i - 1, 'prev') },
                               { label: 'Next episode', icon: 'chevright', end: true, disabled: i === eps.length - 1, onClick: () => show(i + 1, 'next') }] : [])],
        primary: { label: 'View full page', lead: icon('episodes', 16), onClick: () => { location.href = href; } } } };
    if (!h) { h = MSSPanel.open({ size: 'L', kind: 'title', ...o }); return; }
    h.setTitle(o.title, o.subtitle); h.setMedia(o.media); h.setBody(o.body); h.setFooter(o.footer);
    h.body.closest('.lyr-body').scrollTop = 0;
    const btns = [...h.body.closest('.lyr-card').querySelectorAll('.lyr-foot button')].filter(b => /Previous episode|Next episode/.test(b.getAttribute('aria-label') || ''));
    const want = btns[from === 'next' ? 1 : 0];
    (want && !want.disabled ? want : btns.find(b => !b.disabled))?.focus();
  };
  show(pos - 1);
}
function _tpOpenEp(s, pos, ev) {
  if (_tpNewTab(ev)) return true;
  _tpOpenEpAsync(s, pos);
  return false;
}
let _tdPopupEp = null;
// Episode chat (episode-chat.js) — friends-only, unlocks once you've watched it
function _tdEpChat() {
  if (!_tdPopupEp) return;
  const { ep, pos, s } = _tdPopupEp;
  MSSEpChat.open({ tmdb_id: Number(_tdId), season: s, episode: pos, show: _tdDetail?.name, name: ep.name, poster_path: _tdDetail?.poster_path });
}
function _tpEpRowHTML(ep, s, pos) {
  const k = `${s}:${pos}`, mine = _tdMyEp[k], tmdb = ep.vote_average ? Number(mssR1(ep.vote_average)) : null;
  const seen = _tpSeen(s, pos, ep.air_date), aired = _tpAired(ep.air_date);
  // only an episode you've watched (owner, Season & Episode redesign: never rate before watching)
  const canRate = !!_tdOwnEntry && s > 0 && aired && seen && typeof MSSEp !== 'undefined' && MSSEp.isShow(_tdOwnEntry);
  const band = v => 'ep-band-' + MSSEp.band(v).key;
  // three scores side by side, as on the Episodes page: yours (or Rate), MSF's, TMDB's — never an empty "You" box
  const comm = _tdCommEp[k], msf = comm ? Number(comm.avg_score) : null;
  const chip = (v, label, title) => v != null ? `<div class="eg-chip ${band(v)}" title="${esc(title)}">${mssR1(v)}<small>${label}</small></div>`
    : `<div class="eg-chip tp-chip-none" title="${esc(title)}">—<small>${label}</small></div>`;
  const you = mine != null
    ? (canRate ? `<button type="button" class="eg-chip ${band(mine)}" onclick="_tpRateOpen(${s}, ${pos})" aria-label="Your rating ${mssR1(mine)} — change it">${mssR1(mine)}<small>You</small></button>`
               : `<div class="eg-chip ${band(mine)}" title="Your rating">${mssR1(mine)}<small>You</small></div>`)
    : canRate ? `<button type="button" class="eg-chip tp-chip-rate" onclick="_tpRateOpen(${s}, ${pos})" aria-label="Rate episode ${pos}">+<small>Rate</small></button>` : '';
  const scores = you + chip(msf, 'MSF', comm ? `MyScreenFolio average · ${comm.rating_count} rating${comm.rating_count == 1 ? '' : 's'}` : 'No MyScreenFolio ratings yet')
    + chip(tmdb, 'TMDB', ep.vote_count ? `TMDB · ${Number(ep.vote_count).toLocaleString(MSSI18n.locale)} votes` : 'TMDB');
  const meta = [ep.runtime ? `<span class="tp-ep-tag">${icon('clock', 12)}${ep.runtime} min</span>` : '',
    ep.air_date ? `<span class="tp-ep-tag${aired ? '' : ' is-soon'}">${icon('calendar', 12)}${aired ? '' : 'Airs '}${esc(_tpDate(ep.air_date, 'short'))}</span>` : ''].filter(Boolean).join('');
  return `<div class="tp-ep" id="tpEp-${s}-${pos}">
    <a class="tp-ep-link" href="episode.html?show=${_tdId}&s=${s}&e=${pos}" onclick="return _tpOpenEp(${s}, ${pos}, event)" aria-label="Episode ${pos}: ${esc(ep.name)}"></a>
    <div class="tp-ep-still">${ep.still_path ? `<img src="${TMDB_IMG.replace('w185', 'w300')}${ep.still_path}" alt="" loading="lazy">` : ''}
      ${seen ? `<span class="tp-ep-seen" title="Watched">${icon('check', 12)}<span>Watched</span></span>` : ''}</div>
    <div class="tp-ep-b">
      <div class="tp-ep-h"><span class="tp-ep-n" title="Episode ${pos}${ep.episode_number !== pos ? ` (#${ep.episode_number} on TMDB)` : ''}">E${pos}</span><p class="tp-ep-t" translate="no">${esc(ep.name)}</p></div>
      ${ep.overview ? `<p class="tp-ep-d" translate="no">${esc(ep.overview)}</p>` : `<p class="tp-ep-d is-none">No description yet.</p>`}
      ${meta ? `<div class="tp-ep-m">${meta}</div>` : ''}</div>
    <div class="tp-ep-r">${scores}</div>
  </div>${_tpEps.rating && _tpEps.rating.s === s && _tpEps.rating.n === pos ? _tpRateHTML() : ''}`;
}
// Rate in place: a slider and Save, right under the episode (no pop-up). Tags and notes: More → Rate episodes.
function _tpRateOpen(s, n) {
  const ep = (_tpEps.loaded[s] || [])[n - 1];
  const start = _tdMyEp[`${s}:${n}`] ?? (ep?.vote_average ? Math.min(10, Math.max(1, Math.round(ep.vote_average * 10) / 10)) : 8);
  _tpEps.rating = { s, n, v: start, had: _tdMyEp[`${s}:${n}`] != null };
  _tpEpsPaint();
  const r = document.querySelector('.tp-rate input[type=range]'); r?.focus();
}
function _tpRateHTML() {
  const r = _tpEps.rating, v = r.v;
  return `<div class="tp-rate" role="group" aria-label="Rate episode ${r.n}">
    <span class="tp-rate-v ep-band-${MSSEp.band(v).key}" id="tpRateV">${mssR1(v)}</span>
    <input type="range" min="1" max="10" step="0.1" value="${v}" aria-label="Your rating for episode ${r.n}" oninput="_tpRateSlide(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();_tpRateSave()}else if(event.key==='Escape'){_tpRateClose()}">
    <div class="tp-rate-acts">
      <button type="button" class="tv-btn is-main" onclick="_tpRateSave()">${icon('check', 16)}<span>Save</span></button>
      <button type="button" class="tv-btn" onclick="_tpRateClose()">Cancel</button>
      <button type="button" class="tv-btn" onclick="_tpRateMore()" title="Tags and a note">More…</button>
    </div></div>`;
}
function _tpRateSlide(v) {
  const r = _tpEps.rating; if (!r) return;
  r.v = Math.round(Number(v) * 10) / 10;
  const el = _tpEl('tpRateV'); if (el) { el.textContent = mssR1(r.v); el.className = 'tp-rate-v ep-band-' + MSSEp.band(r.v).key; }
}
function _tpRateClose() { const r = _tpEps.rating; _tpEps.rating = null; _tpEpsPaint(); if (r) document.querySelector(`#tpEp-${r.s}-${r.n} .tp-ep-r button`)?.focus(); }
async function _tpRateSave() {
  const r = _tpEps.rating, e = _tdOwnEntry; if (!r || !e) return;
  const btn = document.querySelector('.tp-rate .is-main'); if (btn) btn.disabled = true;
  const row = await MSSEp.quick(e, r.s, r.n, r.v, { onSaved: () => _tpEpRefresh() });
  if (!row) { if (btn) btn.disabled = false; return; }
  _tdMyEp[`${r.s}:${r.n}`] = Number(row.score);
  _tpEps.rating = null;
  _tpEpsPaint();
}
function _tpRateMore() {
  const r = _tpEps.rating, e = _tdOwnEntry; if (!r || !e) return;
  _tpEps.rating = null; _tpEpsPaint();
  MSSEp.rate(e, r.s, r.n, { onSaved: () => _tpEpRefresh() });
}
// your episode ratings changed (saved elsewhere, Undo) → the chart, the rows and the Overview's cards
async function _tpEpRefresh() {
  await _tdLoadEpScores();
  if (_tpEps.on) _tpEpsPaint();
}

/* ══ Where to watch (TMDB watch/providers — data by JustWatch), one country at a time (unchanged) ══ */
const _wtwCountry = c => { try { return new Intl.DisplayNames([MSSI18n.locale.split('-u-')[0], 'en'], { type: 'region' }).of(c) || c; } catch { return c; } };
let _wtwRegion = null;
function _tdWtw(d, region) {
  const all = d['watch/providers']?.results || {};
  const isMovie = _tpMovie();
  const rels = isMovie ? (d.release_dates?.results || []) : [];
  const day = v => new Date(String(v).slice(0, 10) + 'T00:00:00');
  const theatreOf = c => (rels.find(x => x.iso_3166_1 === c)?.release_dates || []).filter(x => x.type === 3 || x.type === 2).map(x => day(x.release_date)).sort((a, b) => a - b)[0];
  const regions = [...new Set([...Object.keys(all), ...rels.filter(x => theatreOf(x.iso_3166_1)).map(x => x.iso_3166_1)])];
  const r = region || _wtwRegion || MSSRegion.guess().find(x => regions.includes(x)) || regions[0] || MSSRegion.guess()[0];
  const p = all[r] || {};
  const groups = [['flatrate', 'Stream'], ['free', 'Free'], ['ads', 'With ads'], ['rent', 'Rent'], ['buy', 'Buy']]
    .map(([k, label]) => ({ label, items: (p[k] || []).slice().sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99)) }))
    .filter(g => g.items.length);
  let cinema = null;
  const theatre = isMovie ? theatreOf(r) : null;
  if (theatre) {
    const digital = (rels.find(x => x.iso_3166_1 === r)?.release_dates || []).filter(x => x.type === 4).map(x => day(x.release_date)).sort((a, b) => a - b)[0];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = (today - theatre) / 864e5;
    cinema = { date: theatre, state: days < 0 ? 'soon' : (days <= 75 && !(digital && digital <= today)) ? 'now' : 'past' };
  }
  const seen = new Set(), logos = [];
  groups.forEach(g => g.items.forEach(i => { if (i.logo_path && !seen.has(i.provider_id) && logos.length < 3) { seen.add(i.provider_id); logos.push(i.logo_path); } }));
  return { region: r, regions, groups, cinema, logos, any: regions.length > 0 };
}
let _tdWtwPanel = null;
const _wtwFlag = c => /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 0x1F1A5 + ch.charCodeAt(0))) : '';
function _tdRenderWtw(region) {
  const d = _tdDetail, w = _tdWtw(d, region), isMovie = _tpMovie();
  const loc = MSSI18n.locale;
  const en = c => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c); } catch { return c; } };
  const title = isMovie ? d.title : d.name;
  const year = ((isMovie ? d.release_date : d.first_air_date) || '').slice(0, 4);
  const h = _tdWtwPanel; if (!h) return;
  h.setTitle(title, `Where to watch${year ? ` · ${year} · ${isMovie ? 'Movie' : 'TV Show'}` : ''}`);
  const c = w.cinema;
  let ticket = '';
  if (c) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((c.date - today) / 864e5);
    let rel = '';
    try { rel = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' }).format(days, 'day'); } catch {}
    const weekday = c.date.toLocaleDateString(loc, { weekday: 'long' });
    const head = c.state === 'now' ? `<span class="wtw-live" aria-hidden="true"></span>${esc(mssT('Now in cinemas'))}` : c.state === 'soon' ? esc(mssT('Coming to cinemas')) : esc(mssT('Was in cinemas'));
    const sub = c.state === 'soon' ? `${weekday}${days <= 60 && rel ? ' · ' + rel : ''}`
      : c.state === 'now' ? mssT('Opened {0}', rel || c.date.toLocaleDateString(loc, { month: 'long', day: 'numeric' }))
      : c.date.toLocaleDateString(loc, { month: 'long', day: 'numeric', year: 'numeric' });
    ticket = `<div class="wtw-ticket${c.state === 'past' ? ' past' : ''}">
        <div class="wtw-stub" aria-hidden="true"><div class="wtw-stub-month">${esc(c.date.toLocaleDateString(loc, { month: 'short' }))}</div><div class="wtw-stub-day">${c.date.getDate()}</div><div class="wtw-stub-year">${c.date.getFullYear()}</div></div>
        <div class="wtw-ticket-main"><div class="wtw-ticket-title">${head}</div><div class="wtw-ticket-sub">${esc(sub)}</div>
          <span class="sr-only">${esc(c.date.toLocaleDateString(loc, { month: 'long', day: 'numeric', year: 'numeric' }))}</span></div></div>`;
  }
  const tile = i => `<div class="wtw-provider">${i.logo_path ? `<img src="${TMDB_IMG.replace('w185', 'w154')}${i.logo_path}" alt="" loading="lazy">` : `<b class="wtw-provider-letter">${esc((i.provider_name || '?')[0])}</b>`}<span translate="no">${esc(i.provider_name)}</span></div>`;
  const NOTE = { Stream: 'with a subscription', Free: 'no account needed', 'With ads': 'free with ads', Rent: 'pay per view', Buy: 'yours to keep' };
  const groups = w.groups.map(g => `<section class="wtw-group" aria-label="${g.label}"><div class="wtw-group-title">${g.label}<small>${NOTE[g.label] || ''}</small></div>
      <div class="wtw-grid">${g.items.map(tile).join('')}</div></section>`).join('');
  const country = _wtwCountry(w.region);
  h.setBody(`<div class="wtw-where" id="wtwCountryPick"></div>` + ticket + (groups || `<div class="wtw-empty">${icon('tv', 26)}
      <b>${esc(c && c.state !== 'past' ? mssT('Not streaming yet') : mssT('Not streaming in {0}', country))}</b>
      <span>${esc(c && c.state !== 'past' ? mssT('Streaming services usually add it a few weeks after the cinema run.') : mssT('Try another country, or check back later.'))}</span></div>`)
    + `<p class="lyr-hint wtw-credit">Streaming info from JustWatch, via TMDB. It changes often.</p>`);
  const items = [...new Set([...w.regions, w.region])].map(code => ({ value: code, label: `${_wtwFlag(code)}  ${_wtwCountry(code)}`, keys: [code, en(code), _wtwCountry(code)] }))
    .sort((a, b) => _wtwCountry(a.value).localeCompare(_wtwCountry(b.value)));
  MSSPicker.mount(_tpEl('wtwCountryPick'), { id: 'wtwCountry', label: 'Country', value: w.region, search: 'Search countries…', groups: [{ items }], onChange: _tdSetWtwRegion });
}
function _tdSetWtwRegion(c) {
  _wtwRegion = c;
  try { localStorage.setItem(MSSRegion.KEY, c); } catch {}
  _tdRenderWtw(c);
  _tpEl('wtwCountry')?.focus({ preventScroll: true });
}
async function _tdOpenWtw() {
  if (!_tdDetail) return;
  await mssLoadScript('js/panel.js');
  const d = _tdDetail;
  const h = MSSPanel.open({ size: 'S', kind: 'title', backdrop: _tdOwnEntry || { type: _tdType, id: _tdId }, tallHero: true, poster: d.poster_path ? TMDB_IMG + d.poster_path : null, title: '', body: '',
    onClose: () => { if (_tdWtwPanel === h) _tdWtwPanel = null; } });
  _tdWtwPanel = h;
  _tdRenderWtw();
}

/* ══ Community: Notes (get_notes_for_title) and Lists (get_lists_for_title), four of each, two by two;
   Read more → the Notes / Lists page with this title filtered. The Notes and Lists cards are those pages' own. ══ */
let _tdNotesRaw = [], _tdNotesReactions = {}, _tdNotesSort = 'popular', _tpCommN = { notes: null, lists: null };
const TD_SHOW = 4, TD_LISTS = 3;   // notes: four, two by two · lists: one row of three, as on the Lists page
function _tpCommCount() {
  const el = _tpEl('tpTabN-community'); if (!el) return;
  const n = (_tpCommN.notes || 0) + (_tpCommN.lists || 0);
  el.textContent = n || ''; el.hidden = !n;
}
function _tdSetNotesSort(mode) {
  _tdNotesSort = mode;
  document.querySelectorAll('.td-notes-sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === mode));
  _tdRenderNotes();
}
async function _tdLoadNotes() {
  const wrap = _tpEl('tdNotesList');
  if (!wrap) return;
  try {
    const { data, error } = await sb.rpc('get_notes_for_title', { p_tmdb_id: Number(_tdId), p_tmdb_type: _tdType });
    if (error) throw error;
    _tdNotesRaw = data || [];
    // each note shows the poster its writer picked for the title (their entry's poster_url), not TMDB's default.
    // These notes are all on titles visible to anyone, so their entries can be read directly.
    if (_tdNotesRaw.length) {
      const { data: pics } = await sb.from('entries').select('id, poster_url').in('id', _tdNotesRaw.map(n => n.entry_id)).then(r => r, () => ({}));
      const by = {}; (pics || []).forEach(p => { if (safeURL(p.poster_url)) by[p.id] = p.poster_url; });
      _tdNotesRaw.forEach(n => { if (by[n.entry_id]) n.poster_url = by[n.entry_id]; });
    }
    if (_tdUser && _tdNotesRaw.length) {
      const { data: myReactions } = await sb.from('note_reactions').select('entry_id, is_like').eq('user_id', _tdUser.id).in('entry_id', _tdNotesRaw.map(n => n.entry_id));
      _tdNotesReactions = {};
      (myReactions || []).forEach(r => { _tdNotesReactions[r.entry_id] = r.is_like ? 'like' : 'dislike'; });
    }
    _tdRenderNotes();
    _tdNoteLink();
  } catch (err) {
    console.error('Load notes error:', err);
    wrap.innerHTML = '<div class="td-notes-empty">Couldn\'t load notes right now.</div>';
  }
}
// A notification about a note (066) links here with &note=<entry id> → open the note, once
function _tdNoteLink() {
  const url = new URL(location.href), note = url.searchParams.get('note');
  if (!note) return;
  url.searchParams.delete('note');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  const n = _tdNotesRaw.find(x => x.entry_id === note);
  if (!n) { showToast('That note isn’t here anymore.', 'err'); return; }
  _tpTab('community', false);
  _tdOpenNote(n.entry_id);
}
function _tpReadMore(page, total, what, shown = TD_SHOW) {
  if (!total) return '';
  const q = new URLSearchParams({ view: 'community', tmdb: _tdId, type: _tdType, t: _tdDetail?.title || _tdDetail?.name || '' });
  return `<div class="tp-more"><a class="tv-btn" href="${page}?${esc(q.toString())}">Read more${total > shown ? ` <span class="tv-tab-n">${total}</span>` : ''} <span aria-hidden="true">→</span></a></div>`;
}
function _tdRenderNotes() {
  const wrap = _tpEl('tdNotesList');
  if (!wrap) return;
  const count = _tpEl('tdNotesCount');
  if (count) count.textContent = _tdNotesRaw.length || '';
  _tpCommN.notes = _tdNotesRaw.length; _tpCommCount();
  if (!_tdNotesRaw.length) {
    wrap.innerHTML = mssEmpty({ compact: true, art: 'notes', title: 'No notes yet', text: 'Nobody’s said anything about this one. Rate it and leave the first note.' });
    return;
  }
  const sorted = [..._tdNotesRaw].sort((a, b) => {
    if (_tdNotesSort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (_tdNotesSort === 'least_popular') { const dA = Number(a.dislike_count), dB = Number(b.dislike_count); return dB !== dA ? dB - dA : new Date(b.created_at) - new Date(a.created_at); }
    const sA = Number(a.like_count) - Number(a.dislike_count), sB = Number(b.like_count) - Number(b.dislike_count);
    return sB !== sA ? sB - sA : new Date(b.created_at) - new Date(a.created_at);
  });
  const d = _tdDetail || {}, info = {
    title: d.title || d.name || '', poster_url: d.poster_path ? TMDB_IMG + d.poster_path : null,
    cat: _tpMovie() ? 'movies' : 'tv', tmdb_id: Number(_tdId), tmdb_type: _tdType,
    genres: tmdbGenreNames(d.genres), year: (d.release_date || d.first_air_date || '').slice(0, 4),
  };
  wrap.innerHTML = `<div class="nc-grid">${sorted.slice(0, TD_SHOW).map(n => MSSNote.cardHTML({ ...info, ...n },
    { open: `_tdOpenNote(${attrJSON(n.entry_id)})`, author: n, blur: n.user_id !== _tdUser?.id, react: { mine: _tdNotesReactions[n.entry_id], fn: '_tdReactToNote' }, replies: '_tdNoteReplies' })).join('')}</div>`
    + _tpReadMore('notes.html', sorted.length, 'notes');
}
function _tdNoteReplies(entryId) { _tdOpenNote(entryId, 'comments'); }
function _tdOpenNote(entryId, start = 'note') {
  const n = _tdNotesRaw.find(x => x.entry_id === entryId);
  if (!n) return;
  const own = !!_tdUser && n.user_id === _tdUser.id;
  MSSViews.open({ ...n, id: n.entry_id }, {
    start, note: true, own, from: location.pathname.split('/').pop() + location.search,
    profile: { id: n.user_id, username: n.username, avatar_url: n.avatar_url },
    counts: { like: Number(n.like_count) || 0, dislike: Number(n.dislike_count) || 0 },
    onReact: st => { n.like_count = st.like; n.dislike_count = st.dislike; if (st.mine) _tdNotesReactions[entryId] = st.mine; else delete _tdNotesReactions[entryId]; _tdRenderNotes(); },
    onNoteSaved: () => _tdLoadNotes(),
    onDelete: () => _tdLoadNotes(),
  });
}
function _tdReactToNote(entryId, isLike) {
  const n = _tdNotesRaw.find(x => x.entry_id === entryId);
  if (!n) return;
  mssReactFeed('note', entryId, isLike,
    () => ({ like: n.like_count, dislike: n.dislike_count, mine: _tdNotesReactions[entryId] || null }),
    st => { n.like_count = st.like; n.dislike_count = st.dislike; if (st.mine) _tdNotesReactions[entryId] = st.mine; else delete _tdNotesReactions[entryId]; _tdRenderNotes(); });
}
let _tdLists = [], _tdListMap = {};
const _tdListItem = id => MSSList.isTmdbId(id) ? MSSList.tmdb(id) : _tdListMap[id] || null;
async function _tdLoadLists() {
  const box = _tpEl('tdLists');
  if (!box) return;
  try {
    const { data, error } = await sb.rpc('get_lists_for_title', { p_tmdb_id: Number(_tdId), p_tmdb_type: _tdType });
    if (error) throw error;
    _tdLists = data || [];
    _tpCommN.lists = _tdLists.length; _tpCommCount();
    const c = _tpEl('tdListsCount'); if (c) c.textContent = _tdLists.length || '';
    if (!_tdLists.length) { box.innerHTML = mssEmpty({ compact: true, art: 'watchlist', title: 'Not in any lists yet', text: 'When people add it to a public list, the lists show here.' }); return; }
    const ids = [...new Set(_tdLists.slice(0, TD_LISTS).flatMap(l => (l.items || []).slice(0, 8)))].filter(id => !MSSList.isTmdbId(id));
    if (ids.length) ((await sb.from('entries').select('*').in('id', ids)).data || []).forEach(e => { _tdListMap[e.id] = e; });
    _tdRenderLists();
    if (await MSSList.hydrate(_tdLists.slice(0, TD_LISTS), 8)) _tdRenderLists();
  } catch (err) { console.error('Lists for title:', err); box.innerHTML = '<div class="td-notes-empty">Couldn’t load lists right now.</div>'; }
}
function _tdRenderLists() {
  const box = _tpEl('tdLists');
  if (!box) return;
  box.innerHTML = `<div class="lc-grid td-lists">${_tdLists.slice(0, TD_LISTS).map(l => MSSList.cardHTML(l, {
      resolve: _tdListItem, open: `location.href=${attrJSON(MSSList.url(l))}`, own: !!_tdUser && l.user_id === _tdUser.id,
      ownerHTML: MSSList.ownerHTML({ username: l.username, avatar_url: l.avatar_url }),
      extra: l.ranked && l.pos ? `<span class="td-list-pos">#${l.pos} in this list</span>` : '',
    })).join('')}</div>${_tpReadMore('lists.html', _tdLists.length, 'lists', TD_LISTS)}`;
}

/* ── Loading skeleton: this page's own hero, tabs and Overview drawn with a sample title, masked by mssSkeleton ── */
mssSkeleton.define('title', () => {
  const tv = new URLSearchParams(location.search).get('type') !== 'movie';
  const was = { type: _tdType, user: _tdUser, title: document.title };
  _tdType = tv ? 'tv' : 'movie';
  const people = Array.from({ length: 10 }, () => ({ id: 0, name: 'Actor name', character: 'Character name', roles: [{ character: 'Character name' }] }));
  const d = { title: 'Sample title here', name: 'Sample title here', release_date: '2024-01-01', first_air_date: '2024-01-01', tagline: 'A sample tagline for the title',
    vote_average: 7.6, vote_count: 12345, genres: [{ name: 'Drama' }, { name: 'Thriller' }], runtime: 128, number_of_seasons: 3, number_of_episodes: 30, status: 'Ended',
    overview: 'A sample overview long enough to wrap onto a few lines, the way a real description of a film or a show does on this page while it loads from TMDB.',
    credits: { cast: people, crew: [{ id: 0, job: 'Director', name: 'Director name' }] }, aggregate_credits: { cast: people }, created_by: [{ id: 0, name: 'Creator name' }], networks: [{ name: 'Network' }],
    seasons: tv ? [1, 2, 3].map(n => ({ season_number: n, name: 'Season ' + n, episode_count: 10, air_date: '2024-01-01' })) : [] };
  let html;
  try { html = _tdBuildHTML(d, { avg: 8.1, count: 12 }, null); }
  finally { _tdType = was.type; _tdUser = was.user; document.title = was.title; }
  return html.replace(/ id="[^"]*"/g, '').replace(/class="(tv-tab[^"]*|tv-sec-h)"/g, 'class="$1" data-skel-keep');
});
