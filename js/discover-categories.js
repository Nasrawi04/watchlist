/* ══════════════════════════════════════════════════════════════
   discover-categories.js
   Single source of truth for every Discover page category:
   its key, side-nav label, section title, and how to fetch a
   page of results for it from TMDB. Add a new category by adding
   one entry to DISCOVER_CATEGORIES — both discover.html (preview
   row) and discover-list.html ("See All" page) read from here.
══════════════════════════════════════════════════════════════ */

const _ANIMATION_GENRE = 16;

function _discTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Truncates a score DOWN to one decimal place (never rounds up) —
// e.g. 8.15 -> "8.1", 8.98 -> "8.9". Used for every score badge across
// Discover, TMDB-sourced or MyScreenFolio's own, so the rule is
// consistent everywhere.
function _discFloorScore(score) {
  if (score == null || isNaN(score)) return null;
  return mssR1(score);   // (mssR1, config.js: also keeps 8.7 from turning into 8.6)
}

/* ── Official TMDB poster for a title ──
   Top Rated on MSF is built from users' own entries, so its poster was
   whatever that entry had (sometimes a custom upload or an odd crop).
   This looks up the title's official TMDB poster instead, keeping the
   answer on the device for 30 days so it's only fetched once. */
const _DISC_POSTER_STORE = 'mss_tmdb_posters_v1';
const _DISC_POSTER_TTL = 30 * 24 * 60 * 60 * 1000;
let _discPosterMem = null;
function _discPosterCache() {
  if (!_discPosterMem) { try { _discPosterMem = JSON.parse(localStorage.getItem(_DISC_POSTER_STORE) || '{}'); } catch { _discPosterMem = {}; } }
  return _discPosterMem;
}
let _discPosterSaveTimer = null;
function _discPosterSave() {
  clearTimeout(_discPosterSaveTimer);
  _discPosterSaveTimer = setTimeout(() => { try { localStorage.setItem(_DISC_POSTER_STORE, JSON.stringify(_discPosterMem)); } catch {} }, 300);
}
// → { poster, overview, backdrop_path, score, votes } from the title's TMDB page (kept 30 days with the poster;
//   an entry saved before the overview was kept is asked again once). Top Rated on MSF's list rows use the rest.
async function _discOfficialDetails(type, id) {
  if (!type || !id) return null;
  const key = `${type}:${id}`, cache = _discPosterCache(), hit = cache[key];
  const out = h => ({ poster: h.p ? TMDB_FULL + h.p : null, overview: h.o || '', backdrop_path: h.b || null, score: h.va || null, votes: h.vc || 0 });
  if (hit && 'o' in hit && Date.now() - hit.t < _DISC_POSTER_TTL) return out(hit);
  try {
    const res = await tmdbFetch(`${TMDB_BASE}/${type}/${id}?language=en-US`);
    if (!res.ok) return hit ? out(hit) : null;
    const d = await res.json();
    cache[key] = { p: d.poster_path || null, o: (d.overview || '').slice(0, 420), b: d.backdrop_path || null,
      va: typeof d.vote_average === 'number' && d.vote_average > 0 ? d.vote_average : null, vc: d.vote_count || 0, t: Date.now() };
    _discPosterSave();
    return out(cache[key]);
  } catch { return hit ? out(hit) : null; }
}
async function _discOfficialPoster(type, id) { return (await _discOfficialDetails(type, id))?.poster || null; }

// Normalizes a raw TMDB result (movie or tv) into the shape every
// Discover card expects: { id, media_type, title, poster_url, year, score, origin_country }
function _discNormalize(r, mediaType) {
  const isMovie = mediaType === 'movie';
  return {
    id: r.id,
    media_type: mediaType,
    title: isMovie ? r.title : r.name,
    poster_url: r.poster_path ? TMDB_FULL + r.poster_path : null,
    year: ((isMovie ? r.release_date : r.first_air_date) || '').split('-')[0],
    score: typeof r.vote_average === 'number' && r.vote_average > 0 ? r.vote_average : null,
    origin_country: r.origin_country || [],
    original_language: r.original_language || '',
    genre_ids: r.genre_ids || [],
    genres: mssGenreNames(r.genre_ids),
    overview: r.overview || '',
    votes: r.vote_count || 0,
    backdrop_path: r.backdrop_path || null,
  };
}

// "Is this anime" — origin_country alone isn't reliable for this.
// It's a solidly-populated field for TV, but movies don't consistently
// carry it the same way, so an anime MOVIE (Demon Slayer's film
// entries, Ghibli films, etc.) can silently read as having no JP
// origin at all and slip through as if it weren't anime. original_
// language is always populated for both movies and TV, so checking
// BOTH signals actually catches anime movies reliably.
function _discIsAnimeOrigin(it) {
  return (it.origin_country || []).includes('JP') || it.original_language === 'ja';
}

// Genre + origin alone can't tell "family cartoon" from "adult animated
// show/movie" — Arcane, Rick and Morty, and Invincible are all Western
// Animation-genre TV with a non-JP origin, exactly like something
// genuinely kid-oriented, but they're TV-14/TV-MA content and should
// read (and be categorized) as ordinary TV, not cartoons. Same idea
// for movies (an R-rated animated film isn't what "cartoon" means
// here either). TMDB's search/discover results don't include content
// rating at all, so this needs a live lookup per title — cached so
// the same one is never re-checked twice in a session.
const _discMaturityCache = {};

async function _discIsMatureAnimation(id, mediaType) {
  const cacheKey = mediaType + ':' + id;
  if (cacheKey in _discMaturityCache) return _discMaturityCache[cacheKey];
  try {
    let mature = false;
    if (mediaType === 'tv') {
      const data = await _discFetchJSON(`${TMDB_BASE}/tv/${id}/content_ratings`);
      const us = (data.results || []).find(r => r.iso_3166_1 === 'US');
      mature = us ? (us.rating === 'TV-MA' || us.rating === 'TV-14') : false;
    } else {
      const data = await _discFetchJSON(`${TMDB_BASE}/movie/${id}/release_dates`);
      const us = (data.results || []).find(r => r.iso_3166_1 === 'US');
      const cert = us?.release_dates?.find(rd => rd.certification)?.certification || '';
      mature = ['PG-13', 'R', 'NC-17'].includes(cert);
    }
    _discMaturityCache[cacheKey] = mature;
    return mature;
  } catch (e) {
    _discMaturityCache[cacheKey] = false;
    return false;
  }
}

// Wraps _discNormalize with the maturity check. Only computed for
// WESTERN animation, on purpose — anime is excluded from the general
// lists unconditionally regardless of maturity (see below), so there's
// nothing to check for it; only cartoons need this to decide "family
// (stays a cartoon)" vs "mature (belongs in the general lists)".
async function _discNormalizeChecked(r, mediaType) {
  const item = _discNormalize(r, mediaType);
  const isAnimated = item.genre_ids.includes(_ANIMATION_GENRE);
  const isAnime = _discIsAnimeOrigin(item);
  if (isAnimated && !isAnime) {
    item.is_mature_animation = await _discIsMatureAnimation(item.id, mediaType);
  }
  return item;
}
// Old name kept as an alias — every existing call site already uses it.
const _discNormalizeTv = (r) => _discNormalizeChecked(r, 'tv');

// Removes animated content from a general (non-Anime/Cartoons)
// category's results. Anime is ALWAYS excluded here regardless of
// maturity — "anime" is a medium label, not a maturity tier, so ALL
// anime belongs in Top 250 Anime, never in the general Movies/Shows
// lists (this is exactly what fixes Demon Slayer showing up in Top
// 250 Movies). Western animation is only excluded when it's genuinely
// family content — mature Western animation (Arcane, etc.) stays in
// the general lists, since that's where it belongs.
function _discExcludeFamilyAnimation(items) {
  return items.filter(it => {
    const isAnimated = (it.genre_ids || []).includes(_ANIMATION_GENRE);
    if (!isAnimated) return true;
    const isAnime = _discIsAnimeOrigin(it);
    if (isAnime) return false;
    return it.is_mature_animation === true;
  });
}

async function _discFetchJSON(url) {
  const res = await tmdbFetch(url);
  if (!res.ok) throw new Error('TMDB fetch failed: ' + res.status);
  return res.json();
}

// Interleaves two already-fetched arrays (e.g. movies + tv) so a merged
// list doesn't just show all of one type followed by all of the other.
function _discInterleave(a, b) {
  const merged = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) { if (a[i]) merged.push(a[i]); if (b[i]) merged.push(b[i]); }
  return merged;
}

// For categories branded as a ranking (Top 250 Cartoons/Anime, mixing
// movies+TV) — each half arrives pre-sorted by score from TMDB, but
// interleaving them by type ignores score entirely once merged, so a
// lower-scored movie can land ahead of a higher-scored show. This
// merges both halves into one list genuinely sorted by score.
function _discMergeByScore(a, b) {
  return [...a, ...b].sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
}

// Click handler for a Discover card. If we have a real TMDB id, route
// straight to title.html as usual. If not (e.g. a MyScreenFolio-rated
// title where nobody has linked it to TMDB yet), open a popup letting
// the user search TMDB and pick the right match — selecting one links
// it for every user who rated that title, not just whoever clicked.
// HTML-attribute-escapes a JSON-stringified value for safe embedding
// inside a single-quoted onclick="" attribute — JSON.stringify only
// escapes for JS syntax, not HTML, so a raw apostrophe in a title
// (e.g. "Marvel's Daredevil") would otherwise terminate the attribute
// early and silently break the click handler.
function _discAttrJSON(value) {
  return JSON.stringify(value).replace(/'/g, '&#39;');
}

// Tapping a Discover title opens the shared info popup (info-popup.js)
// instead of jumping straight to title.html. Items are kept in a small map
// so the popup gets the full item without stuffing it into the markup.
window._discItemMap = window._discItemMap || {};
// lock: search results show mature titles locked for 13–17 accounts; everywhere
// else (Discover, recommendations, related) they're left out (MSSAge, 088)
// A season / episode card's second line: "One Piece · S1 E3" (MSSCard's `sub`)
const _discSubHTML = it => it.sub ? `<span translate="no">${escHTML(it.sub)}</span>` : '';
// A TMDB item as the card wants it: its TMDB score floored to 1 decimal (as before)
const _discCardItem = it => ({ ...it, score: _discFloorScore(it.score) });
function _discClickAttr(it, lock) {
  if (it.href) return `onclick="location.href=${escHTML(JSON.stringify(it.href))}"` + MSSAge.attr('tv', it.show_id, !lock);   // a season / episode → its page
  if (it.id != null && it.media_type) {
    const key = `${it.media_type}:${it.id}`;
    window._discItemMap[key] = it;
    return (typeof MSSInfo !== 'undefined'
      ? `onclick="MSSInfo.fromDiscover(window._discItemMap['${key}'])"`
      : `onclick="goToTitle('${it.media_type}', ${it.id})"`) + MSSAge.attr(it.media_type, it.id, !lock);
  }
  return `onclick='_discOpenLinkPopup(${_discAttrJSON(it.title || '')}, ${_discAttrJSON(it.derived_type || 'tv')})'`;
}

/* ── Link to TMDB for unlinked MyScreenFolio titles: a side panel S (full page on phones),
   the same search field and result rows as Create card's (mssRowHTML) ── */
let _discLinkSearchTimer = null;
let _discLinkContext = null; // { title, derivedType }
let _discLinkPanel = null;

async function _discOpenLinkPopup(title, derivedType) {
  _discLinkContext = { title, derivedType };
  await mssLoadScript('js/panel.js');
  const h = MSSPanel.open({ size: 'S', kind: 'generic', title: 'Link to TMDB',
    body: `<p class="lyr-hint disc-link-sub">${escHTML(`Find the correct TMDB match for "${title}" to combine everyone's ratings into one score.`)}</p>
      <div class="lyr-search"><span class="lyr-search-ic" aria-hidden="true">${icon('search', 16)}</span>
        <input class="lyr-field" id="discLinkSearchInput" placeholder="Search for the right title…" aria-label="Search for the right title" autocomplete="off" enterkeyhint="search"></div>
      <div id="discLinkResults" aria-live="polite"></div>`,
    onClose: () => { if (_discLinkPanel === h) _discLinkPanel = null; } });
  _discLinkPanel = h;
  const input = document.getElementById('discLinkSearchInput');
  input.value = title;
  input.addEventListener('input', () => { clearTimeout(_discLinkSearchTimer); _discLinkSearchTimer = setTimeout(_discRunLinkSearch, MSS_SEARCH_MS); });
  _discRunLinkSearch();
}

function _discCloseLinkPopup() { _discLinkPanel?.closeNow(); }

async function _discRunLinkSearch() {
  const input = document.getElementById('discLinkSearchInput');
  const resultsEl = document.getElementById('discLinkResults');
  if (!input || !resultsEl) return;
  const query = input.value.trim();
  if (query.length < 2) { resultsEl.innerHTML = ''; return; }
  resultsEl.innerHTML = '<p class="lyr-rows-msg">Searching…</p>';

  const mediaType = _discLinkContext?.derivedType === 'movie' ? 'movie' : 'tv';
  try {
    const data = await _discFetchJSON(`${TMDB_BASE}/search/${mediaType}?language=en-US&query=${encodeURIComponent(query)}`);
    if (input.value.trim() !== query) return;      // a newer search is on its way
    const results = (data.results || []).slice(0, 8);
    if (!results.length) { resultsEl.innerHTML = '<p class="lyr-rows-msg">No matches found.</p>'; return; }
    resultsEl.innerHTML = `<ul class="lyr-rows">${results.map(r => { const title = (mediaType === 'movie' ? r.title : r.name) || 'Untitled';
      const year = ((mediaType === 'movie' ? r.release_date : r.first_air_date) || '').split('-')[0];
      return mssRowHTML({ img: r.poster_path ? TMDB_IMG + r.poster_path : null, title, sub: (mediaType === 'movie' ? 'Movie' : 'TV Show') + (year ? ' · ' + year : ''),
        attrs: `onclick='_discSelectLinkResult(${Number(r.id)}, ${JSON.stringify(mediaType)})'` }); }).join('')}</ul>`;
  } catch (err) {
    console.error('Discover link search error:', err);
    resultsEl.innerHTML = '<p class="lyr-rows-msg">Search failed — try again.</p>';
  }
}

async function _discSelectLinkResult(tmdbId, tmdbType) {
  if (!_discLinkContext) return;
  const { title, derivedType } = _discLinkContext;
  try {
    const { data, error } = await sb.rpc('link_entries_to_tmdb', {
      p_norm_title: title,
      p_derived_type: derivedType,
      p_tmdb_id: tmdbId,
      p_tmdb_type: tmdbType,
    });
    if (error) throw error;
    if (typeof showToast === 'function') showToast(`Linked — updated ${data} ${data === 1 ? 'entry' : 'entries'}.`);
    _discCloseLinkPopup();
    // Go straight to the newly-linked title instead of staying on this
    // page — that's what the user was trying to reach in the first place.
    goToTitle(tmdbType, tmdbId);
  } catch (err) {
    console.error('Link entries error:', err);
    if (typeof showToast === 'function') {
      showToast(isRateLimitError(err)
        ? "You've linked a lot of titles recently — please try again later."
        : 'Failed to link — try again.', 'err');
    }
  }
}

/* ── Highest-rated seasons and episodes (TMDB scores only) ──
   TMDB has no list of top episodes or seasons across shows, so one is worked out from TMDB's 200
   best-scored shows with more than 900 votes on the show itself (their seasons, up to 20 each).
   It's worked out once a week for everyone: the tmdb Edge Function (/top-eps) saves it in
   public.tmdb_cache ("msf:top_eps", 076), and every visitor reads that row. Only the very first
   visitor of the week with no list at all waits, with a progress bar everyone shares; when last
   week's list is there it shows straight away while the new one is worked out. If the function
   can't do it, the device works it out itself (~210 requests, 6 at a time), as before.
   Minimum votes keep tiny samples out: an episode needs 20, a season 50 across its episodes.
     await MSSTopEps.get()  → { seasons: [...], episodes: [...] }, best first (cached)
     await MSSTopEps.peek() → the same when it's already on this device or saved for everyone, else null (never works it out)
     MSSTopEps.onProgress(fn) → fn(0…1) while it's being worked out */
const MSSTopEps = (() => {
  const STORE = 'mss_top_eps_v2', TTL = 7 * 864e5, SHOWS = 200, PER = 6, MIN_EP = 20, MIN_SEASON = 50, KEEP = 250, MIN_SHOW = 900;
  const listeners = new Set();
  let running = null, renewing = null;
  const tell = f => listeners.forEach(fn => { try { fn(f); } catch {} });
  const today = new Date().toISOString().slice(0, 10);
  function cached() {
    try { localStorage.removeItem('mss_top_eps_v1'); } catch {}   // the list from before the 900-vote rule: rebuilt, not reused
    try { const c = JSON.parse(localStorage.getItem(STORE) || 'null'); return c && Date.now() - c.t < TTL ? c : null; } catch { return null; }
  }
  async function build() {
    tell(0);
    // the shows: best score first, only ones with more than 900 votes (like Top 250 Shows, which asks for 1,000)
    const pages = await Promise.all(Array.from({ length: SHOWS / 20 }, (_, i) =>
      _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&sort_by=vote_average.desc&vote_count.gte=${MIN_SHOW + 1}&page=${i + 1}`).catch(() => ({ results: [] }))));
    const shows = pages.flatMap(d => d.results || []).filter(sh => (sh.vote_count || 0) > MIN_SHOW).slice(0, SHOWS);
    const seasons = [], episodes = [];
    let done = 0;
    for (let i = 0; i < shows.length; i += PER) {
      await Promise.all(shows.slice(i, i + PER).map(async sh => {
        try {
          const nums = Array.from({ length: 20 }, (_, k) => k + 1);   // TMDB's most per request
          // straight through TMDB's queue (nav.js), not the device's TMDB cache: these answers are big, and only the
          // short ranking below is kept. TMDB leaves out seasons a show doesn't have.
          const res = await _tmdbQueued(`${TMDB_BASE}/tv/${sh.id}?language=en-US&append_to_response=${nums.map(n => 'season/' + n).join(',')}`);
          if (!res.ok) throw new Error('TMDB ' + res.status);
          const d = await res.json();
          const base = { show_id: d.id, show: d.name, show_poster: d.poster_path, genre_ids: (d.genres || []).map(g => g.id), origin_country: d.origin_country };
          (d.seasons || []).filter(x => x.season_number > 0).forEach(x => {
            const full = d['season/' + x.season_number];
            const eps = (full?.episodes || []).slice().sort((a, b) => a.episode_number - b.episode_number);
            const votes = eps.reduce((t, e) => t + (e.vote_count || 0), 0);
            if (x.vote_average && votes >= MIN_SEASON && x.air_date && x.air_date <= today)
              seasons.push({ ...base, s: x.season_number, name: x.name, poster: x.poster_path, air: x.air_date, score: x.vote_average, votes, eps: x.episode_count });
            eps.forEach((e, idx) => {
              if ((e.vote_count || 0) >= MIN_EP && e.vote_average && e.air_date && e.air_date <= today)
                episodes.push({ ...base, s: x.season_number, n: idx + 1, abs: e.episode_number !== idx + 1 ? e.episode_number : null, name: e.name,
                  poster: x.poster_path, still: e.still_path, air: e.air_date, score: e.vote_average, votes: e.vote_count, overview: e.overview });
            });
          });
        } catch {}
        tell(0.05 + 0.95 * (++done / shows.length));
      }));
    }
    const best = (a, b) => b.score - a.score || b.votes - a.votes;
    const out = { t: Date.now(), seasons: seasons.sort(best).slice(0, KEEP), episodes: episodes.sort(best).slice(0, KEEP) };
    if (out.seasons.length || out.episodes.length) { try { localStorage.setItem(STORE, JSON.stringify(out)); } catch {} }
    tell(1);
    return out;
  }
  // The shared list (one row in public.tmdb_cache, readable by everyone)
  const row = async key => {
    try { const { data } = await sb.from('tmdb_cache').select('body,saved_at').eq('key', key).maybeSingle(); return data || null; } catch { return null; }
  };
  const keep = r => {
    const out = { t: Date.parse(r.saved_at), seasons: r.body.seasons || [], episodes: r.body.episodes || [] };
    try { localStorage.setItem(STORE, JSON.stringify(out)); } catch {}
    tell(1);
    return out;
  };
  const askFunction = () => fetch(`${TMDB_BASE}/top-eps`);
  async function shared() {
    const saved = await row('msf:top_eps');
    if (saved?.body) {
      if (Date.now() - Date.parse(saved.saved_at) >= TTL && !renewing) renewing = askFunction().catch(() => {});   // a week old: renewed for everyone (asked once a visit), this visit shows last week's
      return keep(saved);
    }
    const res = await askFunction();
    if (res.status === 200) { const b = await res.json(); if (Array.isArray(b.seasons) && b.saved_at) return keep({ body: b, saved_at: b.saved_at }); throw new Error('top-eps answer'); }
    if (res.status !== 202) throw new Error('top-eps ' + res.status);
    // Being worked out on the server: follow its progress until the list is saved (up to 4 minutes)
    tell(0.02);
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const done = await row('msf:top_eps');
      if (done?.body) return keep(done);
      const b = await row('msf:top_eps:build');
      if (b?.body?.total) tell(0.05 + 0.9 * b.body.done / b.body.total);
      else if (i >= 3) throw new Error('top-eps stopped');   // gone without a list: the device does it instead
    }
    throw new Error('top-eps took too long');
  }
  async function get() {
    const c = cached();
    if (c) return c;
    running = running || (typeof sb !== 'undefined' ? shared() : Promise.reject(new Error('no database')))
      .catch(err => { console.warn('Shared top seasons and episodes not available, working them out here:', err); return build(); })
      .finally(() => { running = null; });
    return running;
  }
  // for the Discover tiles' posters: only a list that's already there, never one worked out just for a tile
  async function peek() {
    const c = cached();
    if (c) return c;
    if (typeof sb === 'undefined') return null;
    const saved = await row('msf:top_eps');
    return saved?.body ? keep(saved) : null;
  }
  return { get, peek, onProgress: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
})();

// Their cards open the Season / Episode page (href); the show is what Hide from Results and age checks look at
function _discTopItem(x, kind) {
  const ep = kind === 'episode';
  return {
    id: `${x.show_id}:${x.s}${ep ? ':' + x.n : ''}`, media_type: 'tv', tmdb_id: x.show_id, show_id: x.show_id,
    title: ep ? x.name || `Episode ${x.n}` : x.show, year: (x.air || '').slice(0, 4), score: x.score,
    poster_url: (x.poster || x.show_poster) ? TMDB_FULL + (x.poster || x.show_poster) : null,
    sub: ep ? `${x.show} · S${x.s} E${x.n}` : `${mssSeasonLabel(x.s, x.name)} · ${x.eps} episodes`,
    overview: x.overview || '', genre_ids: x.genre_ids, genres: mssGenreNames(x.genre_ids || []), origin_country: x.origin_country, votes: x.votes || 0,
    href: ep ? `episode.html?show=${x.show_id}&s=${x.s}&e=${x.n}` : `season.html?show=${x.show_id}&s=${x.s}`,
  };
}
// While it's being worked out the first time: a progress bar in the row (Discover) or the page's grid (See All)
function _discTopProgress(key) {
  return MSSTopEps.onProgress(f => {
    const box = document.getElementById('discGrid-' + key) || (new URLSearchParams(location.search).get('list') === key ? document.getElementById('dlGrid') : null);
    if (!box) return;
    let bar = box.querySelector('.disc-top-progress');
    if (f >= 1) { bar?.remove(); return; }
    if (!bar) { box.querySelector('.page-loading')?.remove(); box.insertAdjacentHTML('afterbegin', `<div class="disc-top-progress" role="status"><span>Working out the top ${key === 'top_episodes' ? 'episodes' : 'seasons'} for everyone — only once a week…</span><i><u></u></i></div>`); bar = box.querySelector('.disc-top-progress'); }
    bar.querySelector('u').style.width = Math.round(f * 100) + '%';
  });
}
// A list's top three posters, kept for its Browse by list tile (Discover) and Home's Explore cards
function _discSaveTilePosters(key, items) {
  const posters = (items || []).map(it => it.poster_url).filter(u => safeURL(u)).slice(0, 3);
  if (!posters.length) return null;
  try { const all = JSON.parse(localStorage.getItem('mss_explore_posters_v1') || '{}'); all[key] = { t: Date.now(), posters }; localStorage.setItem('mss_explore_posters_v1', JSON.stringify(all)); } catch {}
  return posters;
}
// The first page of a list from what's already there (Discover's tile posters), or null
async function _discTopPeek(kind) {
  const d = await MSSTopEps.peek();
  return d ? (kind === 'episode' ? d.episodes : d.seasons).slice(0, 20).map(x => _discTopItem(x, kind)) : null;
}
async function _discTopPage(key, kind, page) {
  const off = _discTopProgress(key);
  try {
    const d = await MSSTopEps.get();
    return (kind === 'episode' ? d.episodes : d.seasons).slice((page - 1) * 20, page * 20).map(x => _discTopItem(x, kind));
  } finally { off(); document.querySelectorAll('.disc-top-progress').forEach(el => el.remove()); }
}

const DISCOVER_CATEGORIES = [
  {
    key: 'trending_week',
    navLabel: 'Trending This Week',
    title: 'Trending This Week',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/trending/all/week?language=en-US&page=${page}`);
      const raw = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');
      const items = await Promise.all(raw.map(r => _discNormalizeChecked(r, r.media_type)));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'popular',
    navLabel: "What's Popular",
    title: "What's Popular",
    async fetch(page) {
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/movie/popular?language=en-US&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/tv/popular?language=en-US&page=${page}`),
      ]);
      const movies = _discExcludeFamilyAnimation(await Promise.all((movData.results || []).map(r => _discNormalizeChecked(r, 'movie'))));
      const shows  = _discExcludeFamilyAnimation(await Promise.all((tvData.results || []).map(r => _discNormalizeTv(r))));
      return _discInterleave(movies, shows);
    }
  },
  {
    key: 'airing_today',
    navLabel: 'Airing Today',
    title: 'Airing Today',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/tv/airing_today?language=en-US&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'top_rated_mss', v: 2, max: 500,   // v2: rows carry the overview, backdrop and TMDB score · max: Sort & Filter load all 500 (not cap: the list stays open-ended)
    navLabel: 'Top Rated on MSF',
    title: 'Top Rated on MSF',
    // Sourced from our own users' ratings (final_score), not TMDB — see
    // get_top_rated_myscreenscore() in 011_top_rated_myscreenscore.sql.
    // Capped at the top 500 titles.
    async fetch(page) {
      const pageSize = 20;
      const offset = (page - 1) * pageSize;
      if (offset >= 500) return [];
      const limit = Math.min(pageSize, 500 - offset);
      const { data, error } = await sb.rpc('get_top_rated_myscreenscore', { p_limit: limit, p_offset: offset });
      if (error) { console.error('Top Rated (MyScreenFolio) fetch error:', error); return []; }
      // Linked titles use their official TMDB poster (cached); the entry's
      // own poster is only a fallback (unlinked titles, or TMDB has none).
      const official = await Promise.all((data || []).map(r =>
        r.tmdb_id ? _discOfficialDetails(r.tmdb_type || r.derived_type, r.tmdb_id) : null));
      return (data || []).map((r, i) => ({
        id: r.tmdb_id,
        // Falls back to derived_type (computed server-side from the
        // entry's own category — movies vs. everything else) whenever
        // tmdb_type itself is null. That fallback was already being
        // returned by the RPC and just never actually used here, so
        // every group with a null tmdb_type (common for older/unlinked
        // entries) rendered with a missing/wrong type tag instead.
        media_type: r.tmdb_type || r.derived_type,
        title: r.title,
        poster_url: official[i]?.poster || r.poster_url || null,
        overview: official[i]?.overview || '',               // the list rows' description, TMDB score and backdrop
        backdrop_path: official[i]?.backdrop_path || null,
        tmdb_score: official[i]?.score ?? null,
        votes: official[i]?.votes || 0,
        year: r.year || '',
        score: r.avg_score != null ? Number(r.avg_score) : null,
        // cat/genres come from 018_top_rated_mss_details.sql — used by the
        // Sort & Filter popup (Type / Genre / Year) on the See All page.
        cat: r.cat || (r.derived_type === 'movie' ? 'movies' : 'tv'),
        genres: Array.isArray(r.genres) ? r.genres : [],
        origin_country: [],
        needs_linking: !r.tmdb_id, // drives the linking popup instead of goToTitle
        derived_type: r.derived_type,
      }));
    }
  },
  {
    key: 'top250_movies',
    cap: 250, v: 2,   // v2: 5,000 votes (the Discover redesign) — brand-new releases can't jump the queue
    navLabel: 'Top 250 Movies',
    title: 'Top 250 Movies',
    // Uses discover (not /movie/top_rated) so we can require a real minimum
    // vote count — otherwise a handful of 10.0-rated titles with 3 votes
    // can outrank genuinely well-reviewed ones.
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/movie?language=en-US&sort_by=vote_average.desc&vote_count.gte=5000&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeChecked(r, 'movie')));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'top250_shows',
    cap: 250,
    navLabel: 'Top 250 Shows',
    title: 'Top 250 Shows',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items.filter(r => !_discIsAnimeOrigin(r)));
    }
  },
  {
    key: 'top250_anime',
    cap: 250,
    navLabel: 'Top 250 Anime',
    title: 'Top 250 Anime',
    async fetch(page) {
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?language=en-US&with_genres=${_ANIMATION_GENRE}&with_original_language=ja&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&with_genres=${_ANIMATION_GENRE}&with_origin_country=JP&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
      ]);
      const movies = (movData.results || []).map(r => _discNormalize(r, 'movie'));
      const shows  = (tvData.results || []).map(r => _discNormalize(r, 'tv'));
      return _discMergeByScore(movies, shows);
    }
  },
  {
    key: 'top250_cartoons',
    cap: 250,
    navLabel: 'Top 250 Cartoons',
    title: 'Top 250 Cartoons',
    async fetch(page) {
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=vote_average.desc&vote_count.gte=1000&page=${page}`),
      ]);
      // Mature Western animation (Arcane, Rick and Morty, Invincible,
      // etc.) isn't a "cartoon" in the sense this category means —
      // it belongs in the general Movies/Shows lists instead.
      const movies = (await Promise.all((movData.results || []).map(r => _discNormalizeChecked(r, 'movie'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      const shows = (await Promise.all((tvData.results || []).map(r => _discNormalizeChecked(r, 'tv'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      return _discMergeByScore(movies, shows);
    }
  },
  {
    key: 'top_seasons',
    cap: 250, lazy: true, v: 2,   // v: bumped when the ranking's rules change (2: shows over 900 votes)
    navLabel: 'Highest-Rated Seasons',
    title: 'Highest-Rated Seasons',
    // TMDB scores only, worked out from TMDB's top-rated shows (MSSTopEps)
    fetch: page => _discTopPage('top_seasons', 'season', page),
    peek: () => _discTopPeek('season'),
  },
  {
    key: 'top_episodes',
    cap: 250, lazy: true, v: 2,
    navLabel: 'Highest-Rated Episodes',
    title: 'Highest-Rated Episodes',
    fetch: page => _discTopPage('top_episodes', 'episode', page),
    peek: () => _discTopPeek('episode'),
  },
  {
    key: 'niche_movies',
    navLabel: 'Niche Movies',
    title: 'Niche Movies',
    // "Niche" = well-rated but not widely voted on — a hidden-gem signal
    // rather than raw popularity.
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/movie?language=en-US&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=300&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeChecked(r, 'movie')));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'niche_shows',
    navLabel: 'Niche Shows',
    title: 'Niche Shows',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&sort_by=vote_average.desc&vote_count.gte=50&vote_count.lte=300&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'upcoming_movies',
    navLabel: 'Upcoming Movies',
    title: 'Upcoming Movies',
    async fetch(page) {
      const data = await _discFetchJSON(`${TMDB_BASE}/movie/upcoming?language=en-US&region=US&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeChecked(r, 'movie')));
      return _discExcludeFamilyAnimation(items);
    }
  },
  {
    key: 'upcoming_tv',
    navLabel: 'Upcoming TV Shows',
    title: 'Upcoming TV Shows',
    async fetch(page) {
      const today = _discTodayStr();
      const data = await _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`);
      const items = await Promise.all((data.results || []).map(r => _discNormalizeTv(r)));
      return _discExcludeFamilyAnimation(items.filter(r => !_discIsAnimeOrigin(r))); // exclude anime, has its own row
    }
  },
  {
    key: 'upcoming_anime',
    navLabel: 'Upcoming Anime',
    title: 'Upcoming Anime',
    async fetch(page) {
      const today = _discTodayStr();
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?language=en-US&with_genres=${_ANIMATION_GENRE}&with_original_language=ja&sort_by=popularity.desc&primary_release_date.gte=${today}&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&with_genres=${_ANIMATION_GENRE}&with_origin_country=JP&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`),
      ]);
      const movies = (movData.results || []).map(r => _discNormalize(r, 'movie'));
      const shows  = (tvData.results || []).map(r => _discNormalize(r, 'tv'));
      return _discInterleave(movies, shows);
    }
  },
  {
    key: 'upcoming_cartoons',
    navLabel: 'Upcoming Cartoons',
    title: 'Upcoming Cartoons',
    async fetch(page) {
      const today = _discTodayStr();
      const [movData, tvData] = await Promise.all([
        _discFetchJSON(`${TMDB_BASE}/discover/movie?language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=popularity.desc&primary_release_date.gte=${today}&page=${page}`),
        _discFetchJSON(`${TMDB_BASE}/discover/tv?language=en-US&with_genres=${_ANIMATION_GENRE}&sort_by=popularity.desc&first_air_date.gte=${today}&page=${page}`),
      ]);
      const movies = (await Promise.all((movData.results || []).map(r => _discNormalizeChecked(r, 'movie'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      const shows = (await Promise.all((tvData.results || []).map(r => _discNormalizeChecked(r, 'tv'))))
        .filter(r => !_discIsAnimeOrigin(r) && !r.is_mature_animation);
      return _discInterleave(movies, shows);
    }
  },
];

/* ── What each list is, for the Discover redesign: its Browse by List tile and its list page ──
     eyebrow · tile (the tile's one-line description) · desc (the list page's) · a / b (the tile's colours —
     Home's Explore cards share them) · kind ('movie' | 'tv' | 'mixed': the Type filter and type tags) ·
     ranked (#1, #2… badges) · rotate (a list that changes all the time: its header rotates through the
     first five backdrops; the others wear their #1's) · minVotes (shown in the header) · more (under
     "More lists" on Discover) · mss (scores are MyScreenFolio's, not TMDB's) */
const DISCOVER_META = {
  trending_week:    { eyebrow: 'This week', tile: 'What everyone is watching', a: '#B0642A', b: '#331705', kind: 'mixed', ranked: true, rotate: true,
    desc: 'The movies and shows the whole world is watching most this week, refreshed every day.' },
  popular:          { eyebrow: 'Right now', tile: 'Popular right now', a: '#8A5A1C', b: '#2B1A08', kind: 'mixed', rotate: true,
    desc: 'What people are searching for, adding and talking about right now: movies and shows side by side.' },
  airing_today:     { eyebrow: 'Tonight', tile: 'New episodes today', a: '#1F6F78', b: '#0A2427', kind: 'tv', rotate: true,
    desc: 'Shows with a new episode out today, wherever you are in the world.' },
  top_rated_mss:    { eyebrow: 'Community', tile: 'Highest rated by members', a: '#2E7D32', b: '#0E2F14', kind: 'mixed', ranked: true, mss: true,
    desc: 'The titles MyScreenFolio members rate the highest, ranked by everyone’s scores combined.' },
  top250_movies:    { eyebrow: 'Ranked · Movies', tile: 'The best films ever', a: '#9C3D1C', b: '#2E1007', kind: 'movie', ranked: true, minVotes: 5000,
    desc: 'The best-rated films on TMDB with at least 5,000 votes, so brand-new releases can’t jump the queue.' },
  top250_shows:     { eyebrow: 'Ranked · TV', tile: 'The best TV ever', a: '#2F5F8A', b: '#0C1D2E', kind: 'tv', ranked: true, minVotes: 1000,
    desc: 'The best-rated shows on TMDB with at least 1,000 votes. Anime and family cartoons have lists of their own.' },
  top250_anime:     { eyebrow: 'Ranked · Anime', tile: 'The best anime', a: '#7A3E78', b: '#240F24', kind: 'mixed', ranked: true, minVotes: 1000,
    desc: 'The best-rated anime series and films on TMDB with at least 1,000 votes, in one ranking.' },
  top250_cartoons:  { eyebrow: 'Ranked · Cartoons', tile: 'The best animation', a: '#3F7A6E', b: '#0D2520', kind: 'mixed', ranked: true, minVotes: 1000,
    desc: 'The best-rated cartoons, series and films, with at least 1,000 votes on TMDB. Anime and adult animation are left out.' },
  niche_movies:     { eyebrow: 'Gems · Movies', tile: 'Loved, but barely seen', a: '#4A5A8C', b: '#141A30', kind: 'movie', ranked: true, minVotes: 50,
    desc: 'Films with glowing scores that almost nobody has rated yet: between 50 and 300 votes on TMDB.' },
  niche_shows:      { eyebrow: 'Gems · TV', tile: 'Hidden TV treasures', a: '#5B4A7A', b: '#1A1228', kind: 'tv', ranked: true, minVotes: 50,
    desc: 'Shows with glowing scores that almost nobody has rated yet: between 50 and 300 votes on TMDB.' },
  upcoming_movies:  { eyebrow: 'Soon · Movies', tile: 'Out soon in cinemas', a: '#A8452F', b: '#2F0F08', kind: 'movie', rotate: true,
    desc: 'Films coming to cinemas over the next few weeks, most anticipated first.' },
  upcoming_tv:      { eyebrow: 'Soon · TV', tile: 'New series on the way', a: '#2C6A8E', b: '#0B2030', kind: 'tv', rotate: true,
    desc: 'Brand-new series that haven’t premiered yet, most anticipated first.' },
  top_seasons:      { eyebrow: 'Ranked · Seasons', tile: 'The greatest single seasons', a: '#6B5A1E', b: '#221B06', kind: 'tv', ranked: true, more: true,
    desc: 'The best-rated seasons of TMDB’s top shows. A season needs 50 votes across its episodes, and its show more than 900.' },
  top_episodes:     { eyebrow: 'Ranked · Episodes', tile: 'The greatest single episodes', a: '#7A2F4A', b: '#250D17', kind: 'tv', ranked: true, more: true,
    desc: 'The best-rated episodes of TMDB’s top shows. An episode needs at least 20 votes, and its show more than 900.' },
  upcoming_anime:   { eyebrow: 'Soon · Anime', tile: 'Anime on the way', a: '#8A3F6A', b: '#2A0F20', kind: 'mixed', rotate: true, more: true,
    desc: 'Anime series and films that haven’t come out yet, most anticipated first.' },
  upcoming_cartoons:{ eyebrow: 'Soon · Cartoons', tile: 'Cartoons on the way', a: '#2F7A55', b: '#0B2618', kind: 'mixed', rotate: true, more: true,
    desc: 'Family animation, series and films, that hasn’t come out yet, most anticipated first.' },
  recommended:      { eyebrow: 'For you', tile: 'Based on your favourites', a: '#2E6B45', b: '#153C24', kind: 'mixed', ranked: false,
    desc: 'Titles TMDB recommends for the favourites on your profile, highest rated first.' },
};
const discoverMeta = key => DISCOVER_META[key] || { eyebrow: 'Discover', tile: '', a: '#2E6B45', b: '#153C24', kind: 'mixed', desc: '' };
// Anime / Cartoon / Movie / TV Show for a TMDB item (the Type filter on list and Browse pages)
function _discCatOf(it) {
  if (it.cat) return it.cat;
  const anim = (it.genre_ids || []).includes(_ANIMATION_GENRE) || (it.genres || []).includes('Animation');
  if (anim) return _discIsAnimeOrigin(it) ? 'anime' : 'cartoons';
  return it.media_type === 'movie' ? 'movies' : 'tv';
}

// "See All" arrow (Discover rows, home Recommended for You)
const _SEE_ALL_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

/* ══ Recommended for You — MSSRecs ══
   Built from every movie, TV show and anime in your profile favorites
   (Top Favorites, Top Picks and the Top 5 TV Shows / Movies / Anime):
   TMDB's recommendations for each one are pooled; a title several
   favorites point to weighs more (w). Anything already in your library is
   left out. No cartoons, either way: cartoon favorites aren't used, and
   cartoons (animation that isn't anime) are never recommended.
   Each favorite's list is kept a day on the device.
     MSSRecs.pool(entries, profile) → [{ it, w }]   (the home row draws from it)
     MSSRecs.category                              (discover-list.html "See All":
                                                    all of them, highest rated first)
   Not one of the Discover rows — it lives on the home page. */
const MSSRecs = (() => {
  const STORE = 'mss_recs_v3', TTL = 864e5, KEYS = ['top_picks', 'recommended', 'fav_tv', 'fav_movies', 'fav_anime'];
  async function recsOf(type, id, cache) {
    const key = `${type}:${id}`, hit = cache[key];
    if (hit && Date.now() - hit.t < TTL) return hit.items;
    const d = await _discFetchJSON(`${TMDB_BASE}/${type}/${id}/recommendations?language=en-US&page=1`);
    const items = [];
    (d.results || []).forEach(r => {
      if (r.media_type !== 'movie' && r.media_type !== 'tv') return;
      const it = _discNormalize(r, r.media_type);
      if (it.genre_ids.includes(_ANIMATION_GENRE) && !_discIsAnimeOrigin(it)) return;      // no cartoons
      items.push({ id: it.id, media_type: it.media_type, title: it.title, poster_url: it.poster_url, year: it.year, score: it.score,
        votes: r.vote_count || 0, genres: it.genres, overview: it.overview.slice(0, 300) });
    });
    cache[key] = { t: Date.now(), items };
    return items;
  }
  async function pool(entries, profile) {
    const byId = new Map(entries.map(e => [e.id, e]));
    const seeds = [], seen = new Set();
    KEYS.forEach(k => (Array.isArray(profile?.[k]) ? profile[k] : []).forEach(id => {
      const e = byId.get(id), type = e?.tmdb_type === 'movie' ? 'movie' : e?.tmdb_type === 'tv' ? 'tv' : null;
      if (!type || !e.tmdb_id || e.cat === 'cartoons' || seen.has(`${type}:${e.tmdb_id}`)) return;
      seen.add(`${type}:${e.tmdb_id}`); seeds.push({ type, id: e.tmdb_id });
    }));
    if (!seeds.length) return [];
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch {}
    const lists = [];
    for (let i = 0; i < seeds.length; i += 4)                    // a few at a time — easier on TMDB
      lists.push(...await Promise.all(seeds.slice(i, i + 4).map(s => recsOf(s.type, s.id, cache).catch(() => []))));
    const keep = {};
    seeds.forEach(s => { const k = `${s.type}:${s.id}`; if (cache[k]) keep[k] = cache[k]; });
    try { localStorage.setItem(STORE, JSON.stringify(keep)); } catch {}
    // higher on a favorite's list = more; on several lists = adds up
    const have = new Set(entries.filter(e => e.tmdb_id).map(e => `${e.tmdb_type}:${e.tmdb_id}`));
    const out = new Map();
    lists.forEach(items => items.forEach((it, i) => {
      const k = `${it.media_type}:${it.id}`;
      if (have.has(k) || seen.has(k)) return;
      const p = out.get(k) || { it, w: 0 };
      p.w += 1 + (20 - Math.min(i, 20)) / 20;
      out.set(k, p);
    }));
    return [...out.values()];
  }
  // All of them, highest TMDB rating first. Titles with under 50 votes go
  // after the rest (a 10/10 from three people isn't a real rating yet).
  let ranked = null;
  const category = {
    key: 'recommended',
    title: 'Recommended for You',
    href: 'discover-list.html?list=recommended&title=' + encodeURIComponent('Recommended for You'),
    backTo: 'index.html',
    emptyMsg: 'Pick favorites on your profile and recommendations based on them will show up here.',
    async fetch(page) {
      if (!ranked) {
        const user = await getCurrentUser();
        if (!user) return [];
        const [entries, profile] = await Promise.all([getEntries(user.id), getProfile(user.id)]);
        const sure = p => p.it.votes >= 50;
        ranked = (await pool(entries, profile)).sort((a, b) => (sure(b) - sure(a)) || ((b.it.score ?? 0) - (a.it.score ?? 0)) || (b.w - a.w)).map(p => p.it);
      }
      return ranked.slice((page - 1) * 20, page * 20);
    },
  };
  return { pool, category };
})();

function getDiscoverCategory(key) {
  return DISCOVER_CATEGORIES.find(c => c.key === key) || (key === MSSRecs.category.key ? MSSRecs.category : DISCOVER_CATEGORIES[0]);
}


/* ══ Live search results (index + Discover hero search) ══
   From the 2nd letter on, results appear right on the page as cards (same
   cards as Discover) instead of a dropdown, and the page's other sections
   step aside until the search is cleared. Titles open the info popup,
   people open their page.
     initInlineSearch('heroSearch', { hide: ['.xp', '#homeWatching'] })
   opts.live === false: the grid waits for the returned run() (Discover — the header-style dropdown shows while you type);
   emptying the box still clears it. → { run(q?) }
   opts.users: MyScreenFolio members first, in their own Users section (searchUsers, db.js) */
/* ── Hide from results: titles you already know about, in the site's Filter popup ──
   Only ever a view: nothing is deleted, and clearing the filter brings it all back.
     MSSHide.choice(test)            → the Filter section (signed in only)
     await MSSHide.load(fresh)       your library, kept until fresh asks again
     MSSHide.hides(type, id, value)  → is this title hidden by the ticked options? */
const MSSHide = (() => {
  const OPTIONS = [['watched', 'Watched'], ['library', 'In my library'], ['watchlist', 'On my watchlist'], ['rated', 'Already rated']];
  const TESTS = {
    watched: e => e.status === 'completed' || e.status === 'ongoing',
    library: () => true,
    watchlist: e => e.status === 'queue',
    rated: e => liveScore(e) != null,
  };
  let lib = null, loading = null;
  function load(fresh) {
    if (lib && !fresh) return Promise.resolve();
    return loading ||= (async () => {
      const u = await getCurrentUser();
      const rows = u ? await getEntries(u.id) : [];
      lib = new Map(rows.filter(e => e.tmdb_id && e.tmdb_type).map(e => [`${e.tmdb_type}:${e.tmdb_id}`, e]));
    })().finally(() => { loading = null; });
  }
  function hides(type, id, value) {
    const e = value && lib?.get(`${type}:${id}`);
    return !!e && String(value).split(',').some(k => TESTS[k]?.(e));
  }
  const choice = test => window._navUser ? [{ key: 'hide', label: 'Hide from Results', hint: '(pick any)', multi: true, options: OPTIONS, test }] : [];
  const describe = value => String(value).split(',').map(k => OPTIONS.find(o => o[0] === k)?.[1].toLowerCase()).filter(Boolean).join(', ');
  return { load, hides, choice, describe };
})();

function initInlineSearch(inputId, opts = {}) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const anchor = input.closest('.hero-search-wrap, .sf-search') || input;
  const box = document.createElement('section');
  box.className = 'inline-search';
  box.id = inputId + 'Results';
  box.setAttribute('aria-live', 'polite');
  box.hidden = true;
  anchor.insertAdjacentElement('afterend', box);
  const hide = (opts.hide || []).flatMap(sel => [...document.querySelectorAll(sel)]);
  let timer = null, seq = 0, lastQ = '';

  // ✕ inside the bar (shows once there's text) — clears it in one tap
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'hero-search-clear';
  clear.setAttribute('aria-label', 'Clear search');
  clear.innerHTML = icon('x', 16);
  clear.hidden = true;
  input.insertAdjacentElement('afterend', clear);
  const syncClear = () => { clear.hidden = !input.value; };
  clear.addEventListener('click', () => { input.value = ''; syncClear(); run(); input.focus(); syncRecent(); });

  const setSearching = on => {
    box.hidden = !on;
    hide.forEach(el => { el.style.display = on ? 'none' : ''; });
  };
  const esc = s => escHTML(s == null ? '' : String(s));

  // Same card as the Discover lists (discover-list.html): big poster with the
  // Movie / TV Show tag, full title + year, TMDB ★ score
  function cardHTML(r) {
    if (r.media_type === 'person') return MSSCard.poster({ cls: 'is-person', href: `person.html?id=${encodeURIComponent(r.id)}`, title: r.name,
      poster: r.profile_path ? TMDB_FULL + r.profile_path : null, meta: r.known_for_department || 'Person' });
    const it = _discNormalize(r, r.media_type);
    return MSSCard.tmdb(_discCardItem(it), { attrs: _discClickAttr(it, true) });
  }

  // opts.filter: the results get the Filter popup's Hide from Results (sort-filter.js)
  let shown = null;
  const hideValue = () => opts.filter ? SF.filterState('isr', 'all').choice?.hide || '' : '';
  function filterBtn() {
    if (!opts.filter || !window._navUser) return '';
    const n = SF.filterCount('isr', 'all');
    return `<div class="inline-search-filter">${SF.typeFilterButton("SF.openFilter('isr','all')", n ? `Filter (${n})` : 'Filter', n > 0)}</div>`;
  }
  // a member: their photo and name, @username under it → their profile
  const userCard = u => MSSCard.poster({ cls: 'is-person', href: `profile-view.html?id=${encodeURIComponent(u.id)}&u=${encodeURIComponent(u.username || '')}`,
    title: u.display_name || u.username, poster: safeURL(u.avatar_url) || null, meta: '@' + u.username });
  function drawResults() {
    const { q, results } = shown, users = shown.users || [], hide = hideValue();
    const list = results.filter(r => r.media_type === 'person' || !MSSHide.hides(r.media_type, r.id, hide));
    const hidden = results.length - list.length;
    box.innerHTML = `<div class="inline-search-head"><div class="section-eyebrow">Search</div>
        <div class="section-title" style="margin-bottom:0">Results for “${esc(q)}”</div>
        <div class="inline-search-count"><b>${list.length + users.length}</b> ${list.length + users.length === 1 ? 'result' : 'results'}${hidden ? ` · ${hidden} hidden` : ''}</div>${filterBtn()}</div>`
      + (users.length ? `<div class="section-eyebrow inline-search-sub">Users</div><div class="inline-search-grid msf-grid">${users.map(userCard).join('')}</div>`
          + (list.length ? `<div class="section-eyebrow inline-search-sub">Titles &amp; people</div>` : '') : '')
      + (list.length ? `<div class="inline-search-grid msf-grid">${list.map(cardHTML).join('')}</div>`
        : users.length ? ''
        : hidden ? mssEmpty({ art: 'filter', title: 'All of these are hidden', text: `Your filter hides ${hidden === 1 ? 'the only result' : `all ${hidden} results`}. They’re still there whenever you want them.`,
            actions: [{ label: 'Show them', icon: 'x', onclick: "SF.clearFilters('isr', 'all');SF.refresh('isr')", primary: true }] })
        : mssEmpty({ art: 'search', title: `No luck with “${q}”`, text: 'Check the spelling, or try the original title. TMDB knows a lot, but not everything.' }));
  }
  if (opts.filter) SF.register('isr', {
    base: () => [],
    render: async () => { await MSSHide.load(true).catch(() => {}); if (shown) drawResults(); },
    filters: () => [],
    choiceFilters: () => MSSHide.choice(),
  });

  /* ── Recent searches: on this device, separately for each account. A search counts once you
     settle on it (Enter, opening a result, or leaving the box), so half-typed words stay out. ── */
  const RECENT_MAX = 10;
  const recentKey = () => `mss_recent_search:${window._navUser?.id || 'guest'}`;
  const readRecent = () => { try { const a = JSON.parse(localStorage.getItem(recentKey()) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const writeRecent = a => { try { localStorage.setItem(recentKey(), JSON.stringify(a)); } catch {} };
  function remember(q) {
    const low = q.toLowerCase();
    writeRecent([q, ...readRecent().filter(x => x.toLowerCase() !== low)].slice(0, RECENT_MAX));
  }
  const recent = document.createElement('div');
  recent.className = 'hero-recent';
  recent.id = inputId + 'Recent';
  recent.hidden = true;
  anchor.insertAdjacentElement('afterend', recent);
  recent.addEventListener('mousedown', e => e.preventDefault());       // a click keeps the box focused
  function drawRecent() {
    const list = readRecent();
    if (!list.length) { recent.hidden = true; return; }
    recent.innerHTML = `<div class="hero-recent-h"><span id="${inputId}RecentH">Recent searches</span><button type="button" class="hero-recent-clear" data-all>Clear all</button></div>
      <ul aria-labelledby="${inputId}RecentH">${list.map(q => `<li><button type="button" class="hero-recent-pick" data-q="${esc(q)}">${icon('clock', 14)}<span translate="no">${esc(q)}</span></button>
        <button type="button" class="hero-recent-x" data-x="${esc(q)}" aria-label="Remove ${esc(q)} from recent searches">${icon('x', 14)}</button></li>`).join('')}</ul>`;
    recent.style.left = anchor.offsetLeft + 'px';
    recent.style.top = anchor.offsetTop + anchor.offsetHeight + 4 + 'px';
    recent.style.width = anchor.offsetWidth + 'px';
    recent.hidden = false;
    // Fits what's visible: above the phone's bottom bar and keyboard, scrolling inside if it must
    const vv = window.visualViewport, bar = document.querySelector('.bnav');
    const limit = Math.min(vv ? vv.offsetTop + vv.height : innerHeight, bar?.getClientRects().length ? bar.getBoundingClientRect().top : Infinity);
    recent.style.maxHeight = Math.max(160, limit - recent.getBoundingClientRect().top - 10) + 'px';
  }
  const syncRecent = () => { if (!input.value && document.activeElement === input) drawRecent(); else recent.hidden = true; };
  const movePick = (from, dir) => {
    const picks = [...recent.querySelectorAll('.hero-recent-pick')], i = picks.indexOf(from) + dir;
    (i < 0 ? input : picks[Math.min(i, picks.length - 1)]).focus();
  };
  recent.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.all != null) { writeRecent([]); recent.hidden = true; input.focus(); return; }
    if (b.dataset.x != null) { writeRecent(readRecent().filter(x => x !== b.dataset.x)); drawRecent(); input.focus(); return; }
    input.value = b.dataset.q; syncClear(); recent.hidden = true;
    remember(b.dataset.q); clearTimeout(timer); lastQ = ''; run();
    if (matchMedia('(pointer:coarse)').matches) input.blur();       // the phone keyboard goes, so the results show
  });
  recent.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); recent.hidden = true; input.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); movePick(e.target.closest('li')?.querySelector('.hero-recent-pick'), e.key === 'ArrowDown' ? 1 : -1); }
  });
  input.addEventListener('focus', syncRecent);
  input.addEventListener('click', syncRecent);
  input.addEventListener('blur', e => {
    if (recent.contains(e.relatedTarget)) return;
    recent.hidden = true;
    if (e.relatedTarget !== clear && shown?.results.length && shown.q === input.value.trim()) remember(shown.q);
  });
  recent.addEventListener('focusout', e => { if (e.relatedTarget !== input && !recent.contains(e.relatedTarget)) recent.hidden = true; });
  const redrawRecent = () => { if (!recent.hidden) drawRecent(); };
  window.addEventListener('resize', redrawRecent, { passive: true });
  window.addEventListener('scroll', redrawRecent, { passive: true });
  window.visualViewport?.addEventListener('resize', redrawRecent);
  box.addEventListener('click', e => { if (shown?.results.length && e.target.closest('.inline-search-grid')) remember(shown.q); }, true);

  let rememberNext = false;   // Enter was pressed before the results arrived
  async function run() {
    const q = input.value.trim();
    if (q.length < 2) { lastQ = ''; shown = null; setSearching(false); box.innerHTML = ''; return; }
    if (q === lastQ) return;
    lastQ = q;
    const my = ++seq;
    setSearching(true);
    box.innerHTML = `<div class="inline-search-head"><div class="section-eyebrow">Search</div><div class="section-title" style="margin-bottom:0">Results for “${esc(q)}”</div></div>
      <div class="page-loading" style="padding:2rem"><div class="spinner"></div></div>`;
    const [results, , users] = await Promise.all([_tmdbSearch(q, 20, opts.includePersons !== false), hideValue() ? MSSHide.load().catch(() => {}) : null,
      opts.users && typeof searchUsers === 'function' ? searchUsers(q, 12).catch(() => []) : []]);
    if (my !== seq) return;               // a newer search is already on the way
    shown = { q, results, users };
    drawResults();
    if (rememberNext && results.length) remember(q);
    rememberNext = false;
  }

  const live = opts.live !== false;
  input.addEventListener('input', () => { syncClear(); syncRecent(); clearTimeout(timer); if (live || input.value.trim().length < 2) timer = setTimeout(run, input.value.trim().length < 2 ? 0 : MSS_SEARCH_MS); });
  input.addEventListener('keydown', e => {
    if (!live && e.key === 'Enter') return;                            // the dropdown decides (a result, or the grid via run())
    if (e.key === 'ArrowDown' && !recent.hidden) { e.preventDefault(); recent.querySelector('.hero-recent-pick')?.focus(); return; }
    if (e.key === 'Escape') { if (!recent.hidden) { recent.hidden = true; return; } input.value = ''; syncClear(); run(); }
    if (e.key === 'Enter') {
      clearTimeout(timer);
      if (shown?.q === input.value.trim() && shown.results.length) remember(shown.q); else rememberNext = true;
      run();
    }
  });
  return {
    run(q) {
      if (q != null) input.value = q;
      syncClear(); recent.hidden = true; clearTimeout(timer); rememberNext = true;
      run();
    },
  };
}